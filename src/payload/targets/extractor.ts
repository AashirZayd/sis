import type {
  Module,
  ModuleItem,
  FunctionDeclaration,
  ArrowFunctionExpression,
  FunctionExpression,
  Param,
  Pattern,
  Statement,
} from "@swc/core";
import type { ServerAction } from "../../core/types.js";
import type { ParsedModule } from "../../parser/types.js";
import type { PropBoundaryEdge } from "../../boundary/types.js";
import { inferParameterShape } from "./inference.js";
import type { FuzzTarget } from "./types.js";

interface FunctionAstDetails {
  params: (Param | Pattern)[];
  bodyStmts?: Statement[];
}

/**
 * Discovers and extracts explicit fuzzing targets across Server Actions and prop boundaries.
 */
export function extractFuzzTargets(
  parsed: ParsedModule,
  actions: ServerAction[],
  propEdges?: PropBoundaryEdge[]
): FuzzTarget[] {
  const targets: FuzzTarget[] = [];

  for (const action of actions) {
    const fnAst = findActionFunctionAst(parsed.ast, action.name);

    if (fnAst && fnAst.params.length > 0) {
      fnAst.params.forEach((param, index) => {
        const paramName = getParamName(param) || `arg${index}`;
        const shape = inferParameterShape(param, fnAst.bodyStmts);

        targets.push({
          id: `${parsed.file}:${action.name}:arg${index}:${paramName}`,
          kind: "server-action-argument",
          file: parsed.file,
          location: action.location,
          actionName: action.name,
          parameterName: paramName,
          parameterIndex: index,
          inferredShape: shape,
          boundaryKind: "server-action",
          invariants: ["runtime-safety", "argument-shape", "serializable"],
          executionCompatibility: action.executionCompatibility ?? "sandbox-compatible",
        });
      });
    } else {
      // 0-parameter action or unknown signature: single default target
      targets.push({
        id: `${parsed.file}:${action.name}:default`,
        kind: "server-action-argument",
        file: parsed.file,
        location: action.location,
        actionName: action.name,
        parameterName: "input",
        parameterIndex: 0,
        inferredShape: { kind: "unknown" },
        boundaryKind: "server-action",
        invariants: ["runtime-safety", "serializable"],
        executionCompatibility: action.executionCompatibility ?? "sandbox-compatible",
      });
    }

    // Server Action return target
    targets.push({
      id: `${parsed.file}:${action.name}:return`,
      kind: "server-action-return",
      file: parsed.file,
      location: action.location,
      actionName: action.name,
      inferredShape: { kind: "unknown" },
      boundaryKind: "server-action",
      invariants: ["return-value-shape", "serializable", "no-secret-crossing"],
      executionCompatibility: "static-only",
    });
  }

  // Prop boundary targets
  if (propEdges && propEdges.length > 0) {
    for (const edge of propEdges) {
      targets.push({
        id: `${edge.serverFile}:${edge.clientComponent}:${edge.propName}`,
        kind: "server-to-client-prop",
        file: edge.serverFile,
        location: edge.location,
        componentName: edge.clientComponent,
        propName: edge.propName,
        inferredShape: { kind: "unknown" },
        boundaryKind: "server-to-client-props",
        invariants: ["serializable", "no-secret-crossing"],
        executionCompatibility: "static-only",
      });
    }
  }

  return targets;
}

function findActionFunctionAst(
  ast: Module,
  actionName: string
): FunctionAstDetails | null {
  for (const item of ast.body) {
    // 1. ExportDeclaration -> FunctionDeclaration / VariableDeclaration
    if (item.type === "ExportDeclaration") {
      const decl = item.declaration;
      if (decl) {
        if (decl.type === "FunctionDeclaration" && decl.identifier?.value === actionName) {
          return {
            params: decl.params,
            bodyStmts: decl.body?.stmts,
          };
        }
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type === "Identifier" && d.id.value === actionName && d.init) {
              const fn = d.init;
              if (fn.type === "ArrowFunctionExpression") {
                return {
                  params: fn.params,
                  bodyStmts: fn.body.type === "BlockStatement" ? fn.body.stmts : undefined,
                };
              }
              if (fn.type === "FunctionExpression") {
                return {
                  params: fn.params,
                  bodyStmts: fn.body?.stmts,
                };
              }
            }
          }
        }
      }
    }

    // 2. Direct top-level FunctionDeclaration
    if (item.type === "FunctionDeclaration" && item.identifier?.value === actionName) {
      return {
        params: item.params,
        bodyStmts: item.body?.stmts,
      };
    }

    // 3. Direct top-level VariableDeclaration
    if (item.type === "VariableDeclaration") {
      for (const d of item.declarations) {
        if (d.id.type === "Identifier" && d.id.value === actionName && d.init) {
          const fn = d.init;
          if (fn.type === "ArrowFunctionExpression") {
            return {
              params: fn.params,
              bodyStmts: fn.body.type === "BlockStatement" ? fn.body.stmts : undefined,
            };
          }
          if (fn.type === "FunctionExpression") {
            return {
              params: fn.params,
              bodyStmts: fn.body?.stmts,
            };
          }
        }
      }
    }

    // 4. Default export function
    if (item.type === "ExportDefaultDeclaration") {
      const decl = item.decl as any;
      if (decl && (decl.type === "FunctionDeclaration" || decl.type === "FunctionExpression")) {
        const name = decl.identifier?.value ?? "default";
        if (name === actionName || actionName === "default") {
          return {
            params: decl.params,
            bodyStmts: decl.body?.stmts,
          };
        }
      }
    }
  }

  return null;
}

function getParamName(param: Param | Pattern): string | undefined {
  const pat: Pattern = (param as Param).pat !== undefined ? (param as Param).pat : (param as Pattern);
  if (pat.type === "Identifier") {
    return pat.value;
  }
  if (pat.type === "AssignmentPattern" && pat.left.type === "Identifier") {
    return pat.left.value;
  }
  if (pat.type === "ObjectPattern") {
    return "destructuredObject";
  }
  if (pat.type === "ArrayPattern") {
    return "destructuredArray";
  }
  return undefined;
}
