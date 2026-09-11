import type { Finding } from "../dist/index.js";

export interface FrameworkMetadata {
  nextVersion?: string;
  appRouter?: boolean;
  serverActions?: boolean;
  rsc?: boolean;
  orm?: string;
  auth?: string;
}

export interface BenchmarkCorpusEntry {
  name: string;
  url: string;
  commit: string;
  description: string;
  targetDir?: string;
  framework?: FrameworkMetadata;
  notes?: string;
}

export interface BenchmarkCorpus {
  version: string;
  description: string;
  repositories: BenchmarkCorpusEntry[];
}

export interface FindingBreakdown {
  taintViolations: number;
  serializationViolations: number;
  runtimeExceptions: number;
  timeouts: number;
  invariantViolations: number;
}

export interface RepositoryBenchmarkResult {
  repository: string;
  url: string;
  commit: string;
  status: "completed" | "partial" | "failed";
  error?: string;
  filesDiscovered: number;
  filesAnalyzed: number;
  filesSkipped: number;
  boundariesFound: number;
  serverActionsFound: number;
  propBoundariesFound: number;
  serializabilityLeaks: number;
  runtimeFailures: number;
  taintViolations: number;
  analysisErrors: number;
  verifiedFindings: number;
  runtimeCompatibleCandidates: number;
  auditWallTimeMs: number;
  seed: number;
  findingBreakdown: FindingBreakdown;
  rawFindings?: Finding[];
}

export interface BenchmarkRunMetadata {
  sisVersion: string;
  sisCommit: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuModel: string;
  corpusVersion: string;
  timestamp: string;
  baseSeed: number;
  runs: number;
  timeoutMs: number;
}

export interface BenchmarkAggregate {
  totalRepositories: number;
  successfulRepositories: number;
  failedRepositories: number;
  totalFilesScanned: number;
  totalFilesAnalyzed: number;
  totalBoundariesFound: number;
  totalServerActionsFound: number;
  totalPropBoundariesFound: number;
  totalSerializabilityLeaks: number;
  totalRuntimeFailures: number;
  totalTaintViolations: number;
  totalAnalysisErrors: number;
  totalVerifiedFindings: number;
  totalRuntimeCompatibleCandidates: number;
  totalWallTimeMs: number;
}

export interface BenchmarkRunResult {
  metadata: BenchmarkRunMetadata;
  repositories: RepositoryBenchmarkResult[];
  aggregate: BenchmarkAggregate;
}

export interface BenchmarkOptions {
  repo?: string;
  all?: boolean;
  json?: boolean;
  seed?: number;
  runs?: number;
  timeoutMs?: number;
  outDir?: string;
  dryRun?: boolean;
  keepTemp?: boolean;
  silent?: boolean;
  review?: boolean;
  reproduce?: string;
  status?: "pending" | "reviewed" | "all";
  rule?: string;
  syncReviews?: boolean;
}

export type FindingClassification =
  | "TRUE_POSITIVE"
  | "FALSE_POSITIVE"
  | "EXPECTED_BEHAVIOR"
  | "UNREACHABLE"
  | "FRAMEWORK_ARTIFACT"
  | "NEEDS_REVIEW";

export type ReviewConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ReviewRecord {
  repository: string;
  commit: string;
  file: string;
  line: number;
  column?: number;
  ruleId: string;
  fingerprint: string;
  message: string;
  actionName?: string;
  generatedInput?: unknown;
  failureSignature?: string;
  staticEvidence?: string | Record<string, unknown>;
  runtimeEvidence?: string | Record<string, unknown>;
  classification: FindingClassification;
  confidence: ReviewConfidence;
  reviewer?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
}

export interface GroundTruthReviews {
  version: string;
  lastUpdated: string;
  description: string;
  reviews: ReviewRecord[];
}

export interface GroundTruthRepositoryStats {
  total: number;
  reviewed: number;
  pending: number;
  truePositives: number;
  falsePositives: number;
  expectedBehavior: number;
  unreachable: number;
  frameworkArtifacts: number;
  needsReview: number;
  precision: number | null;
}

export interface GroundTruthRuleStats {
  total: number;
  reviewed: number;
  pending: number;
  truePositives: number;
  falsePositives: number;
  expectedBehavior: number;
  unreachable: number;
  frameworkArtifacts: number;
  needsReview: number;
  precision: number | null;
}

export interface GroundTruthStats {
  total: number;
  reviewed: number;
  pending: number;
  truePositives: number;
  falsePositives: number;
  expectedBehavior: number;
  unreachable: number;
  frameworkArtifacts: number;
  needsReview: number;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  precision: number | null;
  byRepository: Record<string, GroundTruthRepositoryStats>;
  byRule: Record<string, GroundTruthRuleStats>;
}
