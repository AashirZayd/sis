import type {
  AuditStatistics,
  AnalysisError,
  FindingType,
  FindingSeverity,
  OutputFormat,
} from "../core/types.js";

export type { OutputFormat };

export interface JsonToolInfo {
  name: string;
  version: string;
}

export interface JsonSummary {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
  boundariesFound: number;
  serverActionsFound: number;
  verifiedFindings: number;
  runtimeFailures: number;
  taintViolations: number;
  analysisErrors: number;
  shrinkSuccessCount: number;
}

export interface JsonActionSummary {
  name: string;
  file: string;
  line: number;
  column: number;
  executionCompatibility?: import("../core/types.js").ExecutionCompatibility;
  executionMode?: import("../runtime/types.js").ExecutionMode;
  stoppedAt?: import("../runtime/types.js").StoppedAt;
}

export interface JsonFindingRuntime {
  failureSignature?: string;
  executionMs?: number;
  wallTimeMs?: number;
  timeoutMs?: number;
  payload?: unknown;
}

export interface JsonFindingShrink {
  attempts?: number;
  reductionRatio?: number;
  minimalReproducerVerified?: boolean;
  minimizedPayload?: unknown;
}

export interface JsonFinding {
  id: string;
  ruleId: string;
  ruleName: string;
  type: FindingType;
  severity: FindingSeverity;
  message: string;
  file: string;
  location: {
    line: number;
    column: number;
  };
  actionName?: string;
  fuzzTarget?: string;
  strategy?: string;
  invariant?: string;
  parameter?: string;
  executionMode?: import("../runtime/types.js").ExecutionMode;
  verifiedPrefix?: import("../runtime/types.js").PrefixBoundary;
  stoppedAt?: import("../runtime/types.js").StoppedAt;
  runtime?: JsonFindingRuntime;
  shrink?: JsonFindingShrink;
  trace?: string[];
}

export interface JsonAuditReport {
  version: "1";
  tool: JsonToolInfo;
  target: string;
  summary: JsonSummary;
  statistics: AuditStatistics;
  files: string[];
  findings: JsonFinding[];
  actions: JsonActionSummary[];
  errors: AnalysisError[];
}

// ================= SARIF 2.1.0 Types =================

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
  index?: number;
}

export interface SarifRegion {
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
  message?: SarifMessage;
}

export interface SarifRuleConfiguration {
  defaultLevel?: "error" | "warning" | "note" | "none";
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: SarifMessage;
  fullDescription?: SarifMessage;
  help?: SarifMessage;
  defaultConfiguration?: SarifRuleConfiguration;
  properties?: Record<string, unknown>;
}

export interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

export interface SarifTool {
  driver: SarifDriver;
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: "error" | "warning" | "note";
  message: SarifMessage;
  locations: SarifLocation[];
  properties?: Record<string, unknown>;
}

export interface SarifRun {
  tool: SarifTool;
  artifacts?: Array<{ location: SarifArtifactLocation }>;
  results: SarifResult[];
}

export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
}
