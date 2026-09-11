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
 * Result of evaluating action sandbox compatibility.
 */
export interface ActionCompatibilityResult {
  compatible: boolean;
  classification: "sandbox-compatible" | "static-only" | "unsupported-runtime" | "unknown";
  reason?: string;
  unsupportedDependency?: string;
}

/**
 * Standard host globals and framework runtime APIs unsupported inside isolated-vm.
 */
export const UNSUPPORTED_HOST_GLOBALS = new Set([
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
  "redis",
  "upstash",
  "createStreamableValue",
  "ai",
  "stripe",
  "resend",
  "kv",
  "supabase",
  "openai",
]);

/**
 * Known external cloud SDK packages and singleton patterns that cannot be bound in isolate sandbox.
 */
export const EXTERNAL_CLOUD_PACKAGE_PATTERNS = [
  /^@ai-sdk\//,
  /^ai$/,
  /^@upstash\//,
  /^@prisma\//,
  /^drizzle-orm/,
  /^stripe$/,
  /^resend$/,
  /^@supabase\//,
  /^@octokit\//,
  /^openai$/,
  /^mongodb$/,
  /^ioredis$/,
  /^redis$/,
  /^pg$/,
  /^mysql2$/,
  /^@google\/genai/,
  /^@anthropic-ai\//,
  /^@\/lib\/(?:upstash|db|prisma|redis|kv)/,
  /^~\/lib\/(?:upstash|db|prisma|redis|kv)/,
];

/**
 * Checks whether an extracted function AST node is sandbox-compatible
 * (i.e. self-contained, does not rely on missing host globals or external cloud SDKs).
 * If unsupported globals or external SDK imports are referenced, it is classified as static-only.
 */
export function isActionSandboxCompatible(
  node: unknown,
  moduleAst?: unknown
): ActionCompatibilityResult {
  // 1. Collect external package and singleton bindings from module imports if AST is provided
  const externalBindings = new Map<string, string>(); // localName -> importSource

  if (moduleAst && typeof moduleAst === "object" && "body" in (moduleAst as Record<string, unknown>)) {
    const body = (moduleAst as { body: unknown[] }).body;
    for (const item of body) {
      if (item && typeof item === "object" && (item as { type: string }).type === "ImportDeclaration") {
        const importDecl = item as {
          type: "ImportDeclaration";
          source: { value: string };
          specifiers?: Array<{
            type: string;
            local: { value: string };
            imported?: { value: string };
          }>;
        };

        const src = importDecl.source?.value ?? "";
        const isExternalOrCloud = EXTERNAL_CLOUD_PACKAGE_PATTERNS.some((pat) => pat.test(src));

        if (isExternalOrCloud && importDecl.specifiers) {
          for (const spec of importDecl.specifiers) {
            if (spec.local?.value) {
              externalBindings.set(spec.local.value, src);
            }
          }
        }
      }
    }
  }

  // 2. Scan the action function AST for references to unsupported globals or external bindings
  let unsupportedGlobal: string | undefined;
  let externalDep: { name: string; source: string } | undefined;

  function scan(n: unknown): void {
    if (!n || typeof n !== "object" || unsupportedGlobal || externalDep) return;

    if ((n as { type?: string }).type === "Identifier") {
      const name = (n as { value?: string }).value;
      if (name) {
        if (UNSUPPORTED_HOST_GLOBALS.has(name)) {
          unsupportedGlobal = name;
          return;
        }
        if (externalBindings.has(name)) {
          externalDep = { name, source: externalBindings.get(name)! };
          return;
        }
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

  if (unsupportedGlobal) {
    return {
      compatible: false,
      classification: "static-only",
      reason: `Action references host global '${unsupportedGlobal}', classified as static-only`,
      unsupportedDependency: unsupportedGlobal,
    };
  }

  if (externalDep) {
    return {
      compatible: false,
      classification: "static-only",
      reason: `Action references external dependency '${externalDep.name}' imported from '${externalDep.source}' which cannot be bound in sandbox isolate`,
      unsupportedDependency: externalDep.name,
    };
  }

  return { compatible: true, classification: "sandbox-compatible" };
}
