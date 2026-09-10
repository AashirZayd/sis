import type {
  Expression,
  MemberExpression,
  CallExpression,
  ObjectExpression,
  ArrayExpression,
  TemplateLiteral,
  BinaryExpression,
  Pattern,
} from "@swc/core";
import type { SourceMapLocator } from "../parser/location.js";
import { extractSensitiveEnvSource } from "../taint/sources.js";
import type { TaintSource } from "../taint/types.js";
import type { DataFlowShape, FunctionSummary } from "./types.js";

export type FunctionLookup = (
  calleeName: string,
  namespace?: string
) => FunctionSummary | undefined;

/**
 * Checks if a DataFlowShape is directly tainted or contains any tainted properties/elements.
 */
export function isTaintedShape(shape: DataFlowShape): boolean {
  if (shape.kind === "tainted") {
    return true;
  }
  if (shape.kind === "object" && shape.properties) {
    for (const propShape of shape.properties.values()) {
      if (isTaintedShape(propShape)) {
        return true;
      }
    }
  }
  if (shape.kind === "array" && shape.elements) {
    for (const elemShape of shape.elements) {
      if (isTaintedShape(elemShape)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extracts the primary TaintSource and trace from a shape (or its child property).
 */
export function extractTaintInfo(
  shape: DataFlowShape
): { taintSource: TaintSource; trace: string[] } | null {
  if (shape.kind === "tainted" && shape.taintSource && shape.trace) {
    return { taintSource: shape.taintSource, trace: shape.trace };
  }

  if (shape.kind === "object" && shape.properties) {
    for (const [propName, propShape] of shape.properties.entries()) {
      const info = extractTaintInfo(propShape);
      if (info) {
        return {
          taintSource: info.taintSource,
          trace: [...info.trace, `.${propName}`],
        };
      }
    }
  }

  if (shape.kind === "array" && shape.elements) {
    for (let i = 0; i < shape.elements.length; i++) {
      const info = extractTaintInfo(shape.elements[i]);
      if (info) {
        return {
          taintSource: info.taintSource,
          trace: [...info.trace, `[${i}]`],
        };
      }
    }
  }

  return null;
}

/**
 * Accesses a property on a DataFlowShape preserving structural sensitivity.
 */
export function getPropertyShape(
  shape: DataFlowShape,
  propName: string
): DataFlowShape {
  if (shape.kind === "object" && shape.properties) {
    const found = shape.properties.get(propName);
    if (found) {
      return found;
    }
    return { kind: "clean" };
  }

  if (shape.kind === "array" && shape.elements) {
    const index = parseInt(propName, 10);
    if (!Number.isNaN(index) && shape.elements[index]) {
      return shape.elements[index];
    }
    return { kind: "clean" };
  }

  if (shape.kind === "param-ref") {
    return {
      kind: "param-ref",
      paramIndex: shape.paramIndex,
      propPath: [...(shape.propPath ?? []), propName],
    };
  }

  if (shape.kind === "tainted") {
    // If entire parent was tainted as a blob, property is tainted
    return {
      kind: "tainted",
      taintSource: shape.taintSource,
      trace: shape.trace ? [...shape.trace, `.${propName}`] : undefined,
    };
  }

  return { kind: "clean" };
}

/**
 * Replaces parameter references (`param-ref`) in a function return shape
 * with the concrete argument shapes passed to the call.
 */
export function substituteParams(
  returnShape: DataFlowShape,
  argShapes: DataFlowShape[]
): DataFlowShape {
  if (returnShape.kind === "param-ref") {
    const paramIdx = returnShape.paramIndex ?? 0;
    const argShape = argShapes[paramIdx] ?? { kind: "clean" };

    if (returnShape.propPath && returnShape.propPath.length > 0) {
      let current = argShape;
      for (const prop of returnShape.propPath) {
        current = getPropertyShape(current, prop);
      }
      return current;
    }

    return argShape;
  }

  if (returnShape.kind === "object" && returnShape.properties) {
    const properties = new Map<string, DataFlowShape>();
    for (const [k, v] of returnShape.properties.entries()) {
      properties.set(k, substituteParams(v, argShapes));
    }
    return { kind: "object", properties };
  }

  if (returnShape.kind === "array" && returnShape.elements) {
    const elements = returnShape.elements.map((el) =>
      substituteParams(el, argShapes)
    );
    return { kind: "array", elements };
  }

  return returnShape;
}

/**
 * Binds variables in environment according to destructuring pattern and RHS shape.
 */
export function applyDestructuring(
  pattern: Pattern,
  rhsShape: DataFlowShape,
  env: Map<string, DataFlowShape>
): void {
  if (pattern.type === "Identifier") {
    env.set(pattern.value, rhsShape);
    return;
  }

  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "AssignmentPatternProperty") {
        const propName = prop.key.value;
        const propShape = getPropertyShape(rhsShape, propName);
        env.set(propName, propShape);
      } else if (prop.type === "KeyValuePatternProperty") {
        let propName: string | undefined;
        if (prop.key.type === "Identifier") {
          propName = prop.key.value;
        } else if (prop.key.type === "StringLiteral") {
          propName = prop.key.value;
        }
        if (propName) {
          const propShape = getPropertyShape(rhsShape, propName);
          applyDestructuring(prop.value, propShape, env);
        }
      }
    }
    return;
  }

  if (pattern.type === "ArrayPattern") {
    for (let i = 0; i < pattern.elements.length; i++) {
      const elem = pattern.elements[i];
      if (!elem) continue;
      const elemShape = getPropertyShape(rhsShape, String(i));
      applyDestructuring(elem, elemShape, env);
    }
    return;
  }

  if (pattern.type === "AssignmentPattern") {
    applyDestructuring(pattern.left, rhsShape, env);
  }
}

/**
 * Evaluates an AST Expression within a local environment, resolving function calls
 * and tracking tainted data flows.
 */
export function evaluateExpressionShape(
  expr: Expression,
  env: Map<string, DataFlowShape>,
  locator: SourceMapLocator,
  lookupFunction: FunctionLookup,
  depth: number = 0,
  maxDepth: number = 8,
  visitedCalls: Set<string> = new Set()
): DataFlowShape {
  // 1. Direct sensitive environment source
  const directSource = extractSensitiveEnvSource(expr, locator);
  if (directSource) {
    return {
      kind: "tainted",
      taintSource: directSource,
      trace: [directSource.rawExpression],
    };
  }

  switch (expr.type) {
    case "Identifier": {
      return env.get(expr.value) ?? { kind: "clean" };
    }

    case "MemberExpression": {
      const member = expr as MemberExpression;
      const objShape = evaluateExpressionShape(
        member.object,
        env,
        locator,
        lookupFunction,
        depth,
        maxDepth,
        visitedCalls
      );

      let propName: string | undefined;
      if (member.property.type === "Identifier") {
        propName = member.property.value;
      } else {
        const propAny = member.property as any;
        if (propAny.type === "Computed" && propAny.expression) {
          if (propAny.expression.type === "StringLiteral") {
            propName = propAny.expression.value;
          } else if (propAny.expression.type === "NumericLiteral") {
            propName = String(propAny.expression.value);
          }
        }
      }

      if (propName) {
        return getPropertyShape(objShape, propName);
      }

      // Unresolved dynamic member access
      return { kind: "unknown" };
    }

    case "ObjectExpression": {
      const obj = expr as ObjectExpression;
      const properties = new Map<string, DataFlowShape>();

      for (const prop of obj.properties) {
        if (prop.type === "KeyValueProperty") {
          let propKey: string | undefined;
          if (prop.key.type === "Identifier") {
            propKey = prop.key.value;
          } else if (prop.key.type === "StringLiteral") {
            propKey = prop.key.value;
          }
          if (propKey) {
            const valShape = evaluateExpressionShape(
              prop.value,
              env,
              locator,
              lookupFunction,
              depth,
              maxDepth,
              visitedCalls
            );
            properties.set(propKey, valShape);
          }
        } else if (prop.type === "Identifier") {
          const valShape = env.get(prop.value) ?? { kind: "clean" };
          properties.set(prop.value, valShape);
        } else if (prop.type === "SpreadElement") {
          const spreadShape = evaluateExpressionShape(
            prop.arguments,
            env,
            locator,
            lookupFunction,
            depth,
            maxDepth,
            visitedCalls
          );
          if (spreadShape.kind === "object" && spreadShape.properties) {
            for (const [k, v] of spreadShape.properties.entries()) {
              properties.set(k, v);
            }
          }
        }
      }

      return { kind: "object", properties };
    }

    case "ArrayExpression": {
      const arr = expr as ArrayExpression;
      const elements: DataFlowShape[] = [];

      for (const elem of arr.elements) {
        if (!elem) {
          elements.push({ kind: "clean" });
        } else if (elem.expression) {
          elements.push(
            evaluateExpressionShape(
              elem.expression,
              env,
              locator,
              lookupFunction,
              depth,
              maxDepth,
              visitedCalls
            )
          );
        }
      }

      return { kind: "array", elements };
    }

    case "TemplateLiteral": {
      const tmpl = expr as TemplateLiteral;
      for (const subExpr of tmpl.expressions) {
        const subShape = evaluateExpressionShape(
          subExpr,
          env,
          locator,
          lookupFunction,
          depth,
          maxDepth,
          visitedCalls
        );
        const taint = extractTaintInfo(subShape);
        if (taint) {
          return {
            kind: "tainted",
            taintSource: taint.taintSource,
            trace: [...taint.trace, "template literal"],
          };
        }
      }
      return { kind: "clean" };
    }

    case "BinaryExpression": {
      const bin = expr as BinaryExpression;
      if (bin.operator === "+") {
        const leftShape = evaluateExpressionShape(
          bin.left,
          env,
          locator,
          lookupFunction,
          depth,
          maxDepth,
          visitedCalls
        );
        const rightShape = evaluateExpressionShape(
          bin.right,
          env,
          locator,
          lookupFunction,
          depth,
          maxDepth,
          visitedCalls
        );

        const leftTaint = extractTaintInfo(leftShape);
        if (leftTaint) {
          return {
            kind: "tainted",
            taintSource: leftTaint.taintSource,
            trace: [...leftTaint.trace, "binary expression (+)"],
          };
        }

        const rightTaint = extractTaintInfo(rightShape);
        if (rightTaint) {
          return {
            kind: "tainted",
            taintSource: rightTaint.taintSource,
            trace: [...rightTaint.trace, "binary expression (+)"],
          };
        }
      }
      return { kind: "clean" };
    }

    case "CallExpression": {
      const call = expr as CallExpression;
      if (depth >= maxDepth) {
        return { kind: "unknown" };
      }

      let calleeName: string | undefined;
      let namespace: string | undefined;

      if (call.callee.type === "Identifier") {
        calleeName = call.callee.value;
      } else if (
        call.callee.type === "MemberExpression" &&
        call.callee.property.type === "Identifier"
      ) {
        calleeName = call.callee.property.value;
        if (call.callee.object.type === "Identifier") {
          namespace = call.callee.object.value;
        }
      }

      if (!calleeName) {
        // Dynamic call, e.g. fn()() or (window as any).foo()
        return { kind: "unknown" };
      }

      // Check recursion / cycle limit
      const callKey = `${namespace ? namespace + "." : ""}${calleeName}`;
      if (visitedCalls.has(callKey)) {
        // Recursion or cycle detected - terminate safely
        return { kind: "clean" };
      }

      const targetFn = lookupFunction(calleeName, namespace);
      if (!targetFn) {
        return { kind: "unknown" };
      }

      const nextVisited = new Set(visitedCalls);
      nextVisited.add(callKey);

      // Evaluate call arguments
      const argShapes = call.arguments.map((arg) =>
        evaluateExpressionShape(
          arg.expression,
          env,
          locator,
          lookupFunction,
          depth + 1,
          maxDepth,
          nextVisited
        )
      );

      // Substitute argument shapes into return shape
      const substituted = substituteParams(targetFn.returnShape, argShapes);

      // If returned value is tainted, record the function step in the trace
      if (isTaintedShape(substituted)) {
        return attachCallToTrace(
          substituted,
          `${targetFn.filePath}:${targetFn.name}()`
        );
      }

      return substituted;
    }

    case "ParenthesisExpression":
      return evaluateExpressionShape(
        (expr as any).expression,
        env,
        locator,
        lookupFunction,
        depth,
        maxDepth,
        visitedCalls
      );

    case "TsNonNullExpression":
    case "TsAsExpression":
    case "TsTypeAssertion":
      return evaluateExpressionShape(
        (expr as any).expression,
        env,
        locator,
        lookupFunction,
        depth,
        maxDepth,
        visitedCalls
      );

    case "AwaitExpression":
      return evaluateExpressionShape(
        (expr as any).argument,
        env,
        locator,
        lookupFunction,
        depth,
        maxDepth,
        visitedCalls
      );

    default:
      return { kind: "clean" };
  }
}

function attachCallToTrace(
  shape: DataFlowShape,
  callStep: string
): DataFlowShape {
  if (shape.kind === "tainted" && shape.trace) {
    const last = shape.trace[shape.trace.length - 1];
    const newTrace = last === callStep ? shape.trace : [...shape.trace, callStep];
    return { ...shape, trace: newTrace };
  }

  if (shape.kind === "object" && shape.properties) {
    const properties = new Map<string, DataFlowShape>();
    for (const [k, v] of shape.properties.entries()) {
      properties.set(k, attachCallToTrace(v, callStep));
    }
    return { ...shape, properties };
  }

  if (shape.kind === "array" && shape.elements) {
    return {
      ...shape,
      elements: shape.elements.map((el) => attachCallToTrace(el, callStep)),
    };
  }

  return shape;
}
