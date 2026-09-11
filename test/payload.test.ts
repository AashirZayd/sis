import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  synthesizePayloads,
  formatPayloadValue,
  nullishArbitrary,
  emptyArbitrary,
  numericExtremeArbitrary,
  prototypeSensitiveArbitrary,
  deepNestedArbitrary,
  serializationTrapArbitrary,
  primitiveMismatchArbitrary,
  PAYLOAD_CATEGORIES,
} from "../src/payload/index.js";

describe("Payload Arbitraries - Category Coverage", () => {
  it("covers all 7 required payload categories", () => {
    expect(PAYLOAD_CATEGORIES).toHaveLength(7);
    expect(PAYLOAD_CATEGORIES).toContain("nullish");
    expect(PAYLOAD_CATEGORIES).toContain("empty");
    expect(PAYLOAD_CATEGORIES).toContain("numeric-extreme");
    expect(PAYLOAD_CATEGORIES).toContain("prototype-sensitive");
    expect(PAYLOAD_CATEGORIES).toContain("deep-nested");
    expect(PAYLOAD_CATEGORIES).toContain("serialization-trap");
    expect(PAYLOAD_CATEGORIES).toContain("primitive-mismatch");
  });

  it("generates nullish values and structures", () => {
    const samples = fc.sample(nullishArbitrary, { numRuns: 100 });
    expect(samples.length).toBe(100);
    const values = samples.map((s) => s.value);
    expect(values.some((v) => v === null)).toBe(true);
    expect(values.some((v) => v === undefined)).toBe(true);
    expect(
      values.some((v) => typeof v === "object" && v !== null && "value" in v)
    ).toBe(true);
  });

  it("generates empty primitives, arrays, and objects", () => {
    const samples = fc.sample(emptyArbitrary, { numRuns: 100, seed: 42 });
    const values = samples.map((s) => s.value);
    expect(values.some((v) => v === "")).toBe(true);
    expect(values.some((v) => Array.isArray(v) && v.length === 0)).toBe(true);
    expect(
      values.some((v) => typeof v === "object" && v !== null && Object.keys(v).length === 0)
    ).toBe(true);
  });

  it("generates numeric extremes, NaN, Infinities, and boundary hazards", () => {
    const samples = fc.sample(numericExtremeArbitrary, { numRuns: 250, seed: 42 });
    const values = samples.map((s) => s.value);

    expect(values.some((v) => typeof v === "number" && Number.isNaN(v))).toBe(true);
    expect(values.some((v) => v === Infinity)).toBe(true);
    expect(values.some((v) => v === -Infinity)).toBe(true);
    expect(values.some((v) => Object.is(v, -0))).toBe(true);
    expect(values.some((v) => v === Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(values.some((v) => v === Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  it("generates prototype-sensitive keys (__proto__, constructor, prototype)", () => {
    const samples = fc.sample(prototypeSensitiveArbitrary, { numRuns: 50 });
    const values = samples.map((s) => s.value);

    expect(
      values.some(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          Object.prototype.hasOwnProperty.call(v, "__proto__")
      )
    ).toBe(true);

    expect(
      values.some(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          Object.prototype.hasOwnProperty.call(v, "constructor")
      )
    ).toBe(true);

    expect(
      values.some(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          Object.prototype.hasOwnProperty.call(v, "prototype")
      )
    ).toBe(true);
  });

  it("generates deeply nested structures that stay bounded within depth <= 5", () => {
    const samples = fc.sample(deepNestedArbitrary, { numRuns: 50 });
    expect(samples.length).toBe(50);

    function computeMaxDepth(val: unknown, current = 0): number {
      if (typeof val !== "object" || val === null) return current;
      let max = current;
      if (Array.isArray(val)) {
        for (const item of val) {
          max = Math.max(max, computeMaxDepth(item, current + 1));
        }
      } else {
        for (const k of Object.keys(val)) {
          max = Math.max(max, computeMaxDepth((val as any)[k], current + 1));
        }
      }
      return max;
    }

    for (const sample of samples) {
      expect(computeMaxDepth(sample.value)).toBeLessThanOrEqual(6);
    }
  });

  it("generates non-JSON serialization traps (BigInt, Symbol, Function, Date)", () => {
    const samples = fc.sample(serializationTrapArbitrary, { numRuns: 100 });
    const values = samples.map((s) => s.value);

    expect(values.some((v) => typeof v === "bigint")).toBe(true);
    expect(values.some((v) => typeof v === "symbol")).toBe(true);
    expect(values.some((v) => typeof v === "function")).toBe(true);
    expect(values.some((v) => v instanceof Date)).toBe(true);
  });

  it("generates primitive type mismatches", () => {
    const samples = fc.sample(primitiveMismatchArbitrary, { numRuns: 100, seed: 42 });
    const values = samples.map((s) => s.value);

    expect(values.some((v) => typeof v === "string")).toBe(true);
    expect(values.some((v) => typeof v === "number")).toBe(true);
    expect(values.some((v) => typeof v === "boolean")).toBe(true);
    expect(values.some((v) => Array.isArray(v))).toBe(true);
  });
});

describe("Payload Synthesis - Determinism & Controls", () => {
  it("honors exact requested run count", () => {
    const result50 = synthesizePayloads({ runs: 50, seed: 12345 });
    expect(result50.requestedRuns).toBe(50);
    expect(result50.generatedRuns).toBe(50);
    expect(result50.payloads).toHaveLength(50);

    const result10 = synthesizePayloads({ runs: 10, seed: 12345 });
    expect(result10.generatedRuns).toBe(10);
    expect(result10.payloads).toHaveLength(10);
  });

  it("produces identical reproducible payload sequences when an explicit seed is provided", () => {
    const runA = synthesizePayloads({ runs: 40, seed: 9999 });
    const runB = synthesizePayloads({ runs: 40, seed: 9999 });

    expect(runA.generatedRuns).toBe(runB.generatedRuns);
    expect(runA.categories).toEqual(runB.categories);

    for (let i = 0; i < runA.payloads.length; i++) {
      expect(runA.payloads[i].category).toBe(runB.payloads[i].category);
      expect(runA.payloads[i].description).toBe(runB.payloads[i].description);
    }
  });

  it("assigns sequential IDs to generated payloads", () => {
    const result = synthesizePayloads({ runs: 15, seed: 42 });
    result.payloads.forEach((p, idx) => {
      expect(p.id).toBe(idx + 1);
    });
  });
});

describe("Safe Display Serializer", () => {
  it("safely serializes non-JSON values without throwing", () => {
    expect(formatPayloadValue(BigInt(42))).toBe("42n");
    expect(formatPayloadValue(Symbol("secret"))).toBe("Symbol(secret)");
    expect(formatPayloadValue(function testFn() {})).toBe("[Function: testFn]");
    expect(formatPayloadValue(NaN)).toBe("NaN");
    expect(formatPayloadValue(Infinity)).toBe("Infinity");
    expect(formatPayloadValue(-Infinity)).toBe("-Infinity");
    expect(formatPayloadValue(-0)).toBe("-0");
    expect(formatPayloadValue(new Date("2026-09-07T12:00:00.000Z"))).toContain("2026-09-07");
    expect(formatPayloadValue(/abc/gi)).toBe("/abc/gi");
  });

  it("safely handles circular references without infinite recursion", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(() => formatPayloadValue(circular)).not.toThrow();
    const formatted = formatPayloadValue(circular);
    expect(formatted).toContain("[Circular]");
  });
});
