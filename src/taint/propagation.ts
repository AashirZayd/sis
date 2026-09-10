import type {
  Expression,
  MemberExpression,
  TemplateLiteral,
  ArrayExpression,
  ObjectExpression,
  KeyValueProperty,
} from "@swc/core";
import type { SourceMapLocator } from "../parser/location.js";
import { extractSensitiveEnvSource } from "./sources.js";
import type { TaintValue } from "./types.js";

/**
 * Manages variable bindings and their taint values within a scope.
 */
export class TaintScope {
  private readonly bindings: Map<string, TaintValue> = new Map();

  constructor(private readonly parent?: TaintScope) {}

  set(name: string, value: TaintValue): void {
    this.bindings.set(name, value);
  }

  get(name: string): TaintValue | undefined {
    return this.bindings.get(name) ?? this.parent?.get(name);
  }

  has(name: string): boolean {
    return this.bindings.has(name) || (this.parent ? this.parent.has(name) : false);
  }
}

/**
 * Evaluates expressions to determine if they yield a tainted value.
 * Handles:
 * - Direct process.env sensitive accesses
 * - Identifier lookups from scope
 * - Member expressions (e.g. auth.token, nested.auth.token)
 * - Object expressions ({ token: process.env.KEY })
 * - Array expressions ([ process.env.KEY ])
 * - Template literals (`token=${process.env.KEY}`)
 * - Parenthesis, type assertions, non-null assertions
 */
export function evaluateExpressionTaint(
  expr: Expression,
  scope: TaintScope,
  locator: SourceMapLocator
): TaintValue | null {
  // 1. Direct sensitive environment source
  const directSource = extractSensitiveEnvSource(expr, locator);
  if (directSource) {
    return {
      source: directSource,
      trace: [directSource.rawExpression],
    };
  }

  switch (expr.type) {
    // 2. Simple Identifier lookup
    case "Identifier": {
      const tainted = scope.get(expr.value);
      if (tainted) {
        const lastStep = tainted.trace[tainted.trace.length - 1];
        const newTrace =
          lastStep === expr.value
            ? [...tainted.trace]
            : [...tainted.trace, expr.value];

        return {
          source: tainted.source,
          trace: newTrace,
          propertyPath: tainted.propertyPath,
        };
      }
      return null;
    }

    // 3. MemberExpression (e.g. auth.token or data.auth.token)
    case "MemberExpression": {
      const member = expr as MemberExpression;
      const fullPropPath = getMemberExpressionPath(member);
      if (fullPropPath) {
        // First check exact compound path: e.g. "auth.token"
        const exactMatch = scope.get(fullPropPath);
        if (exactMatch) {
          const last = exactMatch.trace[exactMatch.trace.length - 1];
          const newTrace =
            last === fullPropPath
              ? [...exactMatch.trace]
              : [...exactMatch.trace, fullPropPath];

          return {
            source: exactMatch.source,
            trace: newTrace,
          };
        }

        // Check root object: e.g. "auth"
        const rootObjName = fullPropPath.split(".")[0];
        const rootTaint = scope.get(rootObjName);
        if (rootTaint) {
          const last = rootTaint.trace[rootTaint.trace.length - 1];
          const newTrace =
            last === fullPropPath
              ? [...rootTaint.trace]
              : [...rootTaint.trace, fullPropPath];

          return {
            source: rootTaint.source,
            trace: newTrace,
          };
        }
      }

      // Check if the object being accessed is itself tainted
      if (member.object.type !== "MemberExpression") {
        const objTaint = evaluateExpressionTaint(member.object, scope, locator);
        if (objTaint) {
          let propName: string | undefined;
          if (member.property.type === "Identifier") {
            propName = member.property.value;
          } else {
            const propAny = member.property as any;
            if (propAny.type === "Computed" && propAny.expression?.type === "StringLiteral") {
              propName = propAny.expression.value;
            }
          }

          const step = propName
            ? `${objTaint.trace[objTaint.trace.length - 1]}.${propName}`
            : "property";
          return {
            source: objTaint.source,
            trace: [...objTaint.trace, step],
          };
        }
      }
      return null;
    }

    // 4. Template literals: `Bearer ${secret}`
    case "TemplateLiteral": {
      const tpl = expr as TemplateLiteral;
      for (const subExpr of tpl.expressions) {
        const subTaint = evaluateExpressionTaint(subExpr, scope, locator);
        if (subTaint) {
          return {
            source: subTaint.source,
            trace: [...subTaint.trace, "template-literal"],
          };
        }
      }
      return null;
    }

    // 5. Array expressions: [ secret ]
    case "ArrayExpression": {
      const arr = expr as ArrayExpression;
      for (const element of arr.elements) {
        if (!element) continue;
        const elemExpr = element.expression;
        const elemTaint = evaluateExpressionTaint(elemExpr, scope, locator);
        if (elemTaint) {
          return {
            source: elemTaint.source,
            trace: [...elemTaint.trace, "array-element"],
          };
        }
      }
      return null;
    }

    // 6. Object expressions: { token: process.env.API_KEY }
    case "ObjectExpression": {
      const obj = expr as ObjectExpression;
      for (const prop of obj.properties) {
        if (prop.type === "KeyValueProperty") {
          const kv = prop as KeyValueProperty;
          const valTaint = evaluateExpressionTaint(kv.value, scope, locator);
          if (valTaint) {
            const propName =
              kv.key.type === "Identifier"
                ? kv.key.value
                : kv.key.type === "StringLiteral"
                ? kv.key.value
                : "property";

            return {
              source: valTaint.source,
              trace: [...valTaint.trace, `{ ${propName} }`],
              propertyPath: [propName],
            };
          }
        }
      }
      return null;
    }

    // 7. Parenthesized / Assertion wrappers
    case "ParenthesisExpression":
      return evaluateExpressionTaint((expr as any).expression, scope, locator);
    case "TsAsExpression":
      return evaluateExpressionTaint((expr as any).expression, scope, locator);
    case "TsNonNullExpression":
      return evaluateExpressionTaint((expr as any).expression, scope, locator);
    case "TsTypeAssertion":
      return evaluateExpressionTaint((expr as any).expression, scope, locator);

    default:
      return null;
  }
}

/**
 * Resolves a MemberExpression chain to a dot-delimited string (e.g. "auth.token").
 */
function getMemberExpressionPath(member: MemberExpression): string | null {
  const parts: string[] = [];
  let curr: Expression = member;

  while (curr.type === "MemberExpression") {
    const m = curr as MemberExpression;
    if (m.property.type === "Identifier") {
      parts.unshift(m.property.value);
    } else {
      const propAny = m.property as any;
      if (propAny.type === "Computed" && propAny.expression?.type === "StringLiteral") {
        parts.unshift(propAny.expression.value);
      } else {
        return null;
      }
    }
    curr = m.object;
  }

  if (curr.type === "Identifier") {
    parts.unshift(curr.value);
    return parts.join(".");
  }

  return null;
}
