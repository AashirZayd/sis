/**
 * Safely serializes arbitrary values (including non-JSON types like BigInt, Symbol,
 * Function, Date, NaN, -0, and circular references) into a human-readable display string.
 */
export function formatPayloadValue(val: unknown, depth = 0, seen = new WeakSet()): string {
  if (depth > 5) {
    return "...";
  }

  if (val === null) {
    return "null";
  }

  if (val === undefined) {
    return "undefined";
  }

  if (typeof val === "bigint") {
    return `${val}n`;
  }

  if (typeof val === "symbol") {
    return val.toString();
  }

  if (typeof val === "function") {
    return val.name ? `[Function: ${val.name}]` : "[Function]";
  }

  if (typeof val === "number") {
    if (Number.isNaN(val)) return "NaN";
    if (val === Infinity) return "Infinity";
    if (val === -Infinity) return "-Infinity";
    if (Object.is(val, -0)) return "-0";
    return String(val);
  }

  if (typeof val === "string") {
    return JSON.stringify(val);
  }

  if (typeof val === "boolean") {
    return String(val);
  }

  if (val instanceof Date) {
    return `Date("${val.toISOString()}")`;
  }

  if (val instanceof RegExp) {
    return val.toString();
  }

  if (val instanceof Map) {
    return `Map(${val.size})`;
  }

  if (val instanceof Set) {
    return `Set(${val.size})`;
  }

  if (typeof val === "object") {
    if (seen.has(val)) {
      return "[Circular]";
    }
    seen.add(val);

    if (Array.isArray(val)) {
      if (val.length === 0) return "[]";
      const items = val
        .slice(0, 5)
        .map((item) => formatPayloadValue(item, depth + 1, seen));
      if (val.length > 5) items.push(`... +${val.length - 5} items`);
      return `[${items.join(", ")}]`;
    }

    const keys = Object.keys(val);
    if (keys.length === 0) return "{}";
    const entries = keys.slice(0, 5).map((key) => {
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? key
        : JSON.stringify(key);
      const formattedVal = formatPayloadValue(
        (val as Record<string, unknown>)[key],
        depth + 1,
        seen
      );
      return `${formattedKey}: ${formattedVal}`;
    });
    if (keys.length > 5) entries.push(`... +${keys.length - 5} keys`);
    return `{ ${entries.join(", ")} }`;
  }

  return String(val);
}
