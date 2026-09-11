import type {
  Module,
  ModuleItem,
  ExportDeclaration,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
  FunctionDeclaration,
} from "@swc/core";
import type { Boundary, ServerAction } from "../core/types.js";
import type { Directive, ParsedModule } from "./types.js";
import type { SourceMapLocator } from "./location.js";
import { classifyBoundary } from "../boundary/classifier.js";

/**
 * AST visitor that analyzes SWC Program (Module) nodes to extract:
 * 1. "use client" / "use server" directives and boundaries
 * 2. Candidate Server Actions (exported async functions in server boundary modules)
 */
export class BoundaryVisitor {
  private directives: Directive[] = [];
  private boundaries: Boundary[] = [];
  private actions: ServerAction[] = [];
  private topLevelAsyncFunctions: Map<string, { name: string; byteOffset: number }> = new Map();

  constructor(
    private readonly file: string,
    private readonly locator: SourceMapLocator
  ) {}

  /**
   * Analyzes an SWC Module AST and returns the normalized ParsedModule representation.
   */
  visit(module: Module): ParsedModule {
    this.extractDirectives(module.body);
    const hasServerDirective = this.directives.some((d) => d.kind === "use-server");

    // Pre-scan top-level async function declarations for named export resolution
    this.indexTopLevelFunctions(module.body);

    if (hasServerDirective) {
      this.extractCandidateServerActions(module.body);
    }

    const classification = classifyBoundary(this.file, module);

    if (
      classification.kind === "client-component" &&
      !this.boundaries.some((b) => b.type === "client")
    ) {
      this.boundaries.push({
        type: "client",
        kind: "client-component",
        classification,
        location: this.locator.getLocation(module.span.start),
        name: this.file,
      });
    } else if (
      classification.kind === "route-handler" &&
      !this.boundaries.some((b) => b.kind === "route-handler")
    ) {
      this.boundaries.push({
        type: "server",
        kind: "route-handler",
        classification,
        location: this.locator.getLocation(module.span.start),
        name: this.file,
      });
    }

    for (const b of this.boundaries) {
      if (!b.classification) {
        b.classification = classification;
      }
      if (!b.kind) {
        b.kind = classification.kind;
      }
    }

    return {
      file: this.file,
      directives: this.directives,
      boundaries: this.boundaries,
      actions: this.actions,
      ast: module,
      locator: this.locator,
      boundaryClassification: classification,
    };
  }

  /**
   * Discovers prologue directives at the top of the module.
   * Prologue directives in ECMAScript must be leading ExpressionStatements with StringLiterals.
   * As soon as any other statement appears, the directive prologue ends.
   */
  private extractDirectives(items: ModuleItem[]): void {
    for (const item of items) {
      if (item.type !== "ExpressionStatement") {
        break;
      }

      if (item.expression.type !== "StringLiteral") {
        break;
      }

      const value = item.expression.value;
      if (value === "use client") {
        const location = this.locator.getLocation(item.span.start);
        this.directives.push({ kind: "use-client", location });
        this.boundaries.push({ type: "client", location });
      } else if (value === "use server") {
        const location = this.locator.getLocation(item.span.start);
        this.directives.push({ kind: "use-server", location });
        this.boundaries.push({ type: "server", location });
      } else {
        // Any other string literal (e.g. "use strict") continues or ends prologue,
        // but is not a boundary directive.
      }
    }
  }

  /**
   * Indexes top-level async functions so that `export { fnName }` can be verified.
   */
  private indexTopLevelFunctions(items: ModuleItem[]): void {
    for (const item of items) {
      if (item.type === "FunctionDeclaration" && item.async && item.identifier) {
        this.topLevelAsyncFunctions.set(item.identifier.value, {
          name: item.identifier.value,
          byteOffset: item.identifier.span.start,
        });
      }
    }
  }

  /**
   * Discovers candidate Server Actions in a module with a "use server" directive.
   */
  private extractCandidateServerActions(items: ModuleItem[]): void {
    for (const item of items) {
      switch (item.type) {
        case "ExportDeclaration":
          this.handleExportDeclaration(item);
          break;
        case "ExportNamedDeclaration":
          this.handleExportNamedDeclaration(item);
          break;
        case "ExportDefaultDeclaration":
          this.handleExportDefaultDeclaration(item);
          break;
      }
    }
  }

  private handleExportDeclaration(decl: ExportDeclaration): void {
    const inner = decl.declaration;
    if (!inner) return;

    if (inner.type === "FunctionDeclaration") {
      // e.g. export async function actionName() {}
      if (inner.async && inner.identifier) {
        this.actions.push({
          name: inner.identifier.value,
          location: this.locator.getLocation(inner.identifier.span.start),
        });
      }
    } else if (inner.type === "VariableDeclaration") {
      // e.g. export const actionName = async () => {}
      for (const declarator of inner.declarations) {
        const init = declarator.init;
        if (!init) continue;

        const isAsyncFn =
          (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") &&
          init.async;

        if (isAsyncFn && declarator.id.type === "Identifier") {
          this.actions.push({
            name: declarator.id.value,
            location: this.locator.getLocation(declarator.id.span.start),
          });
        }
      }
    }
  }

  private handleExportNamedDeclaration(decl: ExportNamedDeclaration): void {
    for (const spec of decl.specifiers) {
      if (spec.type === "ExportSpecifier") {
        const localName =
          spec.orig.type === "Identifier" ? spec.orig.value : spec.orig.value;
        const exportedName = spec.exported
          ? spec.exported.value
          : localName;

        const asyncFn = this.topLevelAsyncFunctions.get(localName);
        if (asyncFn) {
          this.actions.push({
            name: exportedName,
            location: this.locator.getLocation(spec.span.start),
          });
        }
      }
    }
  }

  private handleExportDefaultDeclaration(decl: ExportDefaultDeclaration): void {
    const inner = decl.decl;
    if (inner.type === "FunctionExpression" && inner.async) {
      const name = inner.identifier?.value ?? "default";
      this.actions.push({
        name,
        location: this.locator.getLocation(decl.span.start),
      });
    }
  }
}
