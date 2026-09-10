import type {
  Module,
  ModuleItem,
  Statement,
  Expression,
  VariableDeclaration,
  ObjectExpression,
  KeyValueProperty,
} from "@swc/core";
import type { Finding } from "../core/types.js";
import type { SourceMapLocator } from "../parser/location.js";
import { extractSensitiveEnvSource } from "./sources.js";
import { TaintScope, evaluateExpressionTaint } from "./propagation.js";
import { createTaintViolationFinding } from "./sinks.js";
import type {
  TaintAnalysisOptions,
  TaintAnalysisResult,
  TaintSource,
  TaintValue,
} from "./types.js";

/**
 * AST visitor and data-flow analyzer that tracks sensitive server environment
 * variable propagation into Client Component boundaries.
 */
export class TaintAnalyzer {
  private readonly sources: TaintSource[] = [];
  private readonly findings: Finding[] = [];
  private readonly reportedKeys = new Set<string>();

  constructor(
    private readonly module: Module,
    private readonly options: TaintAnalysisOptions,
    private readonly locator: SourceMapLocator
  ) {}

  /**
   * Executes static taint analysis on the module.
   */
  analyze(): TaintAnalysisResult {
    const rootScope = new TaintScope();

    for (const item of this.module.body) {
      this.visitModuleItem(item, rootScope);
    }

    return {
      sources: this.sources,
      findings: this.findings,
      taintSourcesFound: this.sources.length,
      taintViolations: this.findings.length,
    };
  }

  private visitModuleItem(item: ModuleItem, scope: TaintScope): void {
    switch (item.type) {
      case "VariableDeclaration":
        this.visitVariableDeclaration(item as VariableDeclaration, scope);
        break;

      case "ExportDeclaration": {
        const decl = (item as any).declaration;
        if (decl && decl.type === "VariableDeclaration") {
          this.visitVariableDeclaration(decl, scope, true);
        } else if (decl) {
          this.visitStatement(decl, scope);
        }
        break;
      }

      case "ExportDefaultDeclaration": {
        const decl = (item as any).decl;
        if (decl) {
          if (decl.type === "FunctionExpression" || decl.type === "FunctionDeclaration") {
            const fnScope = new TaintScope(scope);
            if (decl.body?.stmts) {
              for (const s of decl.body.stmts) {
                this.visitStatement(s, fnScope);
              }
            }
          } else {
            this.walkExpression(decl, scope);
            if (this.options.isClientBoundary) {
              const taint = evaluateExpressionTaint(decl, scope, this.locator);
              if (taint) {
                this.recordFinding(taint, {
                  location: this.locator.getLocation(item.span.start),
                  sinkDescription: "default export",
                });
              }
            }
          }
        }
        break;
      }

      default:
        this.visitStatement(item as Statement, scope);
        break;
    }
  }

  private visitStatement(stmt: Statement, scope: TaintScope): void {
    if (!stmt) return;

    switch (stmt.type) {
      case "BlockStatement":
        for (const s of (stmt as any).stmts || []) {
          this.visitStatement(s, scope);
        }
        break;

      case "VariableDeclaration":
        this.visitVariableDeclaration(stmt as VariableDeclaration, scope);
        break;

      case "FunctionDeclaration": {
        const fn = stmt as any;
        const fnScope = new TaintScope(scope);
        if (fn.body?.stmts) {
          for (const s of fn.body.stmts) {
            this.visitStatement(s, fnScope);
          }
        }
        break;
      }

      case "ReturnStatement": {
        const ret = stmt as any;
        if (ret.argument) {
          this.walkExpression(ret.argument, scope);

          if (this.options.isClientBoundary) {
            const taint = evaluateExpressionTaint(ret.argument, scope, this.locator);
            if (taint && ret.argument.type !== "JSXElement" && ret.argument.type !== "JSXFragment") {
              this.recordFinding(taint, {
                location: this.locator.getLocation(ret.span.start),
                sinkDescription: "return value",
              });
            }
          }
        }
        break;
      }

      case "ExpressionStatement": {
        const exprStmt = stmt as any;
        this.walkExpression(exprStmt.expression, scope);
        break;
      }

      case "IfStatement": {
        const ifStmt = stmt as any;
        this.walkExpression(ifStmt.test, scope);
        if (ifStmt.consequent) this.visitStatement(ifStmt.consequent, scope);
        if (ifStmt.alternate) this.visitStatement(ifStmt.alternate, scope);
        break;
      }
    }
  }

  private visitVariableDeclaration(
    decl: VariableDeclaration,
    scope: TaintScope,
    isExported = false
  ): void {
    for (const declarator of decl.declarations) {
      if (!declarator.init) continue;

      // First walk init expression to find any sensitive sources or nested sinks
      this.walkExpression(declarator.init, scope);

      const taint = evaluateExpressionTaint(declarator.init, scope, this.locator);
      if (taint) {
        // Track discovered source
        if (!this.sources.some((s) => s.name === taint.source.name)) {
          this.sources.push(taint.source);
        }

        if (declarator.id.type === "Identifier") {
          const varName = declarator.id.value;
          const boundTaint: TaintValue = {
            source: taint.source,
            trace: [...taint.trace, varName],
            propertyPath: taint.propertyPath,
          };
          scope.set(varName, boundTaint);

          // If assigned an ObjectExpression, register property paths (e.g. auth.token)
          if (declarator.init.type === "ObjectExpression") {
            this.registerObjectPropertyPaths(varName, declarator.init, scope, boundTaint);
          }

          // If this variable is exported from a client module, it is a client sink
          if (this.options.isClientBoundary && isExported) {
            this.recordFinding(boundTaint, {
              location: this.locator.getLocation(declarator.span.start),
              sinkDescription: `exported variable '${varName}'`,
            });
          }
        }
      }
    }
  }

  /**
   * Recursively maps object properties to their composite path in the taint scope.
   * e.g. auth -> auth.token -> auth.nested.token
   */
  private registerObjectPropertyPaths(
    basePath: string,
    obj: ObjectExpression,
    scope: TaintScope,
    parentTaint: TaintValue
  ): void {
    for (const prop of obj.properties) {
      if (prop.type === "KeyValueProperty") {
        const kv = prop as KeyValueProperty;
        const keyName =
          kv.key.type === "Identifier"
            ? kv.key.value
            : kv.key.type === "StringLiteral"
            ? kv.key.value
            : null;

        if (!keyName) continue;

        const propPath = `${basePath}.${keyName}`;
        const valTaint = evaluateExpressionTaint(kv.value, scope, this.locator);

        if (valTaint) {
          const propTaint: TaintValue = {
            source: valTaint.source,
            trace: [...valTaint.trace, propPath],
            propertyPath: [keyName],
          };
          scope.set(propPath, propTaint);

          if (kv.value.type === "ObjectExpression") {
            this.registerObjectPropertyPaths(propPath, kv.value, scope, propTaint);
          }
        }
      }
    }
  }

  /**
   * Walks expressions to locate JSXExpressionContainer sinks and register sources.
   */
  private walkExpression(expr: Expression, scope: TaintScope): void {
    if (!expr) return;

    // Detect direct sensitive environment access
    const directSource = extractSensitiveEnvSource(expr, this.locator);
    if (directSource) {
      if (!this.sources.some((s) => s.name === directSource.name)) {
        this.sources.push(directSource);
      }
    }

    switch (expr.type) {
      case "JSXElement": {
        const el = expr as any;
        for (const attr of el.opening.attributes || []) {
          if (attr.type === "JSXAttribute" && attr.value?.type === "JSXExpressionContainer") {
            this.checkJsxExpression(attr.value.expression, scope, attr.value.span.start);
          }
        }
        for (const child of el.children || []) {
          if (child.type === "JSXExpressionContainer") {
            this.checkJsxExpression(child.expression, scope, child.span.start);
          } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
            this.walkExpression(child, scope);
          }
        }
        break;
      }

      case "JSXFragment": {
        const frag = expr as any;
        for (const child of frag.children || []) {
          if (child.type === "JSXExpressionContainer") {
            this.checkJsxExpression(child.expression, scope, child.span.start);
          } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
            this.walkExpression(child, scope);
          }
        }
        break;
      }

      case "ArrowFunctionExpression":
      case "FunctionExpression": {
        const fn = expr as any;
        const fnScope = new TaintScope(scope);
        if (fn.body) {
          if (fn.body.stmts) {
            for (const s of fn.body.stmts) {
              this.visitStatement(s, fnScope);
            }
          } else {
            this.walkExpression(fn.body, fnScope);
          }
        }
        break;
      }

      case "CallExpression": {
        const call = expr as any;
        this.walkExpression(call.callee, scope);
        for (const arg of call.arguments || []) {
          this.walkExpression(arg.expression, scope);
        }
        break;
      }

      case "MemberExpression": {
        const member = expr as any;
        this.walkExpression(member.object, scope);
        break;
      }

      case "ArrayExpression": {
        const arr = expr as any;
        for (const el of arr.elements || []) {
          if (el?.expression) this.walkExpression(el.expression, scope);
        }
        break;
      }

      case "ObjectExpression": {
        const obj = expr as any;
        for (const prop of obj.properties || []) {
          if (prop.type === "KeyValueProperty") {
            this.walkExpression(prop.value, scope);
          }
        }
        break;
      }

      case "TemplateLiteral": {
        const tpl = expr as any;
        for (const sub of tpl.expressions || []) {
          this.walkExpression(sub, scope);
        }
        break;
      }

      case "ParenthesisExpression":
      case "TsAsExpression":
      case "TsNonNullExpression":
      case "TsTypeAssertion":
        this.walkExpression((expr as any).expression, scope);
        break;
    }
  }

  private checkJsxExpression(
    expr: Expression,
    scope: TaintScope,
    byteOffset: number
  ): void {
    if (!this.options.isClientBoundary) return;

    const taint = evaluateExpressionTaint(expr, scope, this.locator);
    if (taint) {
      this.recordFinding(taint, {
        location: this.locator.getLocation(byteOffset),
        sinkDescription: "JSX expression",
      });
    }
  }

  private recordFinding(taint: TaintValue, sink: { location: any; sinkDescription: string }): void {
    const key = `${sink.location.file}:${sink.location.line}:${sink.location.column}:${taint.source.name}`;
    if (this.reportedKeys.has(key)) return;
    this.reportedKeys.add(key);

    this.findings.push(createTaintViolationFinding(taint, sink));
  }
}

/**
 * Convenient function to run taint analysis on a parsed SWC Module.
 */
export function analyzeTaint(
  module: Module,
  options: TaintAnalysisOptions,
  locator: SourceMapLocator
): TaintAnalysisResult {
  const analyzer = new TaintAnalyzer(module, options, locator);
  return analyzer.analyze();
}
