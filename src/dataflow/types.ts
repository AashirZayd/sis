import type { Module } from "@swc/core";
import type { Finding, SourceLocation } from "../core/types.js";
import type { SourceMapLocator } from "../parser/location.js";
import type { TaintSource } from "../taint/types.js";

export type DataFlowKind =
  | "clean"
  | "tainted"
  | "object"
  | "array"
  | "param-ref"
  | "unknown";

/**
 * Structural representation of data-flow values, supporting property-level
 * and element-level taint sensitivity as well as parameter references.
 */
export interface DataFlowShape {
  kind: DataFlowKind;
  taintSource?: TaintSource;
  trace?: string[];
  properties?: Map<string, DataFlowShape>;
  elements?: DataFlowShape[];
  paramIndex?: number;
  propPath?: string[];
}

export interface ImportBinding {
  localName: string;
  importedName: string; // "default" | "*" | named identifier
  sourceModule: string; // Raw specifier, e.g. "./auth"
  resolvedModule?: string; // POSIX relative path, e.g. "lib/auth.ts"
  location: SourceLocation;
}

export interface ExportBinding {
  exportedName: string; // "default" or named identifier
  localName?: string;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
  reExportName?: string;
  location: SourceLocation;
}

export interface FunctionSummary {
  name: string;
  filePath: string;
  location: SourceLocation;
  params: string[];
  isAsync: boolean;
  returnShape: DataFlowShape;
  directSources: TaintSource[];
}

export interface ModuleNode {
  filePath: string; // Normalized POSIX path
  absolutePath: string;
  ast: Module;
  locator: SourceMapLocator;
  isClientBoundary: boolean;
  isServerBoundary: boolean;
  imports: Map<string, ImportBinding>; // localName -> ImportBinding
  exports: Map<string, ExportBinding>; // exportedName -> ExportBinding
  functions: Map<string, FunctionSummary>; // functionName -> FunctionSummary
}

export interface ModuleGraph {
  modules: Map<string, ModuleNode>; // normalized filePath -> ModuleNode
}

export interface DataFlowOptions {
  maxDepth?: number;
}

export interface DataFlowResult {
  findings: Finding[];
  modulesAnalyzed: number;
  functionsSummarized: number;
}
