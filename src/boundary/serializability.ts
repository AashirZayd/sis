import type {
  Expression,
  ObjectExpression,
  ArrayExpression,
  NewExpression,
  CallExpression,
  MemberExpression,
  ArrowFunctionExpression,
  FunctionExpression,
} from "@swc/core";
import type { SourceMapLocator } from "../parser/location.js";
import { extractSensitiveEnvSource } from "../taint/sources.js";
import type { DataFlowShape } from "../dataflow/types.js";
import { isTaintedShape, extractTaintInfo } from "../dataflow/transfer.js";
import type { SerializabilityResult } from "./types.js";

const SUPPORTED_BUILTIN_CLASSES = new Set([
  "Date",
  "Map",
  "Set",
  "ArrayBuffer",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
]);

/**
 * Checks if a function body has an inline "use server" directive prologue.
 */
export function hasFunctionLevelServerDirective(
  fn: ArrowFunctionExpression | FunctionExpression | { body?: any }
): boolean {
  if (!fn.body) return false;

  // Arrow function with expression body cannot have directive
  if (fn.body.type !== "BlockStatement" && fn.body.type !== "FunctionBody") return false;

  const stmts = fn.body.stmts;
  if (!stmts || stmts.length === 0) return false;

  for (const stmt of stmts) {
    if (stmt.type !== "ExpressionStatement") {
      break;
    }
    if (
      stmt.expression.type === "StringLiteral" &&
      stmt.expression.value === "use server"
    ) {
      return true;
    }
    // Any other string literal (like "use strict") continues prologue
    if (stmt.expression.type !== "StringLiteral") {
      break;
    }
  }

  return false;
}

/**
 * Evaluates the React Server Components (React Flight) serializability of an expression.
 */
export function checkSerializability(
  expr: Expression,
  env: Map<string, DataFlowShape>,
  locator: SourceMapLocator,
  isServerFunctionIdentifier?: (name: string) => boolean,
  localDecls?: Map<string, Expression>
): SerializabilityResult {
  // 1. Direct sensitive secret check
  const directSecret = extractSensitiveEnvSource(expr, locator);
  if (directSecret) {
    return {
      status: "unsupported",
      taintViolation: true,
      taintSource: directSecret,
      trace: [directSecret.rawExpression],
      reason: "Sensitive server environment secret cannot cross client boundary",
    };
  }

  switch (expr.type) {
    // Primitives
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
    case "BigIntLiteral":
      return { status: "serializable" };

    // Identifier lookup
    case "Identifier": {
      if (expr.value === "undefined" || expr.value === "NaN" || expr.value === "Infinity") {
        return { status: "serializable" };
      }

      // Check if identifier refers to a known Server Function
      if (isServerFunctionIdentifier && isServerFunctionIdentifier(expr.value)) {
        return { status: "serializable" };
      }

      const shape = env.get(expr.value);
      if (shape) {
        if (isTaintedShape(shape)) {
          const taint = extractTaintInfo(shape);
          return {
            status: "unsupported",
            taintViolation: true,
            taintSource: taint?.taintSource,
            trace: taint?.trace,
            reason: "Tainted sensitive value passed across boundary",
          };
        }
        if (shape.kind === "unknown") {
          return { status: "unknown", reason: `Value of ${expr.value} is dynamically derived` };
        }
      }

      if (localDecls && localDecls.has(expr.value)) {
        const initExpr = localDecls.get(expr.value)!;
        const nextDecls = new Map(localDecls);
        nextDecls.delete(expr.value);
        return checkSerializability(initExpr, env, locator, isServerFunctionIdentifier, nextDecls);
      }

      // If identifier matches common DB connection patterns
      const lower = expr.value.toLowerCase();
      if (lower.includes("db") || lower.includes("prisma") || lower.includes("client") || lower.includes("connection")) {
        return {
          status: "unsupported",
          isClassInstance: true,
          reason: `Database connection / server-only instance "${expr.value}" cannot be passed to a Client Component`,
        };
      }

      return { status: "serializable" };
    }

    // Functions (Callbacks vs Server Actions)
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      if (hasFunctionLevelServerDirective(expr)) {
        return { status: "serializable" };
      }
      return {
        status: "unsupported",
        isFunction: true,
        reason:
          "Functions cannot be passed directly to Client Components unless explicitly exposed with 'use server'",
      };
    }

    // New class instance
    case "NewExpression": {
      const newExpr = expr as NewExpression;
      let calleeName: string | undefined;
      if (newExpr.callee.type === "Identifier") {
        calleeName = newExpr.callee.value;
      }

      if (calleeName && SUPPORTED_BUILTIN_CLASSES.has(calleeName)) {
        return { status: "serializable" };
      }

      return {
        status: "unsupported",
        isClassInstance: true,
        reason: `Class instance "new ${calleeName ?? "Object"}()" cannot be passed to a Client Component`,
      };
    }

    // Plain Object literals
    case "ObjectExpression": {
      const obj = expr as ObjectExpression;
      let hasUnknown = false;

      for (const prop of obj.properties) {
        if (prop.type === "KeyValueProperty") {
          const res = checkSerializability(
            prop.value,
            env,
            locator,
            isServerFunctionIdentifier,
            localDecls
          );
          if (res.status === "unsupported") {
            return res;
          }
          if (res.status === "unknown") {
            hasUnknown = true;
          }
        }
      }

      return hasUnknown
        ? { status: "unknown", reason: "Object contains dynamic properties" }
        : { status: "serializable" };
    }

    // Arrays
    case "ArrayExpression": {
      const arr = expr as ArrayExpression;
      let hasUnknown = false;

      for (const el of arr.elements) {
        if (el && el.expression) {
          const res = checkSerializability(
            el.expression,
            env,
            locator,
            isServerFunctionIdentifier,
            localDecls
          );
          if (res.status === "unsupported") {
            return res;
          }
          if (res.status === "unknown") {
            hasUnknown = true;
          }
        }
      }

      return hasUnknown
        ? { status: "unknown", reason: "Array contains dynamic elements" }
        : { status: "serializable" };
    }

    // JSX Elements & Fragments (React elements are serializable)
    case "JSXElement":
    case "JSXFragment":
      return { status: "serializable" };

    // Symbol checks
    case "CallExpression": {
      const call = expr as CallExpression;
      if (
        call.callee.type === "MemberExpression" &&
        call.callee.object.type === "Identifier" &&
        call.callee.object.value === "Symbol" &&
        call.callee.property.type === "Identifier" &&
        call.callee.property.value === "for"
      ) {
        // Symbol.for is serializable in React Flight
        return { status: "serializable" };
      }

      if (call.callee.type === "Identifier" && call.callee.value === "Symbol") {
        // Unregistered Symbol is not serializable
        return {
          status: "unsupported",
          reason: "Unregistered Symbols created with Symbol() cannot be passed to Client Components",
        };
      }

      return { status: "unknown", reason: "Call expression result cannot be statically proven" };
    }

    // MemberExpression
    case "MemberExpression": {
      const member = expr as MemberExpression;
      const direct = extractSensitiveEnvSource(member, locator);
      if (direct) {
        return {
          status: "unsupported",
          taintViolation: true,
          taintSource: direct,
          trace: [direct.rawExpression],
          reason: "Sensitive server environment secret cannot cross client boundary",
        };
      }

      if (member.object.type === "Identifier" && member.property.type === "Identifier") {
        const objName = member.object.value;
        const propName = member.property.value;
        const objShape = env.get(objName);
        if (objShape && objShape.kind === "object" && objShape.properties) {
          const propShape = objShape.properties.get(propName);
          if (propShape && isTaintedShape(propShape)) {
            const taint = extractTaintInfo(propShape);
            return {
              status: "unsupported",
              taintViolation: true,
              taintSource: taint?.taintSource,
              trace: taint?.trace ?? [objName, propName],
              reason: "Sensitive server environment secret cannot cross client boundary",
            };
          }
        }
      }

      return { status: "unknown", reason: "Member expression property" };
    }

    case "ParenthesisExpression":
    case "TsNonNullExpression":
    case "TsAsExpression":
    case "TsTypeAssertion":
      return checkSerializability(
        (expr as any).expression,
        env,
        locator,
        isServerFunctionIdentifier,
        localDecls
      );

    default:
      return { status: "unknown", reason: "Unsupported syntax for static serialization proof" };
  }
}
