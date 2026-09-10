import fc from "fast-check";
import type { PayloadCategory } from "./types.js";

export interface CategoryPayloadCandidate {
  category: PayloadCategory;
  value: unknown;
}

/**
 * Creates prototype-sensitive objects with own properties (preventing prototype mutation).
 */
function createProtoSensitiveObject(key: string, value: unknown): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return obj;
}

/**
 * Category A: Nullish values and structures containing nullish members.
 */
export const nullishArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    null,
    undefined,
    { value: null },
    { value: undefined },
    { payload: null },
    { payload: undefined },
    { data: { value: null } },
    { data: { value: undefined } },
    [null],
    [undefined]
  )
  .map((value) => ({ category: "nullish", value }));

/**
 * Category B: Empty values (empty string, empty array, empty object).
 */
export const emptyArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    "",
    [],
    {},
    { value: "" },
    { value: [] },
    { value: {} },
    { data: "" },
    { items: [] },
    { config: {} }
  )
  .map((value) => ({ category: "empty", value }));

/**
 * Category C: Numeric extremes, boundary hazards, NaN, and infinities.
 */
export const numericExtremeArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    0,
    -0,
    1,
    -1,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_SAFE_INTEGER + 2,
    Number.MIN_SAFE_INTEGER - 1,
    { amount: NaN },
    { amount: Infinity },
    { amount: -Infinity },
    { amount: -0 },
    { amount: Number.MAX_SAFE_INTEGER },
    { amount: Number.MAX_SAFE_INTEGER + 1 }
  )
  .map((value) => ({ category: "numeric-extreme", value }));

/**
 * Category D: Prototype-sensitive keys (__proto__, constructor, prototype).
 */
export const prototypeSensitiveArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    createProtoSensitiveObject("__proto__", { polluted: true }),
    createProtoSensitiveObject("constructor", {
      prototype: { polluted: true },
    }),
    createProtoSensitiveObject("prototype", { polluted: true }),
    { payload: createProtoSensitiveObject("__proto__", { admin: true }) },
    { data: createProtoSensitiveObject("constructor", { role: "admin" }) }
  )
  .map((value) => ({ category: "prototype-sensitive", value }));

/**
 * Category E: Deeply nested structures bounded to depth <= 5.
 */
export const deepNestedArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    { a: { b: { c: { d: { e: 1 } } } } },
    { a: { b: { c: { d: {} } } } },
    [[[[[0]]]]],
    [[[[[]]]]],
    { data: { payload: { inner: { value: 1 } } } },
    { nested: [{ a: [{ b: 1 }] }] },
    [[{ a: [{ b: 1 }] }]]
  )
  .map((value) => ({ category: "deep-nested", value }));

/**
 * Category F: Serialization traps (BigInt, Symbol, function, Date, Map, Set, RegExp).
 */
export const serializationTrapArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    BigInt(1),
    BigInt("9007199254740991"),
    Symbol("x"),
    Symbol("trap"),
    function anonymous() {},
    () => {},
    new Date("2026-09-07T12:00:00.000Z"),
    new Map([["key", "value"]]),
    new Set([1, 2, 3]),
    /^[a-z0-9]+$/gi,
    { token: Symbol("secret") },
    { callback: () => {} },
    { bigVal: BigInt(42) }
  )
  .map((value) => ({ category: "serialization-trap", value }));

/**
 * Category G: Primitive type mismatches (string, number, boolean, array, null when object expected).
 */
export const primitiveMismatchArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc
  .constantFrom<unknown>(
    "unexpected string",
    "true",
    "42",
    42,
    100,
    false,
    true,
    [],
    null,
    { amount: "100" },
    { amount: [] },
    { amount: {} },
    { amount: false },
    { amount: true },
    { amount: "not-a-number" }
  )
  .map((value) => ({ category: "primitive-mismatch", value }));

/**
 * Master payload arbitrary combining all 7 adversarial categories.
 */
export const masterPayloadArbitrary: fc.Arbitrary<CategoryPayloadCandidate> = fc.oneof(
  nullishArbitrary,
  emptyArbitrary,
  numericExtremeArbitrary,
  prototypeSensitiveArbitrary,
  deepNestedArbitrary,
  serializationTrapArbitrary,
  primitiveMismatchArbitrary
);
