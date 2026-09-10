/**
 * Result of checking whether a payload can safely cross into the isolated-vm isolate.
 */
export interface CompatibilityResult {
  transferable: boolean;
  reason?: string;
}

/**
 * Conservatively evaluates whether a synthesized adversarial payload can be
 * transferred into an isolated-vm V8 isolate.
 *
 * Guaranteed characteristics:
 * - Pure and non-mutating: does not modify or re-assign payload properties.
 * - Cycle-safe: detects circular references without recursion overflow.
 * - Depth-bounded: protects against pathologically deep structures.
 * - Honest classification: exotic values (BigInt, Symbol, Function, Date, Map, Set)
 *   are classified as unsupported rather than converted or failing the target.
 */
export function isPayloadTransferable(payload: unknown): CompatibilityResult {
  const seen = new Set<unknown>();

  function check(val: unknown, depth: number): CompatibilityResult {
    if (depth > 20) {
      return { transferable: false, reason: "Max object depth exceeded (>20)" };
    }

    if (val === null || val === undefined) {
      return { transferable: true };
    }

    const type = typeof val;

    if (type === "string" || type === "boolean") {
      return { transferable: true };
    }

    if (type === "number") {
      // Numbers include standard floats, integers, NaN, Infinity, -Infinity, and -0.
      return { transferable: true };
    }

    if (type === "bigint") {
      return { transferable: false, reason: "BigInt is unsupported for isolate transfer" };
    }

    if (type === "symbol") {
      return { transferable: false, reason: "Symbols cannot cross the isolate boundary" };
    }

    if (type === "function") {
      return { transferable: false, reason: "Functions cannot be cloned across isolates" };
    }

    if (type === "object") {
      if (seen.has(val)) {
        return { transferable: false, reason: "Circular reference detected" };
      }
      seen.add(val);

      if (val instanceof Date) {
        return { transferable: false, reason: "Date instances are unsupported for isolate transfer" };
      }
      if (val instanceof RegExp) {
        return { transferable: false, reason: "RegExp instances are unsupported for isolate transfer" };
      }
      if (val instanceof Map) {
        return { transferable: false, reason: "Map instances are unsupported for isolate transfer" };
      }
      if (val instanceof Set) {
        return { transferable: false, reason: "Set instances are unsupported for isolate transfer" };
      }

      // Arrays
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const res = check(val[i], depth + 1);
          if (!res.transferable) return res;
        }
        return { transferable: true };
      }

      // Object with Symbol property keys
      const symKeys = Object.getOwnPropertySymbols(val);
      if (symKeys.length > 0) {
        return { transferable: false, reason: "Object contains symbol property keys" };
      }

      // Plain or prototype-sensitive object keys
      let keys: string[];
      try {
        keys = Object.getOwnPropertyNames(val);
      } catch {
        return { transferable: false, reason: "Unable to inspect object property names" };
      }

      for (const key of keys) {
        let propVal: unknown;
        try {
          propVal = (val as Record<string, unknown>)[key];
        } catch {
          return { transferable: false, reason: `Property accessor threw on: ${key}` };
        }
        const res = check(propVal, depth + 1);
        if (!res.transferable) return res;
      }

      return { transferable: true };
    }

    return { transferable: false, reason: `Unknown value type: ${type}` };
  }

  return check(payload, 0);
}

/**
 * Checks whether an extracted function AST node or code is sandbox-compatible
 * (i.e. self-contained, does not rely on missing host globals like process, require, fetch, fs).
 * If unsupported globals are referenced, it is classified as static-only.
 */
export function isActionSandboxCompatible(node: unknown): { compatible: boolean; reason?: string } {
  let hasUnsupportedGlobal = false;
  let unsupportedName = "";

  const unsupportedGlobals = new Set([
    "process",
    "require",
    "fetch",
    "fs",
    "window",
    "document",
    "prisma",
    "db",
    "drizzle",
    "cookies",
    "headers",
    "redirect",
    "notFound",
    "revalidatePath",
    "revalidateTag",
  ]);

  function scan(n: unknown): void {
    if (!n || typeof n !== "object" || hasUnsupportedGlobal) return;

    if ((n as { type?: string }).type === "Identifier") {
      const name = (n as { value?: string }).value;
      if (name && unsupportedGlobals.has(name)) {
        hasUnsupportedGlobal = true;
        unsupportedName = name;
        return;
      }
    }

    for (const key of Object.keys(n)) {
      if (key === "span") continue;
      const val = (n as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (const child of val) scan(child);
      } else if (typeof val === "object") {
        scan(val);
      }
    }
  }

  scan(node);

  if (hasUnsupportedGlobal) {
    return {
      compatible: false,
      reason: `Action references host global '${unsupportedName}', classified as static-only`,
    };
  }

  return { compatible: true };
}
