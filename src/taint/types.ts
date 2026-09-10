import type { Finding, SourceLocation } from "../core/types.js";

export type TaintKind = "secret" | "credential";

export interface TaintSource {
  kind: TaintKind;
  name: string;
  rawExpression: string;
  location: SourceLocation;
}

export interface TaintValue {
  source: TaintSource;
  trace: string[];
  propertyPath?: string[];
}

export interface TaintAnalysisOptions {
  file: string;
  isClientBoundary: boolean;
}

export interface TaintAnalysisResult {
  sources: TaintSource[];
  findings: Finding[];
  taintSourcesFound: number;
  taintViolations: number;
}
