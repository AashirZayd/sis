import type { MutationVariant } from "./mutations.js";
import { BoundaryMutationEngine } from "./mutations.js";

export type SerializationClass = "supported" | "unsupported" | "edge";

export interface ClassifiedPayload {
  variant: MutationVariant;
  classification: SerializationClass;
  reason?: string;
}

class MockDatabaseHandle {
  connection = "postgresql://localhost:5432";
  query() {
    return [];
  }
}

class CustomUserClass {
  name = "user";
}

/**
 * Creates circular reference object safely.
 */
function createCircularObject(): Record<string, unknown> {
  const obj: Record<string, unknown> = { name: "circular" };
  obj.self = obj;
  return obj;
}

/**
 * Generates payloads for React Flight serialization boundaries classified into
 * SUPPORTED, UNSUPPORTED, and EDGE.
 */
export function generateClassifiedSerializationPayloads(): ClassifiedPayload[] {
  const payloads: ClassifiedPayload[] = [
    // 1. SUPPORTED
    {
      variant: {
        value: "regular string",
        strategy: "serialization-supported",
        category: "primitive-mismatch",
        description: "Serializable primitive string",
      },
      classification: "supported",
    },
    {
      variant: {
        value: 12345,
        strategy: "serialization-supported",
        category: "numeric-extreme",
        description: "Serializable number",
      },
      classification: "supported",
    },
    {
      variant: {
        value: new Date("2026-09-10T10:00:00.000Z"),
        strategy: "serialization-supported",
        category: "serialization-trap",
        description: "Flight-supported Date instance",
      },
      classification: "supported",
    },
    {
      variant: {
        value: new Map([["key", "value"]]),
        strategy: "serialization-supported",
        category: "serialization-trap",
        description: "Flight-supported Map instance",
      },
      classification: "supported",
    },
    {
      variant: {
        value: new Set([1, 2, 3]),
        strategy: "serialization-supported",
        category: "serialization-trap",
        description: "Flight-supported Set instance",
      },
      classification: "supported",
    },
    {
      variant: {
        value: new Uint8Array([10, 20, 30]),
        strategy: "serialization-supported",
        category: "serialization-trap",
        description: "Flight-supported Uint8Array instance",
      },
      classification: "supported",
    },
    {
      variant: {
        value: { ok: true, items: [1, 2] },
        strategy: "serialization-supported",
        category: "empty",
        description: "Flight-supported plain object",
      },
      classification: "supported",
    },

    // 2. UNSUPPORTED
    {
      variant: {
        value: () => {
          return "unmarked closure";
        },
        strategy: "serialization-unsupported",
        category: "serialization-trap",
        description: "Unmarked closure callback function",
      },
      classification: "unsupported",
      reason: "Functions cannot be passed across client boundaries without 'use server'",
    },
    {
      variant: {
        value: new CustomUserClass(),
        strategy: "serialization-unsupported",
        category: "serialization-trap",
        description: "Custom class instance",
      },
      classification: "unsupported",
      reason: "Class instances cannot be passed across client boundaries",
    },
    {
      variant: {
        value: new MockDatabaseHandle(),
        strategy: "serialization-unsupported",
        category: "serialization-trap",
        description: "Database connection / server-only handle",
      },
      classification: "unsupported",
      reason: "Server-only database handles cannot cross client boundary",
    },

    // 3. EDGE
    {
      variant: {
        value: Symbol.for("flight.registered"),
        strategy: "serialization-edge",
        category: "serialization-trap",
        description: "Global Symbol.for()",
      },
      classification: "edge",
      reason: "Global registered symbols are Flight-supported, but require host registration",
    },
    {
      variant: {
        value: Symbol("unregistered"),
        strategy: "serialization-edge",
        category: "serialization-trap",
        description: "Unregistered Symbol()",
      },
      classification: "edge",
      reason: "Unregistered Symbols cannot be serialized across Flight",
    },
    {
      variant: {
        value: createCircularObject(),
        strategy: "serialization-edge",
        category: "deep-nested",
        description: "Circular reference object",
      },
      classification: "edge",
      reason: "Circular objects trap serialization and isolate cloning",
    },
    {
      variant: {
        value: { a: { b: { c: { d: { e: { f: 1 } } } } } },
        strategy: "serialization-edge",
        category: "deep-nested",
        description: "Deeply nested object structure (>5 levels)",
      },
      classification: "edge",
      reason: "Deep structures risk exceeding recursion limits",
    },
  ];

  return payloads;
}
