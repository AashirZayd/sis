import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import { AuditEngine } from "../src/index.js";
import {
  cookiesPrelude,
  headersPrelude,
  redirectPrelude,
  notFoundPrelude,
  revalidatePathPrelude,
  revalidateTagPrelude,
  unstableNoStorePrelude,
  PRELUDE_REGISTRY,
  isPreludeSupported,
} from "../src/runtime/preludes/index.js";
import { extractCandidateFunction } from "../src/runtime/executor.js";
import { runInIsolate } from "../src/runtime/worker.js";

describe("Phase 25 — Selective Runtime Verification & Deterministic Preludes", () => {
  describe("1. Deterministic Prelude Contracts", () => {
    it("cookies() prelude implements in-memory ReadonlyRequestCookies methods", async () => {
      expect(isPreludeSupported("cookies")).toBe(true);
      const prelude = PRELUDE_REGISTRY.get("cookies");
      expect(prelude).toBeDefined();

      const candidate = {
        actionName: "testCookies",
        code: `
          async function testCookies(payload) {
            const store = cookies();
            store.set("session", payload.token);
            const hasSession = store.has("session");
            const sessionCookie = store.get("session");
            const all = store.getAll();
            const size = store.size;
            store.delete("session");
            const hasAfter = store.has("session");
            return { hasSession, sessionCookie, allLength: all.length, size, hasAfter };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["cookies"],
      };

      const res = await runInIsolate(candidate, { token: "secret-123" }, { timeoutMs: 100 });
      expect(res.status).toBe("passed");
    });

    it("headers() prelude provides case-insensitive matching and iteration", async () => {
      expect(isPreludeSupported("headers")).toBe(true);
      const candidate = {
        actionName: "testHeaders",
        code: `
          async function testHeaders(payload) {
            const h = headers();
            h.set("X-Custom-Auth", payload.auth);
            const val1 = h.get("x-custom-auth");
            const val2 = h.get("X-CUSTOM-AUTH");
            const hasHeader = h.has("x-custom-auth");
            return { match: val1 === val2, val1, hasHeader };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["headers"],
      };

      const res = await runInIsolate(candidate, { auth: "bearer-xyz" }, { timeoutMs: 100 });
      expect(res.status).toBe("passed");
    });

    it("redirect() prelude signals framework redirection and is intercepted cleanly as passed", async () => {
      expect(isPreludeSupported("redirect")).toBe(true);
      const candidate = {
        actionName: "testRedirect",
        code: `
          async function testRedirect(payload) {
            if (payload.userId) {
              redirect("/dashboard");
            }
            return { ok: false };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["redirect"],
      };

      const res = await runInIsolate(candidate, { userId: "user_42" }, { timeoutMs: 100 });
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });

    it("notFound() prelude signals framework 404 and is intercepted cleanly as passed", async () => {
      expect(isPreludeSupported("notFound")).toBe(true);
      const candidate = {
        actionName: "testNotFound",
        code: `
          async function testNotFound(payload) {
            if (!payload.id) {
              notFound();
            }
            return { id: payload.id };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["notFound"],
      };

      const res = await runInIsolate(candidate, {}, { timeoutMs: 100 });
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });

    it("revalidatePath, revalidateTag, and unstable_noStore execute as deterministic no-ops", async () => {
      expect(isPreludeSupported("revalidatePath")).toBe(true);
      expect(isPreludeSupported("revalidateTag")).toBe(true);
      expect(isPreludeSupported("unstable_noStore")).toBe(true);

      const candidate = {
        actionName: "testCachePreludes",
        code: `
          async function testCachePreludes(payload) {
            unstable_noStore();
            revalidatePath("/products");
            revalidateTag("cart");
            return { done: true };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["revalidatePath", "revalidateTag", "unstable_noStore"],
      };

      const res = await runInIsolate(candidate, {}, { timeoutMs: 100 });
      expect(res.status).toBe("passed");
    });
  });


  describe("2. Sandbox Isolation & Determinism", () => {
    it("strictly isolates from process, fs, and network globals", async () => {
      const candProcess = {
        actionName: "leakProcess",
        code: `
          async function leakProcess(payload) {
            return process.env.NODE_ENV;
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
      };
      const res1 = await runInIsolate(candProcess, {});
      expect(res1.status).toBe("unsupported");
      expect(res1.error?.name).toBe("ReferenceError");
      expect(res1.error?.message).toContain("process is not defined");

      const candFetch = {
        actionName: "leakFetch",
        code: `
          async function leakFetch(payload) {
            return fetch("http://example.com");
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
      };
      const res2 = await runInIsolate(candFetch, {});
      expect(res2.status).toBe("unsupported");
      expect(res2.error?.name).toBe("ReferenceError");
      expect(res2.error?.message).toContain("fetch is not defined");
    });

    it("evaluates deterministically across repeated executions", async () => {
      const candidate = {
        actionName: "detCheck",
        code: `
          async function detCheck(payload) {
            const h = headers();
            h.set("x-test", payload.val);
            return h.get("x-test");
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["headers"],
      };

      const runs = await Promise.all([
        runInIsolate(candidate, { val: "abc" }),
        runInIsolate(candidate, { val: "abc" }),
        runInIsolate(candidate, { val: "abc" }),
      ]);

      expect(runs[0].status).toBe("passed");
      expect(runs[1].status).toBe("passed");
      expect(runs[2].status).toBe("passed");
    });
  });

  describe("3. Prefix Analysis & AST Slicing", () => {
    it("identifies verifiable prefix when validation precedes unsupported database call", async () => {
      const code = `
        "use server";
        export async function updateUser(payload: { name: string; age: number }) {
          const name = payload.name.trim();
          const isAdult = payload.age >= 18;
          await db.user.update({ name, isAdult });
          return { success: true };
        }
      `;
      const parsed = await parseModule(code, { filename: "actions/user.ts" });
      const action = parsed.actions.find((a) => a.name === "updateUser");
      expect(action).toBeDefined();

      const candidate = extractCandidateFunction(code, parsed, action!);
      expect(candidate).toBeDefined();
      expect(candidate?.executionMode).toBe("PREFIX");
      expect(candidate?.stoppedAt?.dependency).toBe("db");
      expect(candidate?.stoppedAt?.reason).toBe("unsupported-runtime");
      expect(candidate?.verifiedPrefix).toBeDefined();
      expect(candidate?.code).toContain("__sis_prefix_complete");
      expect(candidate?.code).not.toContain("db.user.update");

      const validRes = await runInIsolate(candidate!, { name: "Alice", age: 25 }, { timeoutMs: 100 });
      expect(validRes.status).toBe("passed");

      const invalidRes = await runInIsolate(candidate!, null, { timeoutMs: 100 });
      expect(invalidRes.status).toBe("failed");
      expect(invalidRes.error?.name).toBe("TypeError");
      expect(invalidRes.error?.message).toContain("Cannot read properties of null");
    });


    it("classifies action as static-only when statement 0 references unsupported dependency", async () => {
      const code = `
        "use server";
        import { redis } from "@/lib/upstash";

        export async function flushCache(key: string) {
          await redis.del(key);
          return { done: true };
        }
      `;
      const parsed = await parseModule(code, { filename: "actions/cache.ts" });
      const action = parsed.actions.find((a) => a.name === "flushCache");
      expect(action).toBeDefined();

      const candidate = extractCandidateFunction(code, parsed, action!);
      expect(candidate).toBeNull();
      expect(action!.executionCompatibility).toBe("static-only");
      expect(action!.executionMode).toBe("STATIC_ONLY");
      expect(action!.stoppedAt?.dependency).toBe("redis");
    });

    it("classifies action as static-only when parameter default references host global", async () => {
      const code = `
        "use server";
        export async function doTask(config = process.env.TASK_CONFIG) {
          const cfg = JSON.parse(config);
          return cfg;
        }
      `;
      const parsed = await parseModule(code, { filename: "actions/task.ts" });
      const action = parsed.actions.find((a) => a.name === "doTask");
      expect(action).toBeDefined();

      const candidate = extractCandidateFunction(code, parsed, action!);
      expect(candidate).toBeNull();
      expect(action!.executionCompatibility).toBe("static-only");
      expect(action!.executionMode).toBe("STATIC_ONLY");
      expect(action!.stoppedAt?.dependency).toBe("process");
    });

    it("allows prelude calls in prefix before unsupported call", async () => {
      const code = `
        "use server";
        export async function logoutUser(formData: { userId: string }) {
          const id = formData.userId.trim();
          cookies().delete("auth-token");
          await db.sessions.deleteMany({ userId: id });
          redirect("/login");
        }
      `;
      const parsed = await parseModule(code, { filename: "actions/auth.ts" });
      const action = parsed.actions.find((a) => a.name === "logoutUser");
      expect(action).toBeDefined();

      const candidate = extractCandidateFunction(code, parsed, action!);
      expect(candidate).toBeDefined();
      expect(candidate?.executionMode).toBe("PREFIX");
      expect(candidate?.stoppedAt?.dependency).toBe("db");
      expect(candidate?.preludesUsed).toContain("cookies");

      const validRes = await runInIsolate(candidate!, { userId: "usr_999" }, { timeoutMs: 100 });
      expect(validRes.status).toBe("passed");

      const invalidRes = await runInIsolate(candidate!, null, { timeoutMs: 100 });
      expect(invalidRes.status).toBe("failed");
      expect(invalidRes.error?.name).toBe("TypeError");
    });

  });

  describe("4. End-to-End Audit & Provenance Verification", () => {
    it("reports executionMode: 'PREFIX', verifiedPrefix, and stoppedAt on runtime findings", async () => {
      const code = `
        "use server";
        export async function saveProfile(data: { username: string; email: string }) {
          const cleanName = data.username.toLowerCase();
          const cleanEmail = data.email.toLowerCase();
          await db.user.save({ cleanName, cleanEmail });
          return { ok: true };
        }
      `;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-selective-test-"));
      try {
        const filePath = path.join(tempDir, "profile.ts");
        fs.writeFileSync(filePath, code, "utf8");

        const engine = new AuditEngine({ runs: 10, seed: 42, silent: true });
        const result = await engine.run(filePath);

        expect(result.actions.length).toBe(1);
        expect(result.actions[0].executionCompatibility).toBe("prefix-compatible");
        expect(result.actions[0].executionMode).toBe("PREFIX");

        const prefixFindings = result.findings.filter((f) => f.executionMode === "PREFIX");
        expect(prefixFindings.length).toBeGreaterThan(0);

        const firstFinding = prefixFindings[0];
        expect(firstFinding.type).toBe("runtime-exception");
        expect(firstFinding.executionMode).toBe("PREFIX");
        expect(firstFinding.verifiedPrefix).toBeDefined();
        expect(firstFinding.verifiedPrefix?.startLine).toBeGreaterThan(0);
        expect(firstFinding.stoppedAt?.dependency).toBe("db");
        expect(firstFinding.runtimeProvenance).toBeDefined();
        expect(firstFinding.runtimeProvenance?.mode).toBe("PREFIX");
        expect(firstFinding.runtimeProvenance?.stoppedAt?.dependency).toBe("db");

        expect(result.statistics.prefixExecutions).toBeGreaterThan(0);
        expect(result.statistics.failedExecutions).toBeGreaterThan(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("vercel/commerce updateItemQuantity retains executionMode: 'FULL'", async () => {
      const code = `
        "use server";
        export async function updateItemQuantity(
          prevState: any,
          payload: { merchandiseId: string; quantity: number }
        ) {
          const { merchandiseId, quantity } = payload;
          return { merchandiseId, quantity };
        }
      `;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-selective-test-"));
      try {
        const filePath = path.join(tempDir, "actions.ts");
        fs.writeFileSync(filePath, code, "utf8");

        const engine = new AuditEngine({ runs: 10, seed: 42, silent: true });
        const result = await engine.run(filePath);

        expect(result.actions.length).toBe(1);
        expect(result.actions[0].executionCompatibility).toBe("sandbox-compatible");
        expect(result.actions[0].executionMode).toBe("FULL");

        const fullFindings = result.findings.filter((f) => f.executionMode === "FULL");
        expect(fullFindings.length).toBeGreaterThan(0);
        expect(fullFindings[0].runtimeProvenance?.mode).toBe("FULL");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
