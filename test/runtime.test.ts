import { describe, it, expect } from "vitest";
import { isPayloadTransferable } from "../src/runtime/compatibility.js";
import { runInIsolate } from "../src/runtime/worker.js";
import {
  extractCandidateFunction,
  executeCandidateAction,
  verifyRuntimeActions,
} from "../src/runtime/executor.js";
import { parseModule } from "../src/parser/index.js";
import type { CandidateFunctionSource } from "../src/runtime/types.js";
import type { GeneratedPayload } from "../src/payload/types.js";

describe("Runtime Subsystem", () => {
  describe("Payload Compatibility (src/runtime/compatibility.ts)", () => {
    it("classifies standard primitives as transferable", () => {
      expect(isPayloadTransferable(null).transferable).toBe(true);
      expect(isPayloadTransferable(undefined).transferable).toBe(true);
      expect(isPayloadTransferable("hello").transferable).toBe(true);
      expect(isPayloadTransferable("").transferable).toBe(true);
      expect(isPayloadTransferable(42).transferable).toBe(true);
      expect(isPayloadTransferable(0).transferable).toBe(true);
      expect(isPayloadTransferable(-0).transferable).toBe(true);
      expect(isPayloadTransferable(true).transferable).toBe(true);
      expect(isPayloadTransferable(false).transferable).toBe(true);
    });

    it("classifies IEEE 754 numeric extremes as transferable", () => {
      expect(isPayloadTransferable(NaN).transferable).toBe(true);
      expect(isPayloadTransferable(Infinity).transferable).toBe(true);
      expect(isPayloadTransferable(-Infinity).transferable).toBe(true);
      expect(isPayloadTransferable(Number.MAX_SAFE_INTEGER).transferable).toBe(true);
      expect(isPayloadTransferable(Number.MIN_SAFE_INTEGER).transferable).toBe(true);
    });

    it("classifies plain arrays and objects as transferable", () => {
      expect(isPayloadTransferable([]).transferable).toBe(true);
      expect(isPayloadTransferable([1, "a", false, null]).transferable).toBe(true);
      expect(isPayloadTransferable({}).transferable).toBe(true);
      expect(isPayloadTransferable({ a: 1, b: { c: "deep" } }).transferable).toBe(true);
    });

    it("classifies BigInt as unsupported", () => {
      const res = isPayloadTransferable(10n);
      expect(res.transferable).toBe(false);
      expect(res.reason).toContain("BigInt");
    });

    it("classifies Symbol as unsupported", () => {
      const res = isPayloadTransferable(Symbol("test"));
      expect(res.transferable).toBe(false);
      expect(res.reason).toContain("Symbol");
    });

    it("classifies Function as unsupported", () => {
      const res = isPayloadTransferable(() => {});
      expect(res.transferable).toBe(false);
      expect(res.reason).toContain("Function");
    });

    it("classifies circular object graphs as unsupported", () => {
      const cyclic: Record<string, unknown> = { name: "loop" };
      cyclic.self = cyclic;
      const res = isPayloadTransferable(cyclic);
      expect(res.transferable).toBe(false);
      expect(res.reason).toContain("Circular");
    });

    it("classifies Map and Set as unsupported", () => {
      expect(isPayloadTransferable(new Map()).transferable).toBe(false);
      expect(isPayloadTransferable(new Set()).transferable).toBe(false);
    });

    it("does not mutate payloads during compatibility checks", () => {
      const obj = { amount: 100, tags: ["a", "b"] };
      const originalCopy = JSON.stringify(obj);
      isPayloadTransferable(obj);
      expect(JSON.stringify(obj)).toBe(originalCopy);
    });
  });

  describe("Isolate Execution (src/runtime/worker.ts)", () => {
    const validCandidate: CandidateFunctionSource = {
      actionName: "executeTransfer",
      code: "async function executeTransfer(p) { return p.amount.toFixed(2); }",
      location: { file: "test.ts", line: 1, column: 1 },
    };

    it("executes supported candidate and returns passed status with duration", async () => {
      const result = await runInIsolate(validCandidate, { amount: 50 }, { timeoutMs: 100 });
      expect(result.status).toBe("passed");
      expect(result.durationMs).toBeGreaterThanOrEqual(1);
      expect(result.error).toBeUndefined();
    });

    it("captures runtime exception for fragile action with null", async () => {
      const result = await runInIsolate(validCandidate, null, { timeoutMs: 100 });
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("TypeError");
      expect(result.error?.message).toMatch(/Cannot read propert/i);
    });

    it("captures runtime exception for fragile action with empty object", async () => {
      const result = await runInIsolate(validCandidate, {}, { timeoutMs: 100 });
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error?.name).toBe("TypeError");
      expect(result.error?.message).toMatch(/toFixed/i);
    });

    it("enforces execution deadline and classifies infinite loop as timeout", async () => {
      const timeoutCandidate: CandidateFunctionSource = {
        actionName: "infiniteLoop",
        code: "async function infiniteLoop(p) { while(true) {} }",
        location: { file: "timeout.ts", line: 1, column: 1 },
      };

      const start = Date.now();
      const result = await runInIsolate(timeoutCandidate, {}, { timeoutMs: 20 });
      const elapsed = Date.now() - start;

      expect(result.status).toBe("timeout");
      expect(result.error?.name).toBe("TimeoutError");
      expect(result.error?.message).toContain("timed out");
      expect(result.timeoutMs).toBe(20);
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(result.executionMs);
      // Must not hang the test runner
      expect(elapsed).toBeLessThan(1000);
    });

    it("strictly isolates global environment (no process, require, or fs)", async () => {
      const leakCheckCandidate: CandidateFunctionSource = {
        actionName: "checkGlobals",
        code: `
          async function checkGlobals() {
            if (typeof process !== "undefined") throw new Error("process leaked");
            if (typeof require !== "undefined") throw new Error("require leaked");
            if (typeof fetch !== "undefined") throw new Error("fetch leaked");
            if (typeof fs !== "undefined") throw new Error("fs leaked");
            return true;
          }
        `,
        location: { file: "leak.ts", line: 1, column: 1 },
      };

      const result = await runInIsolate(leakCheckCandidate, {}, { timeoutMs: 100 });
      expect(result.status).toBe("passed");
    });

    it("executes multiple payloads sequentially without state leakage", async () => {
      const counterCandidate: CandidateFunctionSource = {
        actionName: "testState",
        code: `
          async function testState(p) {
            if (globalThis.__polluted) throw new Error("State leaked from previous execution");
            globalThis.__polluted = true;
            return p.val;
          }
        `,
        location: { file: "state.ts", line: 1, column: 1 },
      };

      const res1 = await runInIsolate(counterCandidate, { val: 1 });
      expect(res1.status).toBe("passed");

      const res2 = await runInIsolate(counterCandidate, { val: 2 });
      expect(res2.status).toBe("passed");
    });
  });

  describe("Executor & Candidate Extraction (src/runtime/executor.ts)", () => {
    it("extracts and transforms TypeScript candidate action function", async () => {
      const source = `
        "use server";
        export async function transferFunds(input: { amount: number }): Promise<string> {
          return input.amount.toFixed(2);
        }
      `;
      const parsed = await parseModule(source, { filename: "transfer.ts" });
      expect(parsed.actions.length).toBe(1);

      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0]);
      expect(candidate).not.toBeNull();
      expect(candidate?.actionName).toBe("transferFunds");
      // TypeScript annotations must be stripped in transformed code
      expect(candidate?.code).not.toContain(": { amount: number }");
      expect(candidate?.code).not.toContain("Promise<string>");
    });

    it("executes candidate against synthesized payloads and aggregates summary", async () => {
      const source = `
        "use server";
        export async function executeTransfer(payload: { amount: number }) {
          return payload.amount.toFixed(2);
        }
      `;
      const parsed = await parseModule(source, { filename: "action.ts" });

      const payloads: GeneratedPayload[] = [
        { category: "numeric-extreme", value: { amount: 100 }, description: "valid amount" },
        { category: "nullish", value: null, description: "null input" },
        { category: "serialization-trap", value: () => {}, description: "function input" },
      ];

      const summary = await verifyRuntimeActions(source, parsed, payloads, { timeoutMs: 50 });

      expect(summary.executed).toBe(2); // 1 passed, 1 failed
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.unsupported).toBe(1); // function is unsupported
      expect(summary.executions.length).toBe(3);
    });
  });

  describe("Execution Budget & Wall Time Semantics", () => {
    it("measures executionMs strictly inside isolate while wallTimeMs accounts for setup", async () => {
      const fastCandidate: CandidateFunctionSource = {
        actionName: "fastAction",
        code: "async function fastAction(_payload) { return 42; }",
        location: { file: "fast.ts", line: 1, column: 1 },
      };

      const result = await runInIsolate(fastCandidate, {}, { timeoutMs: 20 });
      expect(result.status).toBe("passed");
      expect(result.timeoutMs).toBe(20);
      expect(result.executionMs).toBeLessThanOrEqual(20);
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(result.executionMs);
    });

    it("verifies timeout budget applies strictly to candidate execution", async () => {
      const hangingCandidate: CandidateFunctionSource = {
        actionName: "hangingAction",
        code: "async function hangingAction(_payload) { while(true) {} }",
        location: { file: "hanging.ts", line: 1, column: 1 },
      };

      const result = await runInIsolate(hangingCandidate, {}, { timeoutMs: 20 });
      expect(result.status).toBe("timeout");
      expect(result.timeoutMs).toBe(20);
      expect(result.executionMs).toBeGreaterThanOrEqual(15);
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(result.executionMs);
    });
  });
});
