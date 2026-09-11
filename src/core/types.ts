export type BoundaryType = "client" | "server";

export type BoundaryKind =
  | "client-module"
  | "server-module"
  | "server-component"
  | "client-component"
  | "server-action"
  | "route-handler"
  | "server-function"
  | "candidate-server-function"
  | "server-to-client-props"
  | "unknown";

export type BoundaryConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface BoundaryClassification {
  kind: BoundaryKind;
  confidence: BoundaryConfidence;
  evidence: string[];
  reason: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface Boundary {
  type: BoundaryType;
  kind?: BoundaryKind;
  classification?: BoundaryClassification;
  location: SourceLocation;
  name?: string;
  metadata?: Record<string, unknown>;
}

export type ServerActionConfidence = "definite" | "candidate" | "ordinary";
export type ExecutionCompatibility =
  | "sandbox-compatible"
  | "static-only"
  | "unsupported-runtime"
  | "unknown";

export interface ServerAction {
  name: string;
  location: SourceLocation;
  directiveLocation?: SourceLocation;
  confidence?: ServerActionConfidence;
  isExported?: boolean;
  isInlineDirective?: boolean;
  executionCompatibility?: ExecutionCompatibility;
}

export type FindingType =
  | "taint-violation"
  | "serialization-violation"
  | "runtime-exception"
  | "timeout"
  | "invariant-violation";

export type FindingSeverity = "info" | "warning" | "error";

export interface Finding {
  type: FindingType;
  severity: FindingSeverity;
  message: string;
  location?: SourceLocation;
  action?: string;
  boundaryKind?: BoundaryKind;
  direction?: "client-to-server" | "server-to-client";
  verification?: "static" | "runtime";
  payload?: unknown;
  payloadId?: number;
  category?: string;
  payloadDescription?: string;
  executionMs?: number;
  wallTimeMs?: number;
  timeoutMs?: number;
  durationMs?: number;
  errorName?: string;
  originalPayload?: unknown;
  minimizedPayload?: unknown;
  shrinkAttempts?: number;
  shrinkReduction?: number;
  minimalReproducerVerified?: boolean;
  failureSignature?: string;
  trace?: string[];
  fuzzTarget?: string;
  strategy?: string;
  invariant?: string;
  parameter?: string;
}

export interface AnalysisError {
  file: string;
  type: "parse-error" | "analysis-error" | "runtime-error" | "filesystem-error";
  message: string;
  detail?: string;
}

export interface AuditStatistics {
  filesScanned: number;
  filesAnalyzed?: number;
  filesSkipped?: number;
  analysisErrors?: number;
  boundariesFound: number;
  actionsFound: number;
  taintSourcesFound: number;
  taintViolations: number;
  payloadsGenerated: number;
  executions: number;
  passedExecutions?: number;
  failedExecutions?: number;
  timeoutExecutions?: number;
  unsupportedExecutions?: number;
  shrinkAttempts?: number;
  verifiedReproCount?: number;
  propBoundariesFound?: number;
  verifiedSafeProps?: number;
  serializabilityViolations?: number;
  unknownSerializability?: number;
  fuzzTargetsDiscovered?: number;
  fuzzStrategiesApplied?: number;
  boundaryDirectedPayloads?: number;
  genericFallbackPayloads?: number;
}

export interface AuditResult {
  target: string;
  filesAnalyzed?: string[];
  boundaries: Boundary[];
  actions: ServerAction[];
  findings: Finding[];
  analysisErrors?: AnalysisError[];
  statistics: AuditStatistics;
  payloadSynthesis?: import("../payload/types.js").PayloadSynthesisResult;
  runtime?: import("../runtime/types.js").RuntimeVerificationSummary;
  shrinkResults?: import("../shrinker/types.js").ShrinkResult[];
}

export type OutputFormat = "terminal" | "json" | "sarif";

export interface AuditOptions {
  runs?: number;
  seed?: number;
  timeoutMs?: number;
  shrink?: boolean;
  maxShrinkAttempts?: number;
  ignore?: string[];
  format?: OutputFormat;
  maxAnalysisDepth?: number;
  excludeTests?: boolean;
  debug?: boolean;
  silent?: boolean;
}

export interface ExecutionResult {
  status:
    | "success"
    | "exception"
    | "timeout"
    | "serialization-failure";
  value?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  durationMs: number;
}
