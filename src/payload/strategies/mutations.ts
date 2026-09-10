import type { InferredShape } from "../targets/types.js";

export interface MutationVariant {
  value: unknown;
  strategy: string;
  category: import("../types.js").PayloadCategory;
  description: string;
}

/**
 * Creates prototype-sensitive objects with own enumerable properties.
 */
export function createProtoKey(key: "__proto__" | "constructor" | "prototype", value: unknown): Record<string, unknown> {
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
 * Reusable mutation engine generating targeted adversarial variations
 * based on the target shape and invariant.
 */
export class BoundaryMutationEngine {
  /**
   * Generates nullability variants for any shape.
   */
  static getNullabilityVariants(): MutationVariant[] {
    return [
      {
        value: null,
        strategy: "nullability",
        category: "nullish",
        description: "Direct null value",
      },
      {
        value: undefined,
        strategy: "nullability",
        category: "nullish",
        description: "Direct undefined value",
      },
    ];
  }

  /**
   * Generates numeric extreme variants for numbers or number properties.
   */
  static getNumericExtremeVariants(): MutationVariant[] {
    return [
      { value: 0, strategy: "numeric-extreme", category: "numeric-extreme", description: "Zero" },
      { value: -0, strategy: "numeric-extreme", category: "numeric-extreme", description: "Negative zero (-0)" },
      { value: 1, strategy: "numeric-extreme", category: "numeric-extreme", description: "Positive one" },
      { value: -1, strategy: "numeric-extreme", category: "numeric-extreme", description: "Negative one" },
      { value: NaN, strategy: "numeric-extreme", category: "numeric-extreme", description: "NaN value" },
      { value: Infinity, strategy: "numeric-extreme", category: "numeric-extreme", description: "Infinity" },
      { value: -Infinity, strategy: "numeric-extreme", category: "numeric-extreme", description: "-Infinity" },
      { value: Number.MAX_SAFE_INTEGER, strategy: "numeric-extreme", category: "numeric-extreme", description: "MAX_SAFE_INTEGER" },
      { value: Number.MAX_SAFE_INTEGER + 1, strategy: "numeric-extreme", category: "numeric-extreme", description: "MAX_SAFE_INTEGER + 1 (precision loss)" },
      { value: Number.MIN_SAFE_INTEGER, strategy: "numeric-extreme", category: "numeric-extreme", description: "MIN_SAFE_INTEGER" },
    ];
  }

  /**
   * Generates string hazard variants for strings or string properties.
   */
  static getStringHazardVariants(): MutationVariant[] {
    return [
      { value: "", strategy: "string-hazard", category: "empty", description: "Empty string" },
      { value: " ", strategy: "string-hazard", category: "empty", description: "Whitespace string" },
      { value: "\0", strategy: "string-hazard", category: "primitive-mismatch", description: "Null byte character (\\0)" },
      { value: "\n\r\t", strategy: "string-hazard", category: "primitive-mismatch", description: "Control characters" },
      { value: "undefined", strategy: "string-hazard", category: "primitive-mismatch", description: "Literal string 'undefined'" },
      { value: "null", strategy: "string-hazard", category: "primitive-mismatch", description: "Literal string 'null'" },
      { value: "NaN", strategy: "string-hazard", category: "primitive-mismatch", description: "Literal string 'NaN'" },
      { value: "🚀⚡🔥", strategy: "string-hazard", category: "primitive-mismatch", description: "Multibyte Unicode emoji sequence" },
      { value: "A".repeat(10000), strategy: "string-hazard", category: "deep-nested", description: "10,000-character long string" },
    ];
  }

  /**
   * Generates boolean variants.
   */
  static getBooleanVariants(): MutationVariant[] {
    return [
      { value: true, strategy: "boolean-boundary", category: "primitive-mismatch", description: "Boolean true" },
      { value: false, strategy: "boolean-boundary", category: "primitive-mismatch", description: "Boolean false" },
      { value: "true", strategy: "boolean-boundary", category: "primitive-mismatch", description: "String 'true' mismatch" },
      { value: "false", strategy: "boolean-boundary", category: "primitive-mismatch", description: "String 'false' mismatch" },
      { value: 0, strategy: "boolean-boundary", category: "primitive-mismatch", description: "Numeric 0 for boolean" },
      { value: 1, strategy: "boolean-boundary", category: "primitive-mismatch", description: "Numeric 1 for boolean" },
    ];
  }

  /**
   * Generates prototype-pollution key variants.
   */
  static getPrototypeVariants(): MutationVariant[] {
    return [
      {
        value: createProtoKey("__proto__", { polluted: true }),
        strategy: "prototype-sensitive",
        category: "prototype-sensitive",
        description: "Object with own __proto__ property",
      },
      {
        value: createProtoKey("constructor", { prototype: { polluted: true } }),
        strategy: "prototype-sensitive",
        category: "prototype-sensitive",
        description: "Object with own constructor.prototype property",
      },
      {
        value: createProtoKey("prototype", { polluted: true }),
        strategy: "prototype-sensitive",
        category: "prototype-sensitive",
        description: "Object with own prototype property",
      },
    ];
  }

  /**
   * Generates React Flight and isolate serialization traps.
   */
  static getSerializationTrapVariants(): MutationVariant[] {
    return [
      { value: BigInt(9007199254740991), strategy: "serialization-trap", category: "serialization-trap", description: "BigInt value" },
      { value: Symbol("unregistered"), strategy: "serialization-trap", category: "serialization-trap", description: "Unregistered Symbol('unregistered')" },
      { value: Symbol.for("flight.symbol"), strategy: "serialization-trap", category: "serialization-trap", description: "Global Symbol.for('flight.symbol')" },
      { value: () => "callback", strategy: "serialization-trap", category: "serialization-trap", description: "Unmarked closure callback function" },
      { value: new Date("2026-09-10T00:00:00.000Z"), strategy: "serialization-trap", category: "serialization-trap", description: "Date instance" },
      { value: new Map([["key", "value"]]), strategy: "serialization-trap", category: "serialization-trap", description: "Map instance" },
      { value: new Set([1, 2, 3]), strategy: "serialization-trap", category: "serialization-trap", description: "Set instance" },
      { value: new Uint8Array([1, 2, 3]), strategy: "serialization-trap", category: "serialization-trap", description: "Uint8Array instance" },
    ];
  }

  /**
   * Generates structural mutations for object shapes based on inferred properties.
   */
  static mutateObject(
    baseline: Record<string, unknown>,
    properties: Map<string, InferredShape>
  ): MutationVariant[] {
    const variants: MutationVariant[] = [];

    // 1. Empty object
    variants.push({
      value: {},
      strategy: "structural-deletion",
      category: "empty",
      description: "Empty object omitting all properties",
    });

    // 2. Structural replacement
    variants.push({
      value: [],
      strategy: "structural-replacement",
      category: "primitive-mismatch",
      description: "Array replacement for expected object",
    });

    // 3. Omit one property at a time
    const keys = Array.from(properties.keys());
    for (const key of keys) {
      const omitted = { ...baseline };
      delete omitted[key];
      variants.push({
        value: omitted,
        strategy: "structural-deletion",
        category: "empty",
        description: `Object with omitted property '${key}'`,
      });
    }

    // 4. Per-property mutation variants
    for (const [key, propShape] of properties.entries()) {
      // Nullish property values
      variants.push({
        value: { ...baseline, [key]: null },
        strategy: "nullability",
        category: "nullish",
        description: `Object with '${key}: null'`,
      });
      variants.push({
        value: { ...baseline, [key]: undefined },
        strategy: "nullability",
        category: "nullish",
        description: `Object with '${key}: undefined'`,
      });

      // Type-specific property values
      if (propShape.kind === "number") {
        variants.push({
          value: { ...baseline, [key]: NaN },
          strategy: "numeric-extreme",
          category: "numeric-extreme",
          description: `Object with '${key}: NaN'`,
        });
        variants.push({
          value: { ...baseline, [key]: -0 },
          strategy: "numeric-extreme",
          category: "numeric-extreme",
          description: `Object with '${key}: -0'`,
        });
        variants.push({
          value: { ...baseline, [key]: "not-a-number" },
          strategy: "primitive-mismatch",
          category: "primitive-mismatch",
          description: `Object with '${key}: string mismatch'`,
        });
      } else if (propShape.kind === "string") {
        variants.push({
          value: { ...baseline, [key]: "" },
          strategy: "string-hazard",
          category: "empty",
          description: `Object with '${key}: \"\"'`,
        });
        variants.push({
          value: { ...baseline, [key]: 12345 },
          strategy: "primitive-mismatch",
          category: "primitive-mismatch",
          description: `Object with '${key}: number mismatch'`,
        });
      } else if (propShape.kind === "object") {
        variants.push({
          value: { ...baseline, [key]: {} },
          strategy: "structural-deletion",
          category: "empty",
          description: `Object with '${key}: {}'`,
        });
        if (propShape.properties) {
          const nestedBase: Record<string, unknown> = {};
          for (const [nk, nv] of propShape.properties.entries()) {
            nestedBase[nk] = nv.kind === "number" ? 1 : nv.kind === "string" ? "str" : true;
          }
          // Mutate nested property
          for (const [nk, nv] of propShape.properties.entries()) {
            if (nv.kind === "number") {
              variants.push({
                value: { ...baseline, [key]: { ...nestedBase, [nk]: NaN } },
                strategy: "numeric-extreme",
                category: "numeric-extreme",
                description: `Nested object with '${key}.${nk}: NaN'`,
              });
            }
          }
        }
      }
    }

    // 5. Prototype-sensitive key injection on object
    variants.push({
      value: {
        ...baseline,
        ...createProtoKey("__proto__", { admin: true }),
      },
      strategy: "prototype-sensitive",
      category: "prototype-sensitive",
      description: "Object injected with prototype-polluting __proto__ key",
    });

    return variants;
  }
}
