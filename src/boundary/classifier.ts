import type { Module, ModuleItem, Statement, Expression } from "@swc/core";
import type {
  BoundaryClassification,
  BoundaryKind,
  BoundaryConfidence,
} from "../core/types.js";
import { toPosixPath } from "../discovery/filters.js";

/**
 * Standard HTTP methods recognized in Next.js App Router Route Handlers.
 */
export const HTTP_ROUTE_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Known client-only React and Next.js hooks.
 * Invocation of these hooks provides conservative evidence of client-side execution.
 */
export const CLIENT_ONLY_HOOKS = new Set([
  "useState",
  "useEffect",
  "useReducer",
  "useRef",
  "useLayoutEffect",
  "useInsertionEffect",
  "useImperativeHandle",
  "useTransition",
  "useDeferredValue",
  "useId",
  "useSyncExternalStore",
  "useOptimistic",
  "useActionState",
  "useFormStatus",
  "useFormState",
  "useRouter",
  "useSearchParams",
  "usePathname",
  "useParams",
  "useSelectedLayoutSegment",
  "useSelectedLayoutSegments",
]);

/**
 * Determines whether a file path conforms to Next.js App Router Route Handler conventions:
 * app/** /route.ts, app/** /route.tsx, app/** /route.js, app/** /route.jsx
 */
export function isRouteHandlerPath(filePath: string): boolean {
  const posix = toPosixPath(filePath);
  // Match app/**/route.[jt]sx? or ^route.[jt]sx?$ if in app folder
  return (
    /(?:^|[\\/])app[\\/].*[\\/]route\.[jt]sx?$/i.test(posix) ||
    /^(?:.*[\\/])?app[\\/]route\.[jt]sx?$/i.test(posix)
  );
}

/**
 * Checks whether an exported identifier is an HTTP Route Handler method.
 */
export function isRouteHandlerMethod(name: string): boolean {
  return HTTP_ROUTE_METHODS.has(name);
}

/**
 * Unified Boundary Classifier.
 * Classifies an AST module into an explicit BoundaryClassification with
 * kind, confidence, evidence, and reason.
 */
export function classifyBoundary(
  filePath: string,
  ast: Module
): BoundaryClassification {
  const posixPath = toPosixPath(filePath);

  // 1. Check module-level prologue directives
  let moduleDirective: "use client" | "use server" | null = null;
  for (const item of ast.body) {
    if (item.type !== "ExpressionStatement") break;
    if (item.expression.type !== "StringLiteral") break;
    const val = item.expression.value;
    if (val === "use client" || val === "use server") {
      moduleDirective = val;
      break;
    }
  }

  if (moduleDirective === "use client") {
    return {
      kind: "client-component",
      confidence: "HIGH",
      evidence: ["directive:use client"],
      reason: 'Explicit "use client" module directive declared in prologue.',
    };
  }

  if (moduleDirective === "use server") {
    return {
      kind: "server-action",
      confidence: "HIGH",
      evidence: ["directive:use server"],
      reason: 'Explicit "use server" module directive declared in prologue.',
    };
  }

  // 2. Check for App Router Route Handler convention
  if (isRouteHandlerPath(posixPath)) {
    const exportedHttpMethods: string[] = [];
    for (const item of ast.body) {
      if (item.type === "ExportDeclaration") {
        const decl = item.declaration;
        if (decl?.type === "FunctionDeclaration" && decl.identifier) {
          if (HTTP_ROUTE_METHODS.has(decl.identifier.value)) {
            exportedHttpMethods.push(decl.identifier.value);
          }
        } else if (decl?.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type === "Identifier" && HTTP_ROUTE_METHODS.has(d.id.value)) {
              exportedHttpMethods.push(d.id.value);
            }
          }
        }
      } else if (item.type === "ExportNamedDeclaration") {
        for (const spec of item.specifiers) {
          if (spec.type === "ExportSpecifier") {
            const exportedName = spec.exported?.value ?? spec.orig.value;
            if (HTTP_ROUTE_METHODS.has(exportedName)) {
              exportedHttpMethods.push(exportedName);
            }
          }
        }
      }
    }

    if (exportedHttpMethods.length > 0) {
      return {
        kind: "route-handler",
        confidence: "HIGH",
        evidence: [
          `path:${posixPath}`,
          ...exportedHttpMethods.map((m) => `export:${m}`),
        ],
        reason: `App Router route handler exporting HTTP method(s): ${exportedHttpMethods.join(", ")}.`,
      };
    }

    // Even if no methods exported yet, file location in route.ts indicates route handler intent
    return {
      kind: "route-handler",
      confidence: "MEDIUM",
      evidence: [`path:${posixPath}`],
      reason: "App Router route file location.",
    };
  }

  // 3. Scan for Client-only hooks to infer Client Component
  const discoveredHooks: string[] = [];
  function scanForHooks(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "CallExpression") {
      const callee = n.callee as Record<string, unknown> | undefined;
      if (callee?.type === "Identifier" && typeof callee.value === "string") {
        if (CLIENT_ONLY_HOOKS.has(callee.value)) {
          discoveredHooks.push(callee.value);
        }
      }
    }

    for (const key of Object.keys(n)) {
      if (key === "span") continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const c of val) scanForHooks(c);
      } else if (typeof val === "object") {
        scanForHooks(val);
      }
    }
  }

  scanForHooks(ast);

  if (discoveredHooks.length > 0) {
    const uniqueHooks = Array.from(new Set(discoveredHooks));
    return {
      kind: "client-component",
      confidence: "MEDIUM",
      evidence: uniqueHooks.map((h) => `hook:${h}`),
      reason: `Client Component inferred from invocation of client hooks: ${uniqueHooks.join(", ")}.`,
    };
  }

  // 4. App Router default server component heuristic
  if (/(?:^|[\\/])app[\\/]/.test(posixPath)) {
    return {
      kind: "server-component",
      confidence: "LOW",
      evidence: ["path:app/**"],
      reason: "Default App Router component (Server Component).",
    };
  }

  // 5. Unknown boundary
  return {
    kind: "unknown",
    confidence: "UNKNOWN",
    evidence: [],
    reason: "No boundary directives, route conventions, or client hooks detected.",
  };
}
