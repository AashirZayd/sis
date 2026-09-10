import { describe, it, expect } from "vitest";
import {
  getFailureSignature,
  formatFailureSignature,
  normalizeErrorMessage,
  generateShrinkCandidates,
  getPayloadSize,
  shrinkFailurePayload,
} from "../src/shrinker/index.js";
import { extractCandidateFunction } from "../src/runtime/index.js";
import { parseModule } from "../src/parser/index.js";
import type { ActionExecutionResult, CandidateFunctionSource } from "../src/runtime/types.js";

describe("Shrinking Subsystem (Phase 6)", () => {
  describe("Failure Signature Extraction (signature.ts)", () => {
    it("extracts and normalizes deterministic signature for runtime errors", () => {
      const failure: ActionExecutionResult = {
        actionName: "myAction",
        payloadId: 1,
        category: "nullish",
        payloadDescription: "null input",
        payloadValue: null,
        status: "failed",
        executionMs: 3,
        wallTimeMs: 8,
        timeoutMs: 20,
        durationMs: 3,
        error: {
          name: "TypeError",
          message: "Cannot read properties of null (reading 'user') at Object.run (eval at <anonymous>:14:22)",
        },
      };

      const sig = getFailureSignature(failure);
      expect(sig.actionName).toBe("myAction");
      expect(sig.status).toBe("failed");
      expect(sig.errorName).toBe("TypeError");
      expect(sig.normalizedMessage).not.toContain("14:22");

      const formatted = formatFailureSignature(sig);
      expect(formatted).toBe("myAction|failed|TypeError|cannot read properties of null (reading 'user')");
    });

    it("normalizes timeout messages to ignore dynamic timeout durations", () => {
      const timeoutFailure: ActionExecutionResult = {
        actionName: "slowAction",
        payloadId: 2,
        category: "empty",
        payloadDescription: "empty string",
        payloadValue: "",
        status: "timeout",
        executionMs: 21,
        wallTimeMs: 26,
        timeoutMs: 20,
        durationMs: 21,
        error: {
          name: "TimeoutError",
          message: "Script execution timed out after 20ms",
        },
      };

      const sig = getFailureSignature(timeoutFailure);
      expect(sig.status).toBe("timeout");
      expect(sig.errorName).toBe("TimeoutError");
      expect(sig.normalizedMessage).toBe("script execution timed out");
    });

    it("differentiates signatures across error types and actions", () => {
      const sig1 = formatFailureSignature(
        getFailureSignature({
          actionName: "actionA",
          payloadId: 1,
          category: "numeric-extreme",
          payloadDescription: "NaN",
          payloadValue: NaN,
          status: "failed",
          executionMs: 1,
          wallTimeMs: 2,
          timeoutMs: 20,
          durationMs: 1,
          error: { name: "RangeError", message: "Out of range" },
        })
      );

      const sig2 = formatFailureSignature(
        getFailureSignature({
          actionName: "actionA",
          payloadId: 1,
          category: "numeric-extreme",
          payloadDescription: "NaN",
          payloadValue: NaN,
          status: "failed",
          executionMs: 1,
          wallTimeMs: 2,
          timeoutMs: 20,
          durationMs: 1,
          error: { name: "TypeError", message: "Out of range" },
        })
      );

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("Candidate Generation & Payload Size (candidates.ts)", () => {
    it("computes monotonic structural size metrics", () => {
      expect(getPayloadSize(null)).toBeLessThan(getPayloadSize("hello"));
      expect(getPayloadSize("")).toBeLessThan(getPayloadSize("long string here"));
      expect(getPayloadSize([])).toBeLessThan(getPayloadSize([1, 2, 3]));
      expect(getPayloadSize({})).toBeLessThan(getPayloadSize({ a: 1, b: 2 }));
      expect(getPayloadSize({ a: 1 })).toBeLessThan(getPayloadSize({ a: 1, b: { c: 3 } }));
    });

    it("generates reduced candidates for string values", () => {
      const candidates = generateShrinkCandidates("test_value");
      expect(candidates).toContain("");
      expect(candidates.some((c) => typeof c === "string" && c.length < "test_value".length)).toBe(true);
    });

    it("generates reduced candidates for number values", () => {
      const candidates = generateShrinkCandidates(42.8);
      expect(candidates).toContain(0);
      expect(candidates).toContain(1);
      expect(candidates).toContain(42);
    });

    it("generates reduced candidates for arrays", () => {
      const original = [10, 20, 30, 40];
      const candidates = generateShrinkCandidates(original);
      expect(candidates).toContainEqual([]);
      expect(candidates.some((c) => Array.isArray(c) && c.length === 2)).toBe(true);
      expect(candidates.some((c) => Array.isArray(c) && c.length === 1)).toBe(true);
    });

    it("generates delta-debugging property subsets for objects", () => {
      const original = { a: 1, b: "hello", c: true, d: [1, 2] };
      const candidates = generateShrinkCandidates(original);

      // Empty object
      expect(candidates).toContainEqual({});

      // Subsets of keys
      expect(candidates.some((c) => typeof c === "object" && c !== null && Object.keys(c).length === 1)).toBe(true);
      expect(candidates.some((c) => typeof c === "object" && c !== null && Object.keys(c).length === 2)).toBe(true);
    });
  });

  describe("Shrinking Engine (shrink.ts)", () => {
    it("minimizes complex payload while preserving failure signature", async () => {
      const source = `
        "use server";
        export async function fragileAction(payload: any) {
          if (!payload.user.settings.theme.primary) {
            throw new TypeError("Missing primary theme");
          }
          return { ok: true };
        }
      `;
      const parsed = await parseModule(source, { filename: "test.ts" });
      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0])!;

      // A large, complex failing payload with 5 extraneous properties
      const complexPayload = {
        user: {
          name: "Alice",
          id: 12345,
          settings: {
            notifications: true,
            theme: {
              secondary: "#fff",
              // primary is missing!
            },
          },
        },
        metadata: {
          requestId: "req-9999",
          clientVersion: "2.1.0",
          tags: ["alpha", "beta", "gamma"],
        },
        session: {
          token: "secret-token-value-xyz",
          expires: 99999999,
        },
      };

      const initialFailure: ActionExecutionResult = {
        actionName: "fragileAction",
        payloadId: 1,
        category: "deep-nested",
        payloadDescription: "Complex nested user config",
        payloadValue: complexPayload,
        status: "failed",
        executionMs: 2,
        wallTimeMs: 5,
        timeoutMs: 50,
        durationMs: 2,
        error: {
          name: "TypeError",
          message: "Missing primary theme",
        },
      };

      const result = await shrinkFailurePayload(candidate, initialFailure, {
        maxAttempts: 30,
        timeoutMs: 50,
      });

      expect(result.verified).toBe(true);
      expect(result.attempts).toBeGreaterThan(0);
      expect(result.statistics.reductionPercent).toBeGreaterThan(0);

      // The minimal reproducer must still fail with TypeError
      const minPayload = result.minimalPayload as any;
      expect(minPayload).toBeDefined();

      // Extraneous metadata and session properties should be removed
      expect(minPayload.metadata).toBeUndefined();
      expect(minPayload.session).toBeUndefined();
    });

    it("minimizes array-based failing payloads", async () => {
      const source = `
        "use server";
        export async function processItems(items: any) {
          if (!Array.isArray(items) || items.length === 0) {
            return { count: 0 };
          }
          for (const item of items) {
            if (item.value.length === 0) {
              throw new Error("Item value must not be empty");
            }
          }
          return { count: items.length };
        }
      `;
      const parsed = await parseModule(source, { filename: "test.ts" });
      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0])!;

      // 5 items, only one has empty value
      const failingItems = [
        { value: "valid-1" },
        { value: "valid-2" },
        { value: "" },
        { value: "valid-3" },
        { value: "valid-4" },
      ];

      const initialFailure: ActionExecutionResult = {
        actionName: "processItems",
        payloadId: 1,
        category: "empty",
        payloadDescription: "Items with empty element",
        payloadValue: failingItems,
        status: "failed",
        executionMs: 1,
        wallTimeMs: 3,
        timeoutMs: 50,
        durationMs: 1,
        error: {
          name: "Error",
          message: "Item value must not be empty",
        },
      };

      const result = await shrinkFailurePayload(candidate, initialFailure, {
        maxAttempts: 25,
        timeoutMs: 50,
      });

      expect(result.verified).toBe(true);
      expect(result.attempts).toBeGreaterThan(0);
      // Minimized items should have length 1: [{ value: "" }]
      const minPayload = result.minimalPayload as any[];
      expect(Array.isArray(minPayload)).toBe(true);
      expect(minPayload.length).toBe(1);
      expect(minPayload[0].value).toBe("");
    });

    it("respects maxAttempts budget", async () => {
      const source = `
        "use server";
        export async function deepAction(payload: any) {
          if (payload.a && payload.b && payload.c) {
            throw new Error("Tri-match failure");
          }
          return { ok: true };
        }
      `;
      const parsed = await parseModule(source, { filename: "test.ts" });
      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0])!;

      const initialFailure: ActionExecutionResult = {
        actionName: "deepAction",
        payloadId: 1,
        category: "deep-nested",
        payloadDescription: "Big object",
        payloadValue: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 },
        status: "failed",
        executionMs: 1,
        wallTimeMs: 3,
        timeoutMs: 50,
        durationMs: 1,
        error: {
          name: "Error",
          message: "Tri-match failure",
        },
      };

      const result = await shrinkFailurePayload(candidate, initialFailure, {
        maxAttempts: 3,
        timeoutMs: 50,
      });

      expect(result.attempts).toBeLessThanOrEqual(3);
    });

    it("rejects candidate if failure signature changes", async () => {
      const source = `
        "use server";
        export async function typeStrictAction(payload: any) {
          if (typeof payload === "number" && payload > 100) {
            throw new RangeError("Number exceeds limit");
          }
          if (payload === 0) {
            throw new TypeError("Zero not permitted");
          }
          return { ok: true };
        }
      `;
      const parsed = await parseModule(source, { filename: "test.ts" });
      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0])!;

      const initialFailure: ActionExecutionResult = {
        actionName: "typeStrictAction",
        payloadId: 1,
        category: "numeric-extreme",
        payloadDescription: "High number",
        payloadValue: 500,
        status: "failed",
        executionMs: 1,
        wallTimeMs: 3,
        timeoutMs: 50,
        durationMs: 1,
        error: {
          name: "RangeError",
          message: "Number exceeds limit",
        },
      };

      const result = await shrinkFailurePayload(candidate, initialFailure, {
        maxAttempts: 15,
        timeoutMs: 50,
      });

      // 0 triggers TypeError, so 0 must NOT be accepted as minimal reproducer for RangeError
      expect(result.verified).toBe(true);
      expect(result.signature).toContain("RangeError");
      expect(result.minimalPayload).not.toBe(0);
    });

    it("falls back to original payload when payload is already minimal", async () => {
      const source = `
        "use server";
        export async function nullFragile(payload: any) {
          return payload.trim();
        }
      `;
      const parsed = await parseModule(source, { filename: "test.ts" });
      const candidate = extractCandidateFunction(source, parsed, parsed.actions[0])!;

      const initialFailure: ActionExecutionResult = {
        actionName: "nullFragile",
        payloadId: 1,
        category: "nullish",
        payloadDescription: "Null input",
        payloadValue: null,
        status: "failed",
        executionMs: 1,
        wallTimeMs: 3,
        timeoutMs: 50,
        durationMs: 1,
        error: {
          name: "TypeError",
          message: "Cannot read properties of null (reading 'trim')",
        },
      };

      const result = await shrinkFailurePayload(candidate, initialFailure, {
        maxAttempts: 10,
        timeoutMs: 50,
      });

      expect(result.verified).toBe(true);
      expect(result.minimalPayload).toBeNull();
      expect(result.reductionRatio).toBe(0);
    });
  });
});
