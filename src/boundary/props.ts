import type {
  Expression,
  JSXElement,
  JSXFragment,
  ModuleItem,
  Statement,
} from "@swc/core";
import type { Finding } from "../core/types.js";
import type { ModuleGraph, ModuleNode, DataFlowShape } from "../dataflow/types.js";
import { evaluateExpressionShape, applyDestructuring } from "../dataflow/transfer.js";
import { checkSerializability } from "./serializability.js";
import type { PropBoundaryEdge } from "./types.js";

export interface PropAnalysisResult {
  edges: PropBoundaryEdge[];
  findings: Finding[];
  verifiedSafeProps: number;
  serializabilityViolations: number;
  unknownSerializability: number;
}

/**
 * Analyzes Server-to-Client component boundaries where props cross from Server Components
 * into Client Components.
 */
export function analyzePropBoundaries(graph: ModuleGraph): PropAnalysisResult {
  const edges: PropBoundaryEdge[] = [];
  const findings: Finding[] = [];
  let verifiedSafeProps = 0;
  let serializabilityViolations = 0;
  let unknownSerializability = 0;

  for (const node of graph.modules.values()) {
    // Only Server Components render Client Components across boundaries
    if (node.isClientBoundary) {
      continue;
    }

    // Build map of imported Client Components in this Server Component
    const clientImports = new Map<string, string>(); // ComponentName -> client module path
    for (const [localName, binding] of node.imports.entries()) {
      if (binding.resolvedModule) {
        const importedNode = graph.modules.get(binding.resolvedModule);
        if (importedNode && importedNode.isClientBoundary) {
          clientImports.set(localName, binding.resolvedModule);
        }
      }
    }

    if (clientImports.size === 0) {
      continue;
    }

    const isServerFunction = (name: string): boolean => {
      const fn = node.functions.get(name);
      return fn ? true : false;
    };

    // Walk AST for JSX elements matching client component names
    for (const item of node.ast.body) {
      walkModuleItemForProps(
        graph,
        node,
        item,
        clientImports,
        isServerFunction,
        edges,
        findings,
        (status) => {
          if (status === "serializable") verifiedSafeProps++;
          else if (status === "unsupported") serializabilityViolations++;
          else unknownSerializability++;
        }
      );
    }
  }

  return {
    edges,
    findings,
    verifiedSafeProps,
    serializabilityViolations,
    unknownSerializability,
  };
}

function walkModuleItemForProps(
  graph: ModuleGraph,
  node: ModuleNode,
  item: ModuleItem,
  clientImports: Map<string, string>,
  isServerFunction: (name: string) => boolean,
  edges: PropBoundaryEdge[],
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  if (item.type === "FunctionDeclaration" && item.body) {
    walkStatements(
      graph,
      node,
      item.body.stmts,
      clientImports,
      isServerFunction,
      edges,
      findings,
      onStatus
    );
  } else if (item.type === "ExportDefaultDeclaration") {
    const decl = item.decl as any;
    if (decl && (decl.type === "FunctionDeclaration" || decl.type === "FunctionExpression") && decl.body) {
      walkStatements(
        graph,
        node,
        decl.body.stmts,
        clientImports,
        isServerFunction,
        edges,
        findings,
        onStatus
      );
    }
  } else if (item.type === "ExportDeclaration") {
    const decl = item.declaration;
    if (decl && decl.type === "FunctionDeclaration" && decl.body) {
      walkStatements(
        graph,
        node,
        decl.body.stmts,
        clientImports,
        isServerFunction,
        edges,
        findings,
        onStatus
      );
    }
  }
}

function walkStatements(
  graph: ModuleGraph,
  node: ModuleNode,
  stmts: Statement[],
  clientImports: Map<string, string>,
  isServerFunction: (name: string) => boolean,
  edges: PropBoundaryEdge[],
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  const localDecls = new Map<string, Expression>();
  const localEnv = new Map<string, DataFlowShape>();

  const lookupFunction = (calleeName: string, namespace?: string) => {
    if (namespace) {
      const importBinding = node.imports.get(namespace);
      if (importBinding && importBinding.resolvedModule) {
        const targetNode = graph.modules.get(importBinding.resolvedModule);
        if (targetNode) {
          const exp = targetNode.exports.get(calleeName);
          const local = exp?.localName ?? calleeName;
          return targetNode.functions.get(local);
        }
      }
      return undefined;
    }
    const localFn = node.functions.get(calleeName);
    if (localFn) return localFn;

    const importBinding = node.imports.get(calleeName);
    if (importBinding && importBinding.resolvedModule) {
      const targetNode = graph.modules.get(importBinding.resolvedModule);
      if (targetNode) {
        const exp = targetNode.exports.get(importBinding.importedName);
        const local = exp?.localName ?? importBinding.importedName;
        return targetNode.functions.get(local);
      }
    }
    return undefined;
  };

  for (const stmt of stmts) {
    if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) {
        if (decl.init) {
          const shape = evaluateExpressionShape(
            decl.init,
            localEnv,
            node.locator,
            lookupFunction
          );
          applyDestructuring(decl.id, shape, localEnv);
          if (decl.id.type === "Identifier") {
            localDecls.set(decl.id.value, decl.init);
          }
        }
      }
    }
  }

  for (const stmt of stmts) {
    if (stmt.type === "ReturnStatement" && stmt.argument) {
      inspectExpressionForJsx(
        node,
        stmt.argument,
        clientImports,
        isServerFunction,
        edges,
        findings,
        onStatus,
        localDecls,
        localEnv
      );
    } else if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) {
        if (decl.init) {
          inspectExpressionForJsx(
            node,
            decl.init,
            clientImports,
            isServerFunction,
            edges,
            findings,
            onStatus,
            localDecls,
            localEnv
          );
        }
      }
    }
  }
}

function inspectExpressionForJsx(
  node: ModuleNode,
  expr: Expression,
  clientImports: Map<string, string>,
  isServerFunction: (name: string) => boolean,
  edges: PropBoundaryEdge[],
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void,
  localDecls?: Map<string, Expression>,
  localEnv?: Map<string, DataFlowShape>
): void {
  if (expr.type === "JSXElement") {
    inspectJsxElement(
      node,
      expr as JSXElement,
      clientImports,
      isServerFunction,
      edges,
      findings,
      onStatus,
      localDecls,
      localEnv
    );
  } else if (expr.type === "JSXFragment") {
    for (const child of (expr as JSXFragment).children) {
      if (child.type === "JSXElement") {
        inspectJsxElement(
          node,
          child,
          clientImports,
          isServerFunction,
          edges,
          findings,
          onStatus,
          localDecls,
          localEnv
        );
      }
    }
  } else if (expr.type === "ParenthesisExpression") {
    inspectExpressionForJsx(
      node,
      (expr as any).expression,
      clientImports,
      isServerFunction,
      edges,
      findings,
      onStatus,
      localDecls,
      localEnv
    );
  }
}

function inspectJsxElement(
  node: ModuleNode,
  el: JSXElement,
  clientImports: Map<string, string>,
  isServerFunction: (name: string) => boolean,
  edges: PropBoundaryEdge[],
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void,
  localDecls?: Map<string, Expression>,
  localEnv?: Map<string, DataFlowShape>
): void {
  const opening = el.opening;
  let componentName: string | undefined;

  if (opening.name.type === "Identifier") {
    componentName = opening.name.value;
  }

  if (componentName && clientImports.has(componentName)) {
    const clientFile = clientImports.get(componentName);

    // Inspect props passed to this Client Component
    for (const attr of opening.attributes) {
      if (attr.type === "JSXAttribute" && attr.name.type === "Identifier") {
        const propName = attr.name.value;
        const loc = node.locator.getLocation(attr.span.start);

        if (attr.value && attr.value.type === "JSXExpressionContainer") {
          const propExpr = attr.value.expression;
          const result = checkSerializability(
            propExpr,
            localEnv ?? new Map(),
            node.locator,
            isServerFunction,
            localDecls
          );

          onStatus(result.status);

          edges.push({
            serverFile: node.filePath,
            clientComponent: componentName,
            clientComponentFile: clientFile,
            propName,
            location: loc,
            status: result.status,
            reason: result.reason,
            isTainted: result.taintViolation,
          });

          if (result.status === "unsupported") {
            if (result.taintViolation) {
              findings.push({
                type: "taint-violation",
                severity: "error",
                boundaryKind: "server-to-client-props",
                direction: "server-to-client",
                verification: "static",
                message: `Sensitive environment secret passed as prop "${propName}" to Client Component <${componentName} />`,
                location: loc,
                trace: [
                  ...(result.trace ?? [result.reason ?? "secret"]),
                  `${node.filePath}:<${componentName} ${propName}={...} />`,
                ],
              });
            } else {
              findings.push({
                type: "serialization-violation",
                severity: "error",
                boundaryKind: "server-to-client-props",
                direction: "server-to-client",
                verification: "static",
                message: `Non-serializable value passed as prop "${propName}" to Client Component <${componentName} />: ${result.reason}`,
                location: loc,
              });
            }
          }
        } else {
          // String literal prop: e.g. <Profile title="My Profile" />
          onStatus("serializable");
          edges.push({
            serverFile: node.filePath,
            clientComponent: componentName,
            clientComponentFile: clientFile,
            propName,
            location: loc,
            status: "serializable",
          });
        }
      }
    }
  }

  // Recurse into children
  for (const child of el.children) {
    if (child.type === "JSXElement") {
      inspectJsxElement(
        node,
        child,
        clientImports,
        isServerFunction,
        edges,
        findings,
        onStatus
      );
    }
  }
}
