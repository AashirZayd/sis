import type { Module, ModuleItem, Statement, ReturnStatement } from "@swc/core";
import type { SourceMapLocator } from "../parser/location.js";
import type { ExecutionMode, PrefixBoundary, StoppedAt } from "./types.js";
import { isPreludeSupported } from "./preludes/index.js";
import {
  UNSUPPORTED_HOST_GLOBALS,
  EXTERNAL_CLOUD_PACKAGE_PATTERNS,
} from "./compatibility.js";

/**
 * Result of analyzing an action function for selective prefix verification.
 */
export interface ActionPrefixAnalysis {
  readonly mode: ExecutionMode;
  readonly preludesNeeded: string[];
  readonly prefixStatementsCount: number;
  readonly totalStatementsCount: number;
  readonly stoppedAt?: StoppedAt;
  readonly verifiedPrefix?: PrefixBoundary;
  readonly prefixAstNode?: unknown;
  readonly reason?: string;
}

/**
 * Helper to collect external module and cloud imports from module AST.
 * Any import that is not a supported deterministic prelude cannot be resolved
 * inside the isolated-vm sandbox and must be treated as an external dependency.
 */
export function getExternalModuleBindings(
  moduleAst?: Module
): Map<string, { source: string; reason: StoppedAt["reason"] }> {
  const bindings = new Map<string, { source: string; reason: StoppedAt["reason"] }>();
  if (!moduleAst || !moduleAst.body) return bindings;

  for (const item of moduleAst.body) {
    if (item.type === "ImportDeclaration") {
      if (item.typeOnly) continue;
      const src = item.source?.value ?? "";
      const isCloud = EXTERNAL_CLOUD_PACKAGE_PATTERNS.some((pat) => pat.test(src));
      const isFramework = src.startsWith("next") || src.startsWith("react");
      const reason: StoppedAt["reason"] = isCloud
        ? "cloud-sdk"
        : isFramework
          ? "framework-boundary"
          : "cloud-sdk";

      if (item.specifiers) {
        for (const spec of item.specifiers) {
          if ((spec as { isTypeOnly?: boolean }).isTypeOnly) continue;
          if (spec.local?.value) {
            const localName = spec.local.value;
            if (!isPreludeSupported(localName)) {
              bindings.set(localName, { source: src, reason });
            }
          }
        }
      }
    }
  }

  return bindings;
}

/**
 * Scans an AST subtree for references to unsupported dependencies or needed preludes.
 */
export function scanNodeDependencies(
  node: unknown,
  externalBindings: Map<string, { source: string; reason: StoppedAt["reason"] }>
): {
  unsupportedDependency?: { name: string; reason: StoppedAt["reason"]; span: { start: number; end: number } };
  preludesUsed: Set<string>;
} {
  let unsupportedDependency:
    | { name: string; reason: StoppedAt["reason"]; span: { start: number; end: number } }
    | undefined;
  const preludesUsed = new Set<string>();

  function scan(n: unknown): void {
    if (!n || typeof n !== "object" || unsupportedDependency) return;

    if ((n as { type?: string }).type === "Identifier") {
      const name = (n as { value?: string }).value;
      const span = (n as { span?: { start: number; end: number } }).span ?? { start: 0, end: 0 };
      if (name) {
        if (isPreludeSupported(name)) {
          preludesUsed.add(name);
          return;
        }
        if (UNSUPPORTED_HOST_GLOBALS.has(name)) {
          unsupportedDependency = {
            name,
            reason: "unsupported-runtime",
            span,
          };
          return;
        }
        if (externalBindings.has(name)) {
          const binding = externalBindings.get(name)!;
          unsupportedDependency = {
            name,
            reason: binding.reason,
            span,
          };
          return;
        }
      }
    }

    for (const key of Object.keys(n)) {
      if (
        key === "span" ||
        key === "typeAnnotation" ||
        key === "typeParameters" ||
        key === "returnType"
      ) {
        continue;
      }
      const val = (n as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        for (const child of val) scan(child);
      } else if (typeof val === "object") {
        scan(val);
      }
    }
  }

  scan(node);
  return { unsupportedDependency, preludesUsed };
}

/**
 * Extracts the body statements from a function-like AST node.
 */
function getFunctionStatements(node: unknown): { stmts: Statement[]; bodyNode: unknown } | null {
  if (!node || typeof node !== "object") return null;

  const n = node as Record<string, unknown>;

  // FunctionDeclaration
  if (n.type === "FunctionDeclaration" && n.body && typeof n.body === "object") {
    const body = n.body as { type: string; stmts?: Statement[] };
    if ((body.type === "BlockStatement" || body.type === "FunctionBody") && Array.isArray(body.stmts)) {
      return { stmts: body.stmts, bodyNode: body };
    }
  }

  // ExportDeclaration wrapping FunctionDeclaration
  if (n.type === "ExportDeclaration" && n.declaration && typeof n.declaration === "object") {
    return getFunctionStatements(n.declaration);
  }

  // VariableDeclarator init: ArrowFunctionExpression or FunctionExpression
  if (n.type === "VariableDeclarator" && n.init && typeof n.init === "object") {
    const init = n.init as Record<string, unknown>;
    if (init.body && typeof init.body === "object") {
      const body = init.body as { type: string; stmts?: Statement[] };
      if ((body.type === "BlockStatement" || body.type === "FunctionBody") && Array.isArray(body.stmts)) {
        return { stmts: body.stmts, bodyNode: body };
      }
    }
  }

  // VariableDeclaration containing declarators
  if (n.type === "VariableDeclaration" && Array.isArray(n.declarations)) {
    for (const decl of n.declarations) {
      const res = getFunctionStatements(decl);
      if (res) return res;
    }
  }

  return null;
}

/**
 * Extracts parameter AST nodes from a function-like AST node.
 */
function getFunctionParams(node: unknown): unknown[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;

  if (n.type === "FunctionDeclaration" && Array.isArray(n.params)) {
    return n.params;
  }
  if (n.type === "ExportDeclaration" && n.declaration) {
    return getFunctionParams(n.declaration);
  }
  if (n.type === "VariableDeclarator" && n.init && typeof n.init === "object") {
    const init = n.init as Record<string, unknown>;
    if (Array.isArray(init.params)) {
      return init.params;
    }
  }
  if (n.type === "VariableDeclaration" && Array.isArray(n.declarations)) {
    for (const decl of n.declarations) {
      const p = getFunctionParams(decl);
      if (p.length > 0) return p;
    }
  }
  return [];
}

/**
 * Checks whether any parameter has a type annotation referencing FormData.
 * Actions taking FormData are form actions that require browser/framework form-submission context.
 */
function hasFormDataParam(params: unknown[]): boolean {
  for (const p of params) {
    if (!p || typeof p !== "object") continue;
    const pRec = p as Record<string, unknown>;

    const target =
      pRec.type === "Parameter" && pRec.pat && typeof pRec.pat === "object"
        ? (pRec.pat as Record<string, unknown>)
        : pRec;

    const tsTypeAnn = (target.typeAnnotation as Record<string, unknown>)
      ?.typeAnnotation as Record<string, unknown> | undefined;
    if (tsTypeAnn) {
      if (tsTypeAnn.type === "TsTypeReference") {
        const typeName = tsTypeAnn.typeName as Record<string, unknown> | undefined;
        if (typeName?.type === "Identifier" && typeName?.value === "FormData") {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Known infrastructure singletons that must remain static-only to prevent framework artifact regressions.
 * Mandated by Phase 25 spec section 9.G: Upstash Redis and @ai-sdk/rsc remain static-only.
 */
function isUpstashOrAiSdk(depName: string, depSource?: string): boolean {
  if (
    depName === "redis" ||
    depName === "ratelimit" ||
    depName === "createStreamableValue" ||
    depName === "ai"
  ) {
    return true;
  }
  if (
    depSource &&
    (/^@upstash\//.test(depSource) ||
      /^@\/lib\/upstash/.test(depSource) ||
      /^@ai-sdk\//.test(depSource) ||
      /^ai$/.test(depSource))
  ) {
    return true;
  }
  return false;
}

/**
 * Creates a return sentinel AST node to complete a verified prefix function.
 * return { __sis_prefix_complete: true };
 */
function createPrefixReturnSentinel(): ReturnStatement {
  return {
    type: "ReturnStatement",
    span: { start: 0, end: 0, ctxt: 0 },
    argument: {
      type: "ObjectExpression",
      span: { start: 0, end: 0, ctxt: 0 },
      properties: [
        {
          type: "KeyValueProperty",
          key: {
            type: "Identifier",
            span: { start: 0, end: 0, ctxt: 0 },
            value: "__sis_prefix_complete",
            optional: false,
          },
          value: {
            type: "BooleanLiteral",
            span: { start: 0, end: 0, ctxt: 0 },
            value: true,
          },
        },
      ],
    },
  };
}

/**
 * Clones a function AST node with a sliced body for prefix verification.
 */
function cloneWithPrefixStatements(
  node: unknown,
  prefixStmts: Statement[]
): unknown {
  const sentinel = createPrefixReturnSentinel();
  const newStmts = [...prefixStmts, sentinel];

  const n = node as Record<string, unknown>;

  if (n.type === "FunctionDeclaration") {
    return {
      ...n,
      body: {
        ...(n.body as Record<string, unknown>),
        stmts: newStmts,
      },
    };
  }

  if (n.type === "ExportDeclaration" && n.declaration) {
    return {
      ...n,
      declaration: cloneWithPrefixStatements(n.declaration, prefixStmts),
    };
  }

  if (n.type === "VariableDeclaration" && Array.isArray(n.declarations)) {
    return {
      ...n,
      declarations: n.declarations.map((decl: Record<string, unknown>) => {
        if (decl.init && typeof decl.init === "object") {
          const init = decl.init as Record<string, unknown>;
          if (init.body && typeof init.body === "object") {
            return {
              ...decl,
              init: {
                ...init,
                body: {
                  ...(init.body as Record<string, unknown>),
                  stmts: newStmts,
                },
              },
            };
          }
        }
        return decl;
      }),
    };
  }

  return node;
}

/**
 * Analyzes an action function AST node for selective runtime verification.
 * Determines whether it can execute in FULL mode, PREFIX mode, or must remain STATIC_ONLY.
 */
export function analyzeActionPrefix(
  actionNode: unknown,
  moduleAst?: Module,
  locator?: SourceMapLocator
): ActionPrefixAnalysis {
  const externalBindings = getExternalModuleBindings(moduleAst);
  const fnStmtsInfo = getFunctionStatements(actionNode);

  if (!fnStmtsInfo || fnStmtsInfo.stmts.length === 0) {
    // If no statements or cannot inspect body, fallback to whole-node dependency check
    const wholeScan = scanNodeDependencies(actionNode, externalBindings);
    if (wholeScan.unsupportedDependency) {
      return {
        mode: "STATIC_ONLY",
        preludesNeeded: Array.from(wholeScan.preludesUsed),
        prefixStatementsCount: 0,
        totalStatementsCount: 0,
        stoppedAt: {
          dependency: wholeScan.unsupportedDependency.name,
          reason: wholeScan.unsupportedDependency.reason,
        },
        reason: "Function contains unsupported dependency at root and no block statements",
      };
    }
    return {
      mode: "FULL",
      preludesNeeded: Array.from(wholeScan.preludesUsed),
      prefixStatementsCount: 0,
      totalStatementsCount: 0,
    };
  }

  const { stmts } = fnStmtsInfo;
  const preludesUsed = new Set<string>();

  // Check function parameters
  const params = getFunctionParams(actionNode);

  // Check if any parameter expects FormData (browser/framework form-submission context)
  if (hasFormDataParam(params)) {
    return {
      mode: "STATIC_ONLY",
      preludesNeeded: [],
      prefixStatementsCount: 0,
      totalStatementsCount: stmts.length,
      reason: "Action parameter expects FormData which requires browser/framework form-submission context, classified as static-only",
    };
  }

  // Check whether the action references Upstash Redis or @ai-sdk/rsc (Phase 22 framework artifacts)
  const wholeScan = scanNodeDependencies(actionNode, externalBindings);
  if (wholeScan.unsupportedDependency) {
    const depName = wholeScan.unsupportedDependency.name;
    const depSource = externalBindings.get(depName)?.source;
    if (isUpstashOrAiSdk(depName, depSource)) {
      const stopLine =
        locator && wholeScan.unsupportedDependency.span
          ? locator.getLocation(wholeScan.unsupportedDependency.span.start).line
          : undefined;
      return {
        mode: "STATIC_ONLY",
        preludesNeeded: Array.from(wholeScan.preludesUsed),
        prefixStatementsCount: 0,
        totalStatementsCount: stmts.length,
        stoppedAt: {
          dependency: depName,
          reason: wholeScan.unsupportedDependency.reason,
          line: stopLine,
        },
        reason: `Action references ${depName} (${depSource ?? "infrastructure"}), classified as static-only to prevent framework artifact regressions`,
      };
    }
  }

  // Check function parameter defaults for unsupported dependencies
  for (const param of params) {
    const paramScan = scanNodeDependencies(param, externalBindings);
    for (const p of paramScan.preludesUsed) {
      preludesUsed.add(p);
    }
    if (paramScan.unsupportedDependency) {
      const stopLine = locator && paramScan.unsupportedDependency.span
        ? locator.getLocation(paramScan.unsupportedDependency.span.start).line
        : undefined;
      return {
        mode: "STATIC_ONLY",
        preludesNeeded: Array.from(preludesUsed),
        prefixStatementsCount: 0,
        totalStatementsCount: stmts.length,
        stoppedAt: {
          dependency: paramScan.unsupportedDependency.name,
          reason: paramScan.unsupportedDependency.reason,
          line: stopLine,
        },
        reason: `Function parameter references unsupported dependency '${paramScan.unsupportedDependency.name}', classified as static-only`,
      };
    }
  }

  let firstUnsupportedIdx = -1;

  let firstUnsupportedDep:
    | { name: string; reason: StoppedAt["reason"]; span: { start: number; end: number } }
    | undefined;

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const scanRes = scanNodeDependencies(stmt, externalBindings);

    for (const p of scanRes.preludesUsed) {
      preludesUsed.add(p);
    }

    if (scanRes.unsupportedDependency) {
      firstUnsupportedIdx = i;
      firstUnsupportedDep = scanRes.unsupportedDependency;
      break;
    }
  }

  // Case 1: No unsupported dependency found in any statement -> FULL verification
  if (firstUnsupportedIdx === -1) {
    return {
      mode: "FULL",
      preludesNeeded: Array.from(preludesUsed),
      prefixStatementsCount: stmts.length,
      totalStatementsCount: stmts.length,
    };
  }

  // Calculate stoppedAt location if locator is available
  const stopLine = locator && firstUnsupportedDep?.span
    ? locator.getLocation(firstUnsupportedDep.span.start).line
    : undefined;

  const stoppedAt: StoppedAt = {
    dependency: firstUnsupportedDep!.name,
    reason: firstUnsupportedDep!.reason,
    line: stopLine,
  };

  // Case 2: The very first statement references an unsupported dependency -> STATIC_ONLY
  if (firstUnsupportedIdx === 0) {
    return {
      mode: "STATIC_ONLY",
      preludesNeeded: Array.from(preludesUsed),
      prefixStatementsCount: 0,
      totalStatementsCount: stmts.length,
      stoppedAt,
      reason: `First statement references unsupported dependency '${stoppedAt.dependency}', classified as static-only`,
    };
  }

  // Case 3: firstUnsupportedIdx > 0 -> PREFIX verification
  const prefixStmts = stmts.slice(0, firstUnsupportedIdx);
  const prefixAstNode = cloneWithPrefixStatements(actionNode, prefixStmts);

  let verifiedPrefix: PrefixBoundary | undefined;
  if (locator && prefixStmts.length > 0) {
    const firstSpan = (prefixStmts[0] as { span?: { start: number; end: number } }).span;
    const lastSpan = (prefixStmts[prefixStmts.length - 1] as { span?: { start: number; end: number } }).span;
    if (firstSpan && lastSpan) {
      const startLoc = locator.getLocation(firstSpan.start);
      const endLoc = locator.getLocation(lastSpan.end);
      verifiedPrefix = {
        startLine: startLoc.line,
        endLine: endLoc.line,
        startColumn: startLoc.column,
        endColumn: endLoc.column,
      };
    }
  }

  return {
    mode: "PREFIX",
    preludesNeeded: Array.from(preludesUsed),
    prefixStatementsCount: firstUnsupportedIdx,
    totalStatementsCount: stmts.length,
    stoppedAt,
    verifiedPrefix,
    prefixAstNode,
    reason: `Action contains verifiable prefix (statements 1..${firstUnsupportedIdx}) before unsupported dependency '${stoppedAt.dependency}'`,
  };
}
