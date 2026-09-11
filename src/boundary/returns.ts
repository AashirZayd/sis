import type {
  Statement,
  Expression,
  FunctionDeclaration,
  ArrowFunctionExpression,
  FunctionExpression,
  ModuleItem,
} from "@swc/core";
import type { Finding, ServerAction } from "../core/types.js";
import type { ModuleGraph, ModuleNode, DataFlowShape } from "../dataflow/types.js";
import { evaluateExpressionShape, applyDestructuring } from "../dataflow/transfer.js";
import { checkSerializability, hasFunctionLevelServerDirective } from "./serializability.js";
import { NextBoundaryVisitor } from "./visitor.js";
import { isRouteHandlerPath } from "./classifier.js";

export interface ReturnAnalysisResult {
  findings: Finding[];
  verifiedSafeReturns: number;
  returnViolations: number;
  unknownReturns: number;
}

/**
 * Analyzes the return statements of all Server Actions across the module graph
 * to ensure return values are serializable in React Flight and do not leak secrets.
 */
export function analyzeReturnBoundaries(graph: ModuleGraph): ReturnAnalysisResult {
  const findings: Finding[] = [];
  let verifiedSafeReturns = 0;
  let returnViolations = 0;
  let unknownReturns = 0;

  for (const node of graph.modules.values()) {
    // Route Handlers communicate via HTTP request/response semantics and must NOT
    // be evaluated under React Flight Server Action return-value serialization rules.
    if (
      node.boundaryClassification?.kind === "route-handler" ||
      isRouteHandlerPath(node.filePath)
    ) {
      continue;
    }

    const visitor = new NextBoundaryVisitor(node.filePath, node.locator);
    const boundaryRes = visitor.visit(node.ast);

    if (boundaryRes.actions.length === 0) {
      continue;
    }

    const actionMap = new Map<string, ServerAction>();
    for (const act of boundaryRes.actions) {
      actionMap.set(act.name, act);
    }

    const isServerFunction = (name: string): boolean => {
      return actionMap.has(name) || node.functions.has(name);
    };

    for (const item of node.ast.body) {
      walkItemForServerActionReturns(
        node,
        item,
        actionMap,
        isServerFunction,
        findings,
        (status) => {
          if (status === "serializable") verifiedSafeReturns++;
          else if (status === "unsupported") returnViolations++;
          else unknownReturns++;
        }
      );
    }
  }

  return {
    findings,
    verifiedSafeReturns,
    returnViolations,
    unknownReturns,
  };
}

function walkItemForServerActionReturns(
  node: ModuleNode,
  item: ModuleItem,
  actionMap: Map<string, ServerAction>,
  isServerFunction: (name: string) => boolean,
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  if (item.type === "FunctionDeclaration") {
    handleFunction(node, item, actionMap, isServerFunction, findings, onStatus);
  } else if (item.type === "ExportDeclaration") {
    const decl = item.declaration;
    if (decl) {
      if (decl.type === "FunctionDeclaration") {
        handleFunction(node, decl, actionMap, isServerFunction, findings, onStatus);
      } else if (decl.type === "VariableDeclaration") {
        for (const declarator of decl.declarations) {
          if (declarator.id.type === "Identifier" && declarator.init) {
            const name = declarator.id.value;
            const action = actionMap.get(name);
            if (action) {
              inspectFunctionOrArrow(
                node,
                action,
                declarator.init,
                isServerFunction,
                findings,
                onStatus
              );
            }
          }
        }
      }
    }
  } else if (item.type === "ExportDefaultDeclaration") {
    const decl = item.decl as any;
    if (decl && (decl.type === "FunctionDeclaration" || decl.type === "FunctionExpression")) {
      const name = decl.identifier?.value ?? "default";
      const action = actionMap.get(name);
      if (action) {
        inspectFunctionOrArrow(node, action, decl, isServerFunction, findings, onStatus);
      }
    }
  } else if (item.type === "VariableDeclaration") {
    for (const declarator of item.declarations) {
      if (declarator.id.type === "Identifier" && declarator.init) {
        const name = declarator.id.value;
        const action = actionMap.get(name);
        if (action) {
          inspectFunctionOrArrow(
            node,
            action,
            declarator.init,
            isServerFunction,
            findings,
            onStatus
          );
        }
      }
    }
  }
}

function handleFunction(
  node: ModuleNode,
  fn: FunctionDeclaration,
  actionMap: Map<string, ServerAction>,
  isServerFunction: (name: string) => boolean,
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  const name = fn.identifier?.value;
  if (!name) return;

  const action = actionMap.get(name);
  if (!action) {
    // Check if inner statements contain inline "use server" actions
    if (fn.body) {
      for (const stmt of fn.body.stmts) {
        if (stmt.type === "FunctionDeclaration") {
          handleFunction(node, stmt, actionMap, isServerFunction, findings, onStatus);
        }
      }
    }
    return;
  }

  inspectFunctionOrArrow(node, action, fn, isServerFunction, findings, onStatus);
}

function inspectFunctionOrArrow(
  node: ModuleNode,
  action: ServerAction,
  fn: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression | Expression,
  isServerFunction: (name: string) => boolean,
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  // Arrow with expression body: const act = async () => expr;
  if (
    fn.type === "ArrowFunctionExpression" &&
    fn.body &&
    fn.body.type !== "BlockStatement"
  ) {
    const expr = fn.body as Expression;
    checkAndRecordReturn(
      node,
      action,
      expr,
      new Map(),
      isServerFunction,
      findings,
      onStatus
    );
    return;
  }

  const body = (fn as any).body;
  if (!body || (body.type !== "BlockStatement" && body.type !== "FunctionBody")) {
    return;
  }

  const stmts = body.stmts as Statement[];
  const localEnv = new Map<string, DataFlowShape>();

  let hasExplicitReturn = false;

  for (const stmt of stmts) {
    if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) {
        if (decl.init) {
          const shape = evaluateExpressionShape(
            decl.init,
            localEnv,
            node.locator,
            () => undefined,
            0,
            5
          );
          applyDestructuring(decl.id, shape, localEnv);
        }
      }
    } else if (stmt.type === "ReturnStatement") {
      hasExplicitReturn = true;
      if (stmt.argument) {
        checkAndRecordReturn(
          node,
          action,
          stmt.argument,
          localEnv,
          isServerFunction,
          findings,
          onStatus
        );
      } else {
        // Explicit return; is undefined which is serializable
        onStatus("serializable");
      }
    }
  }

  if (!hasExplicitReturn) {
    // Void return -> undefined -> serializable
    onStatus("serializable");
  }
}

function checkAndRecordReturn(
  node: ModuleNode,
  action: ServerAction,
  expr: Expression,
  env: Map<string, DataFlowShape>,
  isServerFunction: (name: string) => boolean,
  findings: Finding[],
  onStatus: (status: "serializable" | "unsupported" | "unknown") => void
): void {
  const result = checkSerializability(expr, env, node.locator, isServerFunction);
  onStatus(result.status);

  const loc = node.locator.getLocation((expr as any).span?.start ?? 0);

  if (result.status === "unsupported") {
    if (result.taintViolation) {
      findings.push({
        type: "taint-violation",
        severity: "error",
        boundaryKind: "server-action",
        direction: "server-to-client",
        verification: "static",
        action: action.name,
        message: `Server Action "${action.name}" returns sensitive secret "${result.taintSource?.rawExpression ?? "secret"}" across client boundary`,
        location: loc,
        trace: [
          ...(result.trace ?? [result.reason ?? "secret"]),
          `${node.filePath}:${action.name}() return`,
        ],
      });
    } else {
      findings.push({
        type: "serialization-violation",
        severity: "error",
        boundaryKind: "server-action",
        direction: "server-to-client",
        verification: "static",
        action: action.name,
        message: `Server Action "${action.name}" returns non-serializable value: ${result.reason}`,
        location: loc,
      });
    }
  }
}
