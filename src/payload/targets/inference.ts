import type {
  Param,
  Pattern,
  TsType,
  TsTypeAnnotation,
  Statement,
  Expression,
  MemberExpression,
  CallExpression,
} from "@swc/core";
import type { InferredShape } from "./types.js";

/**
 * Infers the structural shape of a parameter using:
 * 1. TypeScript type annotations
 * 2. Destructuring patterns
 * 3. Default argument values
 * 4. Body property and method accesses
 */
export function inferParameterShape(
  param: Param | Pattern,
  bodyStmts?: Statement[]
): InferredShape {
  // Unwrap Param to Pattern
  const pat: Pattern = (param as Param).pat !== undefined ? (param as Param).pat : (param as Pattern);

  let shapeFromType: InferredShape | undefined;
  let paramName: string | undefined;

  // 1. Check direct Identifier with type annotation
  if (pat.type === "Identifier") {
    const ident = pat as any;
    paramName = ident.value;
    if (ident.typeAnnotation) {
      shapeFromType = inferFromTsType(ident.typeAnnotation.typeAnnotation);
      if (shapeFromType) {
        shapeFromType.rawTypeAnnotation = extractRawTypeString(ident.typeAnnotation.typeAnnotation);
      }
    }
  }

  // 2. Check AssignmentPattern (default value: e.g. input = {})
  if (pat.type === "AssignmentPattern") {
    let baseShape: InferredShape | undefined;
    if (pat.left.type === "Identifier") {
      const leftIdent = pat.left as any;
      paramName = leftIdent.value;
      if (leftIdent.typeAnnotation) {
        baseShape = inferFromTsType(leftIdent.typeAnnotation.typeAnnotation);
      }
    }
    const defaultShape = inferFromExpression(pat.right);
    const combined = baseShape ?? defaultShape ?? { kind: "unknown" };
    combined.hasDefault = true;
    shapeFromType = combined;
  }

  // 3. Check ObjectPattern (destructuring: e.g. { user, options })
  if (pat.type === "ObjectPattern") {
    const properties = new Map<string, InferredShape>();
    for (const prop of pat.properties) {
      if (prop.type === "AssignmentPatternProperty" && prop.key.type === "Identifier") {
        properties.set(prop.key.value, { kind: "unknown", hasDefault: !!prop.value });
      } else if (prop.type === "KeyValuePatternProperty" && prop.key.type === "Identifier") {
        const nested = inferParameterShape(prop.value);
        properties.set(prop.key.value, nested);
      }
    }

    let typeObj: InferredShape | undefined;
    if (pat.typeAnnotation) {
      typeObj = inferFromTsType(pat.typeAnnotation.typeAnnotation);
    }

    if (typeObj && typeObj.kind === "object" && typeObj.properties) {
      for (const [k, v] of properties.entries()) {
        if (!typeObj.properties.has(k)) {
          typeObj.properties.set(k, v);
        }
      }
      shapeFromType = typeObj;
    } else {
      shapeFromType = { kind: "object", properties };
    }
  }

  // 4. Check ArrayPattern (destructuring: e.g. [first, second])
  if (pat.type === "ArrayPattern") {
    shapeFromType = { kind: "array", elementType: { kind: "unknown" } };
  }

  // 5. If paramName exists and bodyStmts are available, enrich or infer from body usage
  if (paramName && bodyStmts && bodyStmts.length > 0) {
    const bodyInference = inferFromBodyUsage(paramName, bodyStmts);
    if (bodyInference) {
      if (!shapeFromType || shapeFromType.kind === "unknown") {
        shapeFromType = bodyInference;
      } else if (shapeFromType.kind === "object" && bodyInference.kind === "object") {
        // Merge inferred properties
        if (!shapeFromType.properties) {
          shapeFromType.properties = new Map();
        }
        if (bodyInference.properties) {
          for (const [k, v] of bodyInference.properties.entries()) {
            if (!shapeFromType.properties.has(k) || shapeFromType.properties.get(k)?.kind === "unknown") {
              shapeFromType.properties.set(k, v);
            }
          }
        }
      }
    }
  }

  return shapeFromType ?? { kind: "unknown" };
}

/**
 * Infers shape from SWC TypeScript type node.
 */
export function inferFromTsType(tsType: TsType): InferredShape {
  switch (tsType.type) {
    case "TsKeywordType": {
      switch (tsType.kind) {
        case "string":
          return { kind: "string" };
        case "number":
          return { kind: "number" };
        case "boolean":
          return { kind: "boolean" };
        case "any":
        case "unknown":
          return { kind: "unknown" };
        default:
          return { kind: "unknown" };
      }
    }

    case "TsTypeLiteral": {
      const properties = new Map<string, InferredShape>();
      for (const member of tsType.members) {
        if (member.type === "TsPropertySignature" && member.key.type === "Identifier") {
          const propName = member.key.value;
          let propShape: InferredShape = { kind: "unknown" };
          if (member.typeAnnotation) {
            propShape = inferFromTsType(member.typeAnnotation.typeAnnotation);
          }
          if (member.optional) {
            propShape.optional = true;
          }
          properties.set(propName, propShape);
        }
      }
      return { kind: "object", properties };
    }

    case "TsArrayType": {
      return {
        kind: "array",
        elementType: inferFromTsType(tsType.elemType),
      };
    }

    case "TsUnionType": {
      const unionTypes = tsType.types.map((t) => inferFromTsType(t));
      const hasNull = tsType.types.some((t) => (t as any).kind === "null");
      const hasUndefined = tsType.types.some((t) => (t as any).kind === "undefined");
      const nonNullish = unionTypes.filter(
        (u) => (u as any).kind !== "null" && (u as any).kind !== "undefined"
      );

      if (nonNullish.length === 1) {
        return {
          ...nonNullish[0],
          nullable: hasNull,
          optional: hasUndefined,
        };
      }

      return {
        kind: "union",
        unionTypes,
        nullable: hasNull,
        optional: hasUndefined,
      };
    }

    case "TsTypeReference": {
      const name = tsType.typeName.type === "Identifier" ? tsType.typeName.value : "";
      if (name === "Array" && tsType.typeParams?.params?.[0]) {
        return {
          kind: "array",
          elementType: inferFromTsType(tsType.typeParams.params[0]),
        };
      }
      if (name === "Record" && tsType.typeParams?.params?.[1]) {
        return {
          kind: "object",
          properties: new Map(),
        };
      }
      return { kind: "unknown" };
    }

    default:
      return { kind: "unknown" };
  }
}

function inferFromExpression(expr: Expression): InferredShape | undefined {
  switch (expr.type) {
    case "StringLiteral":
      return { kind: "string" };
    case "NumericLiteral":
      return { kind: "number" };
    case "BooleanLiteral":
      return { kind: "boolean" };
    case "ObjectExpression":
      return { kind: "object", properties: new Map() };
    case "ArrayExpression":
      return { kind: "array", elementType: { kind: "unknown" } };
    default:
      return undefined;
  }
}

function extractRawTypeString(tsType: TsType): string {
  if (tsType.type === "TsKeywordType") return tsType.kind;
  if (tsType.type === "TsTypeReference" && tsType.typeName.type === "Identifier") {
    return tsType.typeName.value;
  }
  return tsType.type;
}

/**
 * Traverses body statements to detect property accesses and method calls on the parameter.
 */
function inferFromBodyUsage(paramName: string, stmts: Statement[]): InferredShape | undefined {
  const properties = new Map<string, InferredShape>();
  let directKind: "string" | "number" | "array" | undefined;

  function walk(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "MemberExpression") {
      const member = node as MemberExpression;
      // e.g. paramName.prop
      if (member.object.type === "Identifier" && member.object.value === paramName) {
        if (member.property.type === "Identifier") {
          const propName = member.property.value;
          if (!properties.has(propName)) {
            properties.set(propName, { kind: "unknown" });
          }
        }
      }
      // e.g. paramName.prop.subprop
      if (
        member.object.type === "MemberExpression" &&
        (member.object.object as any)?.type === "Identifier" &&
        (member.object.object as any)?.value === paramName
      ) {
        const parentProp = (member.object.property as any)?.value;
        const subProp = member.property.type === "Identifier" ? member.property.value : undefined;
        const methodNames = new Set([
          "toFixed", "toPrecision", "toExponential",
          "toLowerCase", "toUpperCase", "trim", "trimStart", "trimEnd", "split", "slice", "substring", "includes", "indexOf", "charAt", "charCodeAt",
          "map", "filter", "reduce", "forEach", "some", "every", "find", "findIndex", "push", "pop", "shift", "unshift"
        ]);
        if (parentProp && subProp && !methodNames.has(subProp)) {
          let parentShape = properties.get(parentProp);
          if (!parentShape || parentShape.kind !== "object") {
            parentShape = { kind: "object", properties: new Map() };
            properties.set(parentProp, parentShape);
          }
          if (!parentShape.properties) {
            parentShape.properties = new Map();
          }
          parentShape.properties.set(subProp, { kind: "unknown" });
        }
      }
    }

    if (node.type === "CallExpression") {
      const call = node as CallExpression;
      // Direct method: paramName.toFixed(...) -> number
      if (
        call.callee.type === "MemberExpression" &&
        call.callee.object.type === "Identifier" &&
        call.callee.object.value === paramName &&
        call.callee.property.type === "Identifier"
      ) {
        const method = call.callee.property.value;
        if (method === "toFixed" || method === "toPrecision" || method === "toExponential") {
          directKind = "number";
        } else if (method === "toLowerCase" || method === "toUpperCase" || method === "trim" || method === "split") {
          directKind = "string";
        } else if (method === "map" || method === "forEach" || method === "filter" || method === "reduce") {
          directKind = "array";
        }
      }

      // Prop method: paramName.user.id.toFixed(...)
      if (
        call.callee.type === "MemberExpression" &&
        call.callee.object.type === "MemberExpression" &&
        (call.callee.object.object as any)?.type === "Identifier" &&
        (call.callee.object.object as any)?.value === paramName &&
        call.callee.property.type === "Identifier"
      ) {
        const propName = (call.callee.object.property as any)?.value;
        const method = call.callee.property.value;
        if (propName) {
          if (method === "toFixed" || method === "toPrecision") {
            properties.set(propName, { kind: "number" });
          } else if (method === "toLowerCase" || method === "trim") {
            properties.set(propName, { kind: "string" });
          }
        }
      }

      // Global check: Number.isNaN(paramName) or isNaN(paramName)
      if (call.arguments?.[0]?.expression?.type === "Identifier" && call.arguments[0].expression.value === paramName) {
        if (
          (call.callee.type === "MemberExpression" &&
            (call.callee.object as any)?.value === "Number" &&
            (call.callee.property as any)?.value === "isNaN") ||
          (call.callee.type === "Identifier" && call.callee.value === "isNaN")
        ) {
          directKind = "number";
        }
      }

      // Global check on property: Number.isNaN(paramName.id)
      if (
        call.arguments?.[0]?.expression?.type === "MemberExpression" &&
        (call.arguments[0].expression.object as any)?.value === paramName &&
        (call.arguments[0].expression.property as any)?.value
      ) {
        const propName = (call.arguments[0].expression.property as any).value;
        if (
          (call.callee.type === "MemberExpression" &&
            (call.callee.object as any)?.value === "Number" &&
            (call.callee.property as any)?.value === "isNaN") ||
          (call.callee.type === "Identifier" && call.callee.value === "isNaN")
        ) {
          properties.set(propName, { kind: "number" });
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "span") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c);
      } else if (typeof child === "object") {
        walk(child);
      }
    }
  }

  for (const stmt of stmts) {
    walk(stmt);
  }

  if (properties.size > 0) {
    return { kind: "object", properties };
  }

  if (directKind) {
    if (directKind === "array") {
      return { kind: "array", elementType: { kind: "unknown" } };
    }
    return { kind: directKind };
  }

  return undefined;
}
