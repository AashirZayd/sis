import type {
  Module,
  ModuleItem,
  FunctionDeclaration,
  VariableDeclaration,
  ExportDeclaration,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
} from "@swc/core";
import type { Boundary, ServerAction, SourceLocation } from "../core/types.js";
import type { SourceMapLocator } from "../parser/location.js";
import { hasFunctionLevelServerDirective } from "./serializability.js";

export interface ExtendedBoundaryResult {
  boundaries: Boundary[];
  actions: ServerAction[];
  isClientModule: boolean;
  isServerModule: boolean;
}

/**
 * Enhanced AST visitor discovering module-level and function-level directives,
 * classifying boundary kinds and Server Action confidence.
 */
export class NextBoundaryVisitor {
  private readonly boundaries: Boundary[] = [];
  private readonly actions: ServerAction[] = [];
  private isClientModule = false;
  private isServerModule = false;

  constructor(
    private readonly file: string,
    private readonly locator: SourceMapLocator
  ) {}

  visit(module: Module): ExtendedBoundaryResult {
    this.extractModuleDirectives(module.body);

    if (this.isClientModule) {
      this.boundaries.push({
        type: "client",
        kind: "client-module",
        location: this.locator.getLocation(module.span.start),
        name: this.file,
      });
    } else if (this.isServerModule) {
      this.boundaries.push({
        type: "server",
        kind: "server-module",
        location: this.locator.getLocation(module.span.start),
        name: this.file,
      });
    } else {
      // Default App Router component
      this.boundaries.push({
        type: "server",
        kind: "server-component",
        location: this.locator.getLocation(module.span.start),
        name: this.file,
      });
    }

    this.extractFunctionsAndActions(module.body);

    return {
      boundaries: this.boundaries,
      actions: this.actions,
      isClientModule: this.isClientModule,
      isServerModule: this.isServerModule,
    };
  }

  /**
   * Discovers module-level prologue directives.
   * Only leading ExpressionStatements with StringLiterals count as directives.
   */
  private extractModuleDirectives(items: ModuleItem[]): void {
    for (const item of items) {
      if (item.type !== "ExpressionStatement") {
        break;
      }
      if (item.expression.type !== "StringLiteral") {
        break;
      }

      const val = item.expression.value;
      if (val === "use client") {
        this.isClientModule = true;
      } else if (val === "use server") {
        this.isServerModule = true;
      }
    }
  }

  /**
   * Scans for Server Actions (both module-level and function-level "use server").
   */
  private extractFunctionsAndActions(items: ModuleItem[]): void {
    for (const item of items) {
      switch (item.type) {
        case "FunctionDeclaration":
          this.handleFunctionDeclaration(item, false);
          break;

        case "ExportDeclaration":
          this.handleExportDeclaration(item);
          break;

        case "ExportNamedDeclaration":
          this.handleExportNamedDeclaration(item);
          break;

        case "ExportDefaultDeclaration":
          this.handleExportDefaultDeclaration(item);
          break;

        case "VariableDeclaration":
          this.handleVariableDeclaration(item, false);
          break;
      }
    }
  }

  private handleFunctionDeclaration(
    fn: FunctionDeclaration,
    isExported: boolean
  ): void {
    if (!fn.identifier) return;
    const name = fn.identifier.value;
    const loc = this.locator.getLocation(fn.identifier.span.start);
    const hasInlineServer = hasFunctionLevelServerDirective(fn);

    if (hasInlineServer) {
      this.actions.push({
        name,
        location: loc,
        confidence: "definite",
        isExported,
        isInlineDirective: true,
        executionCompatibility: "sandbox-compatible",
      });
      this.boundaries.push({
        type: "server",
        kind: "server-action",
        location: loc,
        name,
      });
    } else if (this.isServerModule && isExported && fn.async) {
      this.actions.push({
        name,
        location: loc,
        confidence: "definite",
        isExported: true,
        isInlineDirective: false,
        executionCompatibility: "sandbox-compatible",
      });
      this.boundaries.push({
        type: "server",
        kind: "server-function",
        location: loc,
        name,
      });
    } else if (!this.isClientModule && isExported && fn.async) {
      // Async export in server file without "use server" - candidate
      this.actions.push({
        name,
        location: loc,
        confidence: "candidate",
        isExported: true,
        isInlineDirective: false,
        executionCompatibility: "sandbox-compatible",
      });
    }
  }

  private handleExportDeclaration(decl: ExportDeclaration): void {
    const inner = decl.declaration;
    if (!inner) return;

    if (inner.type === "FunctionDeclaration") {
      this.handleFunctionDeclaration(inner, true);
    } else if (inner.type === "VariableDeclaration") {
      this.handleVariableDeclaration(inner, true);
    }
  }

  private handleVariableDeclaration(
    decl: VariableDeclaration,
    isExported: boolean
  ): void {
    for (const declarator of decl.declarations) {
      if (declarator.id.type === "Identifier" && declarator.init) {
        const name = declarator.id.value;
        const loc = this.locator.getLocation(declarator.id.span.start);
        const init = declarator.init;

        if (
          init.type === "ArrowFunctionExpression" ||
          init.type === "FunctionExpression"
        ) {
          const hasInlineServer = hasFunctionLevelServerDirective(init);

          if (hasInlineServer) {
            this.actions.push({
              name,
              location: loc,
              confidence: "definite",
              isExported,
              isInlineDirective: true,
              executionCompatibility: "sandbox-compatible",
            });
            this.boundaries.push({
              type: "server",
              kind: "server-action",
              location: loc,
              name,
            });
          } else if (this.isServerModule && isExported && init.async) {
            this.actions.push({
              name,
              location: loc,
              confidence: "definite",
              isExported: true,
              isInlineDirective: false,
              executionCompatibility: "sandbox-compatible",
            });
            this.boundaries.push({
              type: "server",
              kind: "server-function",
              location: loc,
              name,
            });
          } else if (!this.isClientModule && isExported && init.async) {
            this.actions.push({
              name,
              location: loc,
              confidence: "candidate",
              isExported: true,
              isInlineDirective: false,
              executionCompatibility: "sandbox-compatible",
            });
          }
        }
      }
    }
  }

  private handleExportNamedDeclaration(decl: ExportNamedDeclaration): void {
    // If it's a "use server" module, named exports are server functions
    if (this.isServerModule) {
      for (const spec of decl.specifiers) {
        if (spec.type === "ExportSpecifier") {
          const name = spec.exported ? spec.exported.value : spec.orig.value;
          const loc = this.locator.getLocation(spec.span.start);
          this.actions.push({
            name,
            location: loc,
            confidence: "definite",
            isExported: true,
            isInlineDirective: false,
            executionCompatibility: "sandbox-compatible",
          });
        }
      }
    }
  }

  private handleExportDefaultDeclaration(decl: ExportDefaultDeclaration): void {
    const inner = decl.decl as any;
    const loc = this.locator.getLocation(decl.span.start);

    if (
      (inner.type === "FunctionDeclaration" || inner.type === "FunctionExpression") &&
      inner.async
    ) {
      const name = inner.identifier?.value ?? "default";
      const hasInline = hasFunctionLevelServerDirective(inner);

      if (hasInline || this.isServerModule) {
        this.actions.push({
          name,
          location: loc,
          confidence: "definite",
          isExported: true,
          isInlineDirective: hasInline,
          executionCompatibility: "sandbox-compatible",
        });
      }
    }
  }
}
