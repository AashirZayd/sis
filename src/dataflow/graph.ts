import type {
  Module,
  ModuleItem,
  ImportDeclaration,
  ExportNamedDeclaration,
  ExportDeclaration,
  ExportDefaultDeclaration,
  FunctionDeclaration,
  VariableDeclaration,
} from "@swc/core";
import type { ParsedModule } from "../parser/types.js";
import { resolveModuleSpecifier } from "./resolver.js";
import type {
  ModuleGraph,
  ModuleNode,
  ImportBinding,
  ExportBinding,
  FunctionSummary,
} from "./types.js";

/**
 * Builds a ModuleGraph from a collection of parsed modules.
 * Connects module imports and exports using deterministic relative path resolution.
 */
export function buildModuleGraph(
  parsedModules: Map<string, ParsedModule>
): ModuleGraph {
  const availableFiles = new Set(parsedModules.keys());
  const modules = new Map<string, ModuleNode>();

  for (const [filePath, parsed] of parsedModules.entries()) {
    const isClientBoundary =
      parsed.boundaries.some((b) => b.type === "client") ||
      parsed.boundaryClassification?.kind === "client-component";
    const isServerBoundary =
      parsed.boundaries.some((b) => b.type === "server") ||
      parsed.boundaryClassification?.kind === "server-component" ||
      parsed.boundaryClassification?.kind === "server-action" ||
      parsed.boundaryClassification?.kind === "route-handler";

    const imports = new Map<string, ImportBinding>();
    const exports = new Map<string, ExportBinding>();
    const functions = new Map<string, FunctionSummary>();

    const node: ModuleNode = {
      filePath,
      absolutePath: parsed.file,
      ast: parsed.ast,
      locator: parsed.locator,
      isClientBoundary,
      isServerBoundary,
      boundaryClassification: parsed.boundaryClassification,
      imports,
      exports,
      functions,
    };

    extractModuleBindings(node, parsed.ast, availableFiles);
    modules.set(filePath, node);
  }

  return { modules };
}

function extractModuleBindings(
  node: ModuleNode,
  ast: Module,
  availableFiles: Set<string>
): void {
  for (const item of ast.body) {
    switch (item.type) {
      case "ImportDeclaration":
        handleImportDeclaration(node, item, availableFiles);
        break;

      case "ExportDeclaration":
        handleExportDeclaration(node, item);
        break;

      case "ExportNamedDeclaration":
        handleExportNamedDeclaration(node, item, availableFiles);
        break;

      case "ExportDefaultDeclaration":
        handleExportDefaultDeclaration(node, item);
        break;
    }
  }
}

function handleImportDeclaration(
  node: ModuleNode,
  decl: ImportDeclaration,
  availableFiles: Set<string>
): void {
  const rawSpecifier = decl.source.value;
  const resolvedModule = resolveModuleSpecifier(
    node.filePath,
    rawSpecifier,
    availableFiles
  );

  for (const spec of decl.specifiers) {
    const loc = node.locator.getLocation(spec.span.start);

    if (spec.type === "ImportSpecifier") {
      const importedName = spec.imported ? spec.imported.value : spec.local.value;
      const localName = spec.local.value;
      node.imports.set(localName, {
        localName,
        importedName,
        sourceModule: rawSpecifier,
        resolvedModule,
        location: loc,
      });
    } else if (spec.type === "ImportDefaultSpecifier") {
      const localName = spec.local.value;
      node.imports.set(localName, {
        localName,
        importedName: "default",
        sourceModule: rawSpecifier,
        resolvedModule,
        location: loc,
      });
    } else if (spec.type === "ImportNamespaceSpecifier") {
      const localName = spec.local.value;
      node.imports.set(localName, {
        localName,
        importedName: "*",
        sourceModule: rawSpecifier,
        resolvedModule,
        location: loc,
      });
    }
  }
}

function handleExportDeclaration(
  node: ModuleNode,
  decl: ExportDeclaration
): void {
  const inner = decl.declaration;
  if (!inner) return;

  const loc = node.locator.getLocation(decl.span.start);

  if (inner.type === "FunctionDeclaration" && inner.identifier) {
    const name = inner.identifier.value;
    node.exports.set(name, {
      exportedName: name,
      localName: name,
      isDefault: false,
      isReExport: false,
      location: loc,
    });
  } else if (inner.type === "VariableDeclaration") {
    for (const declarator of inner.declarations) {
      if (declarator.id.type === "Identifier") {
        const name = declarator.id.value;
        node.exports.set(name, {
          exportedName: name,
          localName: name,
          isDefault: false,
          isReExport: false,
          location: loc,
        });
      }
    }
  }
}

function handleExportNamedDeclaration(
  node: ModuleNode,
  decl: ExportNamedDeclaration,
  availableFiles: Set<string>
): void {
  const loc = node.locator.getLocation(decl.span.start);
  const isReExport = !!decl.source;
  const resolvedSource = decl.source
    ? resolveModuleSpecifier(node.filePath, decl.source.value, availableFiles)
    : undefined;

  for (const spec of decl.specifiers) {
    if (spec.type === "ExportSpecifier") {
      const origName =
        spec.orig.type === "Identifier" ? spec.orig.value : spec.orig.value;
      const exportedName = spec.exported ? spec.exported.value : origName;

      node.exports.set(exportedName, {
        exportedName,
        localName: isReExport ? undefined : origName,
        isDefault: exportedName === "default",
        isReExport,
        reExportSource: resolvedSource,
        reExportName: isReExport ? origName : undefined,
        location: loc,
      });
    }
  }
}

function handleExportDefaultDeclaration(
  node: ModuleNode,
  decl: ExportDefaultDeclaration
): void {
  const loc = node.locator.getLocation(decl.span.start);
  const inner = decl.decl as any;

  let localName: string | undefined;
  if (
    (inner.type === "FunctionDeclaration" || inner.type === "FunctionExpression") &&
    inner.identifier
  ) {
    localName = inner.identifier.value;
  } else if (inner.type === "Identifier") {
    localName = inner.value;
  }

  node.exports.set("default", {
    exportedName: "default",
    localName,
    isDefault: true,
    isReExport: false,
    location: loc,
  });
}
