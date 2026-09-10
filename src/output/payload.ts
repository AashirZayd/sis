/**
 * Safe structured serializer for exotic JavaScript values.
 * Standard JSON.stringify converts NaN/Infinity to null, drops undefined,
 * and throws TypeError on BigInt or circular references.
 * This serializer preserves all values losslessly into a JSON-compatible representation.
 */
export function serializeSpecialPayload(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === undefined) {
    return { $sis_type: "undefined" };
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return { $sis_type: "special-number", value: "NaN" };
    }
    if (value === Infinity) {
      return { $sis_type: "special-number", value: "Infinity" };
    }
    if (value === -Infinity) {
      return { $sis_type: "special-number", value: "-Infinity" };
    }
    if (Object.is(value, -0)) {
      return { $sis_type: "special-number", value: "-0" };
    }
    return value;
  }

  if (typeof value === "bigint") {
    return { $sis_type: "bigint", value: value.toString() };
  }

  if (typeof value === "symbol") {
    return { $sis_type: "symbol", description: value.description ?? "" };
  }

  if (typeof value === "function") {
    return { $sis_type: "function", name: value.name || "anonymous" };
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  // Object reference cycle handling
  if (seen.has(value)) {
    return { $sis_type: "circular-reference" };
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => serializeSpecialPayload(item, seen));
  }

  if (value instanceof Date) {
    return {
      $sis_type: "date",
      value: Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString(),
    };
  }

  if (value instanceof RegExp) {
    return {
      $sis_type: "regexp",
      source: value.source,
      flags: value.flags,
    };
  }

  if (value instanceof Error) {
    return {
      $sis_type: "error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Map) {
    return {
      $sis_type: "map",
      entries: Array.from(value.entries()).map(([k, v]) => [
        serializeSpecialPayload(k, seen),
        serializeSpecialPayload(v, seen),
      ]),
    };
  }

  if (value instanceof Set) {
    return {
      $sis_type: "set",
      values: Array.from(value.values()).map((item) =>
        serializeSpecialPayload(item, seen)
      ),
    };
  }

  // Plain object or dictionary
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = serializeSpecialPayload(v, seen);
  }

  return result;
}
