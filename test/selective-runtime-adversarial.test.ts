import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import { AuditEngine } from "../src/index.js";
import { analyzeActionPrefix } from "../src/runtime/prefix.js";
import { extractCandidateFunction } from "../src/runtime/executor.js";
import { runInIsolate } from "../src/runtime/worker.js";
import { isActionSandboxCompatible } from "../src/runtime/compatibility.js";
import {
  isPreludeSupported,
  getPreludesCode,
  PRELUDE_REGISTRY,
} from "../src/runtime/preludes/index.js";

describe("Phase 25.5B — Adversarial Runtime Verification & Semantic Hardening", () => {
  // Helper to parse and extract action from code
  async function setupAction(code: string, actionName = "action") {
    const parsed = await parseModule(code, { filename: "test.ts" });
    const action = parsed.actions.find((a) => a.name === actionName);
    if (!action) {
      throw new Error(`Action ${actionName} not found in parsed module`);
    }
    const analysis = analyzeActionPrefix(
      parsed.ast.body.find((b) => b.type === "ExportDeclaration") ?? parsed.ast.body[0],
      parsed.ast,
      parsed.locator
    );
    const candidate = extractCandidateFunction(code, parsed, action);
    return { parsed, action, analysis, candidate };
  }

  describe("1. AST Probe Coverage (12 Verified Forensic Dimensions)", () => {
    it("1. destructuring is preserved in prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const { a } = payload;
          await db.save(a);
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(analysis.totalStatementsCount).toBe(2);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeDefined();
      expect(candidate?.code).toContain("const { a } = payload;");
      expect(candidate?.code).not.toContain("db.save");
      expect(candidate?.code).toContain("__sis_prefix_complete");

      const res = await runInIsolate(candidate!, { a: "test" });
      expect(res.status).toBe("passed");
    });

    it("2. nested destructuring with renaming and rest is preserved in prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const { a, b: { c: localC }, ...rest } = payload;
          await db.save({ a, localC, rest });
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeDefined();
      expect(candidate?.code).toContain("localC");
      expect(candidate?.code).not.toContain("db.save");

      const res = await runInIsolate(candidate!, { a: 1, b: { c: 2 }, d: 3 });
      expect(res.status).toBe("passed");
    });

    it("3. payload-derived values are verified in prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const clean = payload.value.toLowerCase().trim();
          await db.save(clean);
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(candidate).toBeDefined();

      const validRes = await runInIsolate(candidate!, { value: " HELLO " });
      expect(validRes.status).toBe("passed");

      const invalidRes = await runInIsolate(candidate!, null);
      expect(invalidRes.status).toBe("failed");
      expect(invalidRes.error?.name).toBe("TypeError");
    });

    it("4. direct unsupported dependency at statement 0 is classified as STATIC_ONLY", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const x = db.get();
          return x;
        }
      `;
      const { analysis, candidate, action } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
      expect(action.executionMode).toBe("STATIC_ONLY");
    });

    it("5. conditional expression containing unsupported dependency halts prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const x = payload.condition ? payload.value : db.get();
          return x;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("6. template literal containing unsupported dependency halts prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const x = \`\${db.prefix}\${payload.value}\`;
          return x;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("7. computed property containing unsupported dependency halts prefix", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const x = { [db.key]: payload.value };
          return x;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("8. nested arrow function containing unsupported dependency halts prefix conservatively", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const helper = () => db.get();
          return payload.value;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("9. compound try/finally containing unsupported dependency halts prefix conservatively", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          try {
            const x = payload.value;
            await db.get();
          } finally {
            console.log("cleanup");
          }
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("10. empty function body evaluates cleanly in FULL mode", async () => {
      const code = `
        "use server";
        export async function action(payload) {}
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("FULL");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(candidate).toBeDefined();

      const res = await runInIsolate(candidate!, {});
      expect(res.status).toBe("passed");
    });

    it("11. unsupported first statement classifies as STATIC_ONLY", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          await db.query();
          const x = payload.value;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
    });

    it("12. TypeScript type annotations are preserved and stripped without false dependency stops", async () => {
      const code = `
        "use server";
        export async function action(
          payload: { id: string; count?: number }
        ): Promise<{ ok: boolean }> {
          const id: string = payload.id.trim();
          await db.save(id);
          return { ok: true };
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeDefined();
      expect(candidate?.code).not.toContain("Promise<");
      expect(candidate?.code).not.toContain("id: string");

      const res = await runInIsolate(candidate!, { id: "item-123" });
      expect(res.status).toBe("passed");
    });
  });

  describe("2. Critical Boundary Regression (Mandatory Invariants)", () => {
    it("physically excises code after the boundary so post-boundary throw never executes", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const value = payload.value;
          await db.save(value);
          throw new Error("POST_BOUNDARY_EXECUTED");
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(analysis.totalStatementsCount).toBe(3);
      expect(analysis.stoppedAt?.dependency).toBe("db");

      // Critical invariant: Post-boundary statements are absent from generated AST
      expect(candidate).toBeDefined();
      expect(candidate?.code).not.toContain("POST_BOUNDARY_EXECUTED");
      expect(candidate?.code).not.toContain("db.save");
      expect(candidate?.code).toContain("__sis_prefix_complete");

      // Post-boundary throw CANNOT execute
      const res = await runInIsolate(candidate!, { value: "valid" });
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });

    it("prevents post-boundary global mutation from ever executing", async () => {
      const code = `
        "use server";
        export async function action(payload) {
          const value = payload.value;
          await db.save(value);
          globalThis.__POST_BOUNDARY = true;
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(candidate).toBeDefined();
      expect(candidate?.code).not.toContain("__POST_BOUNDARY");

      const res = await runInIsolate(candidate!, { value: "test" });
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });
  });

  describe("3. Default Parameter Invariant", () => {
    it("classifies action with unsupported default parameter as STATIC_ONLY and bypasses execution", async () => {
      const code = `
        "use server";
        export async function action(payload = db.get()) {
          const value = payload.value;
          return value;
        }
      `;
      const { analysis, candidate, action } = await setupAction(code);
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.prefixStatementsCount).toBe(0);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
      expect(action.executionMode).toBe("STATIC_ONLY");
    });
  });

  describe("4. Fail-Closed Helper Invariant (Coverage Limitation)", () => {
    it("fails closed when an unbundled module-scope helper is called in prefix", async () => {
      const code = `
        "use server";
        function validate(value) {
          return value.trim();
        }
        export async function action(payload) {
          const value = validate(payload.value);
          await db.save(value);
        }
      `;
      const { analysis, candidate } = await setupAction(code);
      expect(analysis.mode).toBe("PREFIX");
      expect(analysis.prefixStatementsCount).toBe(1);
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeDefined();

      // Running candidate in isolate: validate is not defined in isolate scope
      const res = await runInIsolate(candidate!, { value: "test" });
      // Invariant: Unhandled ReferenceError maps to "unsupported", NOT "failed"
      expect(res.status).toBe("unsupported");
      expect(res.error?.name).toBe("ReferenceError");
      expect(res.error?.message).toContain("validate is not defined");
    });
  });

  describe("5. Shadowing Invariant (Conservative Fails-Closed)", () => {
    it("conservatively classifies shadowed unsupported identifier as STATIC_ONLY", async () => {
      const code = `
        "use server";
        const db = {
          save(value) {
            return value;
          }
        };
        export async function action(payload) {
          const value = db.save(payload.value);
          return value;
        }
      `;
      const { analysis, candidate, action } = await setupAction(code);
      // STATIC_ONLY > unsound execution
      expect(analysis.mode).toBe("STATIC_ONLY");
      expect(analysis.stoppedAt?.dependency).toBe("db");
      expect(candidate).toBeNull();
      expect(action.executionMode).toBe("STATIC_ONLY");
    });
  });

  describe("6. Runtime Provenance Invariants", () => {
    it("reports executionMode: 'PREFIX', verifiedPrefix, and stoppedAt on runtime findings", async () => {
      const code = `
        "use server";
        export async function registerUser(data: { name: string; email: string }) {
          const cleanName = data.name.trim();
          const cleanEmail = data.email.toLowerCase();
          await db.user.create({ cleanName, cleanEmail });
          return { ok: true };
        }
      `;
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-provenance-test-"));
      try {
        const filePath = path.join(tempDir, "register.ts");
        fs.writeFileSync(filePath, code, "utf8");

        const engine = new AuditEngine({ runs: 10, seed: 42, silent: true });
        const result = await engine.run(filePath);

        expect(result.actions.length).toBe(1);
        const act = result.actions[0];
        expect(act.executionMode).toBe("PREFIX");
        expect(act.executionCompatibility).toBe("prefix-compatible");
        expect(act.stoppedAt?.dependency).toBe("db");
        expect(act.verifiedPrefix).toBeDefined();
        expect(act.verifiedPrefix?.startLine).toBeGreaterThan(0);
        expect(act.verifiedPrefix?.endLine).toBeGreaterThanOrEqual(act.verifiedPrefix?.startLine!);

        const prefixFindings = result.findings.filter((f) => f.executionMode === "PREFIX");
        expect(prefixFindings.length).toBeGreaterThan(0);
        const f = prefixFindings[0];
        expect(f.executionMode).toBe("PREFIX");
        expect(f.runtimeProvenance?.mode).toBe("PREFIX");
        expect(f.runtimeProvenance?.stoppedAt?.dependency).toBe("db");
        expect(f.runtimeProvenance?.verifiedPrefix).toEqual(act.verifiedPrefix);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("7. Prelude Framework Termination Smoke Tests", () => {
    it("redirect() terminates cleanly as framework flow control, not arbitrary failure", async () => {
      expect(isPreludeSupported("redirect")).toBe(true);
      const candidate = {
        actionName: "testRedirect",
        code: `
          async function testRedirect(payload) {
            if (payload.target) {
              redirect(payload.target);
            }
            return { ok: false };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["redirect"],
      };

      const res = await runInIsolate(candidate, { target: "/login" });
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });

    it("notFound() terminates cleanly as framework flow control, not arbitrary failure", async () => {
      expect(isPreludeSupported("notFound")).toBe(true);
      const candidate = {
        actionName: "testNotFound",
        code: `
          async function testNotFound(payload) {
            if (!payload.item) {
              notFound();
            }
            return { item: payload.item };
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: ["notFound"],
      };

      const res = await runInIsolate(candidate, {});
      expect(res.status).toBe("passed");
      expect(res.error).toBeUndefined();
    });

    it("distinguishes genuine runtime exceptions from controlled framework termination", async () => {
      const candidate = {
        actionName: "testError",
        code: `
          async function testError(payload) {
            throw new Error("GENUINE_APPLICATION_ERROR");
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: [],
      };

      const res = await runInIsolate(candidate, {});
      expect(res.status).toBe("failed");
      expect(res.error?.message).toContain("GENUINE_APPLICATION_ERROR");
    });
  });

  describe("8. Payload Integrity Invariant", () => {
    it("guarantees host caller payload is never mutated by isolate execution", async () => {
      const originalPayload = {
        user: {
          name: "Alice",
          roles: ["admin"],
          settings: { active: true },
        },
        items: [1, 2, 3],
        counter: 10,
      };

      const snapshotBefore = JSON.parse(JSON.stringify(originalPayload));

      const candidate = {
        actionName: "mutator",
        code: `
          async function mutator(payload) {
            payload.user.name = "MALICIOUS_MUTATION";
            payload.user.roles.push("attacker");
            delete payload.user.settings;
            payload.items.length = 0;
            payload.counter = 999;
            payload.injected = "attack";
            return payload;
          }
        `,
        location: { file: "test.ts", line: 1, column: 1 },
        preludesUsed: [],
      };

      const res = await runInIsolate(candidate, originalPayload);
      expect(res.status).toBe("passed");

      // Host-side payload must be 100% identical and unmutated
      expect(originalPayload).toEqual(snapshotBefore);
    });
  });

  describe("9. Determinism Across Repeated Runs", () => {
    it("produces identical semantic outputs across multiple executions", async () => {
      const code = `
        "use server";
        export async function action(payload: { token: string }) {
          const token = payload.token.trim();
          cookies().set("session", token);
          await db.session.save({ token });
          return { ok: true };
        }
      `;

      const run1 = await setupAction(code);
      const run2 = await setupAction(code);

      expect(run1.analysis.mode).toBe(run2.analysis.mode);
      expect(run1.analysis.prefixStatementsCount).toBe(run2.analysis.prefixStatementsCount);
      expect(run1.analysis.stoppedAt).toEqual(run2.analysis.stoppedAt);
      expect(run1.candidate?.code).toBe(run2.candidate?.code);

      const exec1 = await runInIsolate(run1.candidate!, { token: "abc-123" });
      const exec2 = await runInIsolate(run2.candidate!, { token: "abc-123" });

      expect(exec1.status).toBe(exec2.status);
      expect(exec1.status).toBe("passed");

      const fail1 = await runInIsolate(run1.candidate!, null);
      const fail2 = await runInIsolate(run2.candidate!, null);

      expect(fail1.status).toBe(fail2.status);
      expect(fail1.error?.name).toBe(fail2.error?.name);
      expect(fail1.error?.message).toBe(fail2.error?.message);
    });
  });
});
