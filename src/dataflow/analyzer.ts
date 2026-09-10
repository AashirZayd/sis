import type {
  Module,
  ModuleItem,
  Statement,
  Expression,
  FunctionDeclaration,
  VariableDeclaration,
  ReturnStatement,
  BlockStatement,
  JSXElement,
  JSXFragment,
} from "@swc/core";
import type { Finding, SourceLocation } from "../core/types.js";
import { createTaintViolationFinding } from "../taint/sinks.js";
import type {
  ModuleGraph,
  ModuleNode,
  FunctionSummary,
  DataFlowOptions,
  DataFlowResult,
  DataFlowShape,
} from "./types.js";
import {
  evaluateExpressionShape,
  isTaintedShape,
  extractTaintInfo,
  applyDestructuring,
} from "./transfer.js";

export class DataFlowAnalyzer {
  private readonly maxDepth: number;
  private readonly findings: Finding[] = [];
  private readonly reportedFindingKeys = new Set<string>();

  constructor(
    private readonly graph: ModuleGraph,
    options: DataFlowOptions = {}
  ) {
    this.maxDepth = options.maxDepth ?? 8;
  }

  analyze(): DataFlowResult {
    // 1. Index all functions across all modules
    this.indexAllFunctions();

    // 2. Compute function summaries iteratively
    this.computeAllFunctionSummaries();

    // 3. Inspect client boundaries for sinks consuming tainted data
    this.analyzeClientBoundaries();

    // 4. Inspect candidate Server Actions for direct tainted returns
    this.analyzeServerActionReturns();

    let totalFunctions = 0;
    for (const mod of this.graph.modules.values()) {
      totalFunctions += mod.functions.size;
    }

    return {
      findings: this.findings,
      modulesAnalyzed: this.graph.modules.size,
      functionsSummarized: totalFunctions,
    };
  }

  /**
   * Discovers top-level function declarations and arrow functions across all modules.
   */
  private indexAllFunctions(): void {
    for (const node of this.graph.modules.values()) {
      for (const item of node.ast.body) {
        if (item.type === "FunctionDeclaration" && item.identifier) {
          const fnName = item.identifier.value;
          node.functions.set(fnName, {
            name: fnName,
            filePath: node.filePath,
            location: node.locator.getLocation(item.identifier.span.start),
            params: item.params.map((p) =>
              p.pat.type === "Identifier" ? p.pat.value : "param"
            ),
            isAsync: !!item.async,
            returnShape: { kind: "clean" },
            directSources: [],
          });
        } else if (item.type === "ExportDeclaration") {
          const inner = item.declaration;
          if (inner && inner.type === "FunctionDeclaration" && inner.identifier) {
            const fnName = inner.identifier.value;
            node.functions.set(fnName, {
              name: fnName,
              filePath: node.filePath,
              location: node.locator.getLocation(inner.identifier.span.start),
              params: inner.params.map((p) =>
                p.pat.type === "Identifier" ? p.pat.value : "param"
              ),
              isAsync: !!inner.async,
              returnShape: { kind: "clean" },
              directSources: [],
            });
          } else if (inner && inner.type === "VariableDeclaration") {
            this.indexFunctionsFromVarDecl(node, inner);
          }
        } else if (item.type === "VariableDeclaration") {
          this.indexFunctionsFromVarDecl(node, item);
        }
      }
    }
  }

  private indexFunctionsFromVarDecl(
    node: ModuleNode,
    decl: VariableDeclaration
  ): void {
    for (const declarator of decl.declarations) {
      if (declarator.id.type === "Identifier" && declarator.init) {
        const init = declarator.init;
        if (
          init.type === "ArrowFunctionExpression" ||
          init.type === "FunctionExpression"
        ) {
          const fnName = declarator.id.value;
          node.functions.set(fnName, {
            name: fnName,
            filePath: node.filePath,
            location: node.locator.getLocation(declarator.id.span.start),
            params: init.params.map((p) =>
              p.type === "Identifier" ? p.value : "param"
            ),
            isAsync: !!init.async,
            returnShape: { kind: "clean" },
            directSources: [],
          });
        }
      }
    }
  }

  /**
   * Resolves a function by name and optional namespace from the perspective of a calling module.
   */
  private createFunctionLookup(fromModule: ModuleNode) {
    return (calleeName: string, namespace?: string): FunctionSummary | undefined => {
      // Case 1: Namespace call, e.g. auth.getSecret()
      if (namespace) {
        const importBinding = fromModule.imports.get(namespace);
        if (importBinding && importBinding.resolvedModule) {
          const targetNode = this.graph.modules.get(importBinding.resolvedModule);
          if (targetNode) {
            return this.resolveExportedFunction(targetNode, calleeName);
          }
        }
        return undefined;
      }

      // Case 2: Local function within the same module
      const localFn = fromModule.functions.get(calleeName);
      if (localFn) {
        return localFn;
      }

      // Case 3: Imported function, e.g. import { getSecret } from "./auth"
      const importBinding = fromModule.imports.get(calleeName);
      if (importBinding && importBinding.resolvedModule) {
        const targetNode = this.graph.modules.get(importBinding.resolvedModule);
        if (targetNode) {
          return this.resolveExportedFunction(
            targetNode,
            importBinding.importedName
          );
        }
      }

      return undefined;
    };
  }

  /**
   * Resolves an exported function from a module, following re-exports recursively.
   */
  private resolveExportedFunction(
    moduleNode: ModuleNode,
    exportedName: string,
    visitedModules: Set<string> = new Set()
  ): FunctionSummary | undefined {
    if (visitedModules.has(moduleNode.filePath)) {
      return undefined;
    }
    visitedModules.add(moduleNode.filePath);

    const exp = moduleNode.exports.get(exportedName);
    if (!exp) {
      // If export not explicitly tracked, check module functions directly by name
      return moduleNode.functions.get(exportedName);
    }

    if (exp.isReExport && exp.reExportSource) {
      const targetNode = this.graph.modules.get(exp.reExportSource);
      if (targetNode) {
        const targetName = exp.reExportName ?? exportedName;
        return this.resolveExportedFunction(targetNode, targetName, visitedModules);
      }
      return undefined;
    }

    const localName = exp.localName ?? exportedName;
    return moduleNode.functions.get(localName);
  }

  /**
   * Computes the return shapes of all indexed functions.
   */
  private computeAllFunctionSummaries(): void {
    // Run multiple passes to allow multi-hop summaries to propagate
    for (let pass = 0; pass < 3; pass++) {
      for (const node of this.graph.modules.values()) {
        const lookup = this.createFunctionLookup(node);

        for (const item of node.ast.body) {
          if (item.type === "FunctionDeclaration" && item.identifier) {
            const fnName = item.identifier.value;
            const summary = node.functions.get(fnName);
            if (summary && item.body) {
              summary.returnShape = this.summarizeFunctionBody(
                item.body,
                summary.params,
                node,
                lookup
              );
            }
          } else if (item.type === "ExportDeclaration") {
            const inner = item.declaration;
            if (inner && inner.type === "FunctionDeclaration" && inner.identifier) {
              const fnName = inner.identifier.value;
              const summary = node.functions.get(fnName);
              if (summary && inner.body) {
                summary.returnShape = this.summarizeFunctionBody(
                  inner.body,
                  summary.params,
                  node,
                  lookup
                );
              }
            } else if (inner && inner.type === "VariableDeclaration") {
              this.summarizeFunctionsFromVarDecl(node, inner, lookup);
            }
          } else if (item.type === "VariableDeclaration") {
            this.summarizeFunctionsFromVarDecl(node, item, lookup);
          }
        }
      }
    }
  }

  private summarizeFunctionsFromVarDecl(
    node: ModuleNode,
    decl: VariableDeclaration,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    for (const declarator of decl.declarations) {
      if (declarator.id.type === "Identifier" && declarator.init) {
        const init = declarator.init;
        if (
          init.type === "ArrowFunctionExpression" ||
          init.type === "FunctionExpression"
        ) {
          const fnName = declarator.id.value;
          const summary = node.functions.get(fnName);
          if (summary && init.body) {
            if (init.body.type === "BlockStatement") {
              summary.returnShape = this.summarizeFunctionBody(
                init.body,
                summary.params,
                node,
                lookup
              );
            } else {
              // Arrow function expression body: e.g. () => process.env.SECRET
              const env = new Map<string, DataFlowShape>();
              summary.params.forEach((param, idx) => {
                env.set(param, { kind: "param-ref", paramIndex: idx });
              });
              summary.returnShape = evaluateExpressionShape(
                init.body as Expression,
                env,
                node.locator,
                lookup,
                0,
                this.maxDepth
              );
            }
          }
        }
      }
    }
  }

  private summarizeFunctionBody(
    body: BlockStatement,
    params: string[],
    node: ModuleNode,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): DataFlowShape {
    const env = new Map<string, DataFlowShape>();
    params.forEach((param, idx) => {
      env.set(param, { kind: "param-ref", paramIndex: idx });
    });

    let returnShape: DataFlowShape = { kind: "clean" };

    for (const stmt of body.stmts) {
      if (stmt.type === "VariableDeclaration") {
        for (const declarator of stmt.declarations) {
          if (declarator.init) {
            const initShape = evaluateExpressionShape(
              declarator.init,
              env,
              node.locator,
              lookup,
              0,
              this.maxDepth
            );
            applyDestructuring(declarator.id, initShape, env);
          }
        }
      } else if (stmt.type === "ReturnStatement" && stmt.argument) {
        returnShape = evaluateExpressionShape(
          stmt.argument,
          env,
          node.locator,
          lookup,
          0,
          this.maxDepth
        );
      }
    }

    return returnShape;
  }

  /**
   * Scans Client Boundaries ("use client") for sinks that receive tainted data.
   */
  private analyzeClientBoundaries(): void {
    for (const node of this.graph.modules.values()) {
      if (!node.isClientBoundary) {
        continue;
      }

      const lookup = this.createFunctionLookup(node);
      const fileEnv = new Map<string, DataFlowShape>();

      // Walk module items
      for (const item of node.ast.body) {
        if (item.type === "VariableDeclaration") {
          this.analyzeClientVarDecl(node, item, fileEnv, lookup);
        } else if (item.type === "ExportDeclaration") {
          const inner = item.declaration;
          if (inner && inner.type === "VariableDeclaration") {
            this.analyzeClientVarDecl(node, inner, fileEnv, lookup);
          } else if (inner && inner.type === "FunctionDeclaration") {
            this.analyzeClientFunction(node, inner, fileEnv, lookup);
          }
        } else if (item.type === "ExportDefaultDeclaration") {
          this.analyzeClientDefaultExport(node, item, fileEnv, lookup);
        } else if (item.type === "FunctionDeclaration") {
          this.analyzeClientFunction(node, item, fileEnv, lookup);
        }
      }
    }
  }

  private analyzeClientVarDecl(
    node: ModuleNode,
    decl: VariableDeclaration,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    for (const declarator of decl.declarations) {
      if (declarator.init) {
        const init = declarator.init;
        if (
          init.type === "ArrowFunctionExpression" ||
          init.type === "FunctionExpression"
        ) {
          // Component function
          const fnEnv = new Map<string, DataFlowShape>(env);
          init.params.forEach((param, idx) => {
            if (param.type === "Identifier") {
              fnEnv.set(param.value, { kind: "param-ref", paramIndex: idx });
            }
          });
          if (init.body) {
            if (init.body.type === "BlockStatement") {
              this.walkStatementsForJsxSinks(node, init.body.stmts, fnEnv, lookup);
            } else {
              this.inspectExpressionForJsxSinks(node, init.body as Expression, fnEnv, lookup);
            }
          }
        } else {
          const shape = evaluateExpressionShape(
            init,
            env,
            node.locator,
            lookup,
            0,
            this.maxDepth
          );
          applyDestructuring(declarator.id, shape, env);
        }
      }
    }
  }

  private analyzeClientFunction(
    node: ModuleNode,
    fn: FunctionDeclaration,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    if (!fn.body) return;
    const fnEnv = new Map<string, DataFlowShape>(env);
    fn.params.forEach((param, idx) => {
      if (param.pat.type === "Identifier") {
        fnEnv.set(param.pat.value, { kind: "param-ref", paramIndex: idx });
      }
    });

    this.walkStatementsForJsxSinks(node, fn.body.stmts, fnEnv, lookup);
  }

  private walkStatementsForJsxSinks(
    node: ModuleNode,
    stmts: Statement[],
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    for (const stmt of stmts) {
      if (stmt.type === "VariableDeclaration") {
        for (const declarator of stmt.declarations) {
          if (declarator.init) {
            const shape = evaluateExpressionShape(
              declarator.init,
              env,
              node.locator,
              lookup,
              0,
              this.maxDepth
            );
            applyDestructuring(declarator.id, shape, env);
          }
        }
      } else if (stmt.type === "ReturnStatement" && stmt.argument) {
        this.inspectExpressionForJsxSinks(node, stmt.argument, env, lookup);
      }
    }
  }

  private inspectExpressionForJsxSinks(
    node: ModuleNode,
    expr: Expression,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    if (expr.type === "JSXElement") {
      this.walkJsxElement(node, expr as JSXElement, env, lookup);
    } else if (expr.type === "JSXFragment") {
      this.walkJsxFragment(node, expr as JSXFragment, env, lookup);
    } else if (expr.type === "ParenthesisExpression") {
      this.inspectExpressionForJsxSinks(node, (expr as any).expression, env, lookup);
    }
  }

  private walkJsxElement(
    node: ModuleNode,
    el: JSXElement,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    // Check attributes
    for (const attr of el.opening.attributes) {
      if (attr.type === "JSXAttribute" && attr.value?.type === "JSXExpressionContainer") {
        this.checkJsxExpression(node, attr.value.expression, env, lookup);
      }
    }

    // Check children
    for (const child of el.children) {
      if (child.type === "JSXExpressionContainer") {
        this.checkJsxExpression(node, child.expression, env, lookup);
      } else if (child.type === "JSXElement") {
        this.walkJsxElement(node, child, env, lookup);
      } else if (child.type === "JSXFragment") {
        this.walkJsxFragment(node, child, env, lookup);
      }
    }
  }

  private walkJsxFragment(
    node: ModuleNode,
    frag: JSXFragment,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    for (const child of frag.children) {
      if (child.type === "JSXExpressionContainer") {
        this.checkJsxExpression(node, child.expression, env, lookup);
      } else if (child.type === "JSXElement") {
        this.walkJsxElement(node, child, env, lookup);
      } else if (child.type === "JSXFragment") {
        this.walkJsxFragment(node, child, env, lookup);
      }
    }
  }

  private checkJsxExpression(
    node: ModuleNode,
    expr: Expression | any,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    const shape = evaluateExpressionShape(
      expr,
      env,
      node.locator,
      lookup,
      0,
      this.maxDepth
    );

    if (isTaintedShape(shape)) {
      const taint = extractTaintInfo(shape);
      if (taint) {
        const loc = node.locator.getLocation(expr.span.start);
        this.recordFinding(node, taint, loc, "JSX expression");
      }
    }
  }

  private analyzeClientDefaultExport(
    node: ModuleNode,
    decl: import("@swc/core").ExportDefaultDeclaration,
    env: Map<string, DataFlowShape>,
    lookup: (callee: string, ns?: string) => FunctionSummary | undefined
  ): void {
    const inner = decl.decl as any;
    if (
      inner.type === "FunctionDeclaration" ||
      inner.type === "FunctionExpression"
    ) {
      if (inner.body) {
        const fnEnv = new Map<string, DataFlowShape>(env);
        this.walkStatementsForJsxSinks(node, inner.body.stmts, fnEnv, lookup);
      }
    } else if (inner.type === "Identifier") {
      const shape = env.get(inner.value);
      if (shape && isTaintedShape(shape)) {
        const taint = extractTaintInfo(shape);
        if (taint) {
          const loc = node.locator.getLocation(decl.span.start);
          this.recordFinding(node, taint, loc, "default export");
        }
      }
    }
  }

  /**
   * Checks candidate Server Actions returning sensitive data.
   */
  private analyzeServerActionReturns(): void {
    for (const node of this.graph.modules.values()) {
      if (!node.isServerBoundary) {
        continue;
      }

      for (const [fnName, summary] of node.functions.entries()) {
        if (summary.isAsync && isTaintedShape(summary.returnShape)) {
          const taint = extractTaintInfo(summary.returnShape);
          if (taint) {
            this.recordFinding(
              node,
              taint,
              summary.location,
              `Server Action return: ${fnName}()`
            );
          }
        }
      }
    }
  }

  private recordFinding(
    node: ModuleNode,
    taint: { taintSource: import("../taint/types.js").TaintSource; trace: string[] },
    loc: SourceLocation,
    sinkDescription: string
  ): void {
    const dedupKey = `${loc.file}:${loc.line}:${taint.taintSource.rawExpression}`;
    if (this.reportedFindingKeys.has(dedupKey)) {
      return;
    }
    this.reportedFindingKeys.add(dedupKey);

    const finding = createTaintViolationFinding(
      {
        source: taint.taintSource,
        trace: taint.trace,
      },
      {
        location: loc,
        sinkDescription: `${node.filePath}:${sinkDescription}`,
      }
    );

    this.findings.push(finding);
  }
}

export function analyzeInterproceduralDataflow(
  graph: ModuleGraph,
  options?: DataFlowOptions
): DataFlowResult {
  const analyzer = new DataFlowAnalyzer(graph, options);
  return analyzer.analyze();
}
