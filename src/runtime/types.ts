import type { PayloadCategory } from "../payload/types.js";
import type { SourceLocation } from "../core/types.js";

/**
 * Status outcome of executing a single payload against a candidate Server Action.
 */
export type RuntimeStatus =
  | "passed"
  | "failed"
  | "timeout"
  | "unsupported"
  | "execution-error";

/**
 * Execution mode distinguishing full execution from prefix execution or static-only fallback.
 */
export type ExecutionMode = "FULL" | "PREFIX" | "STATIC_ONLY" | "UNSUPPORTED";

/**
 * Line/column span of verified prefix code in a Server Action.
 */
export interface PrefixBoundary {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

/**
 * Reason and location where prefix execution terminated.
 */
export interface StoppedAt {
  dependency: string;
  reason: "unsupported-runtime" | "framework-boundary" | "cloud-sdk";
  line?: number;
}

/**
 * Detailed runtime provenance for audit findings and reporters.
 */
export interface RuntimeProvenance {
  mode: ExecutionMode;
  preludesUsed?: string[];
  verifiedPrefix?: PrefixBoundary;
  stoppedAt?: StoppedAt;
}

/**
 * Options for configuring isolated-vm execution.
 */
export interface RuntimeExecutionOptions {
  /**
   * Execution deadline in milliseconds.
   * Default: 20ms
   */
  timeoutMs?: number;

  /**
   * Memory limit in MB for the V8 isolate.
   * Default: 128MB
   */
  memoryLimitMb?: number;
}

/**
 * Result of executing a single payload against a candidate Server Action.
 */
export interface RuntimeExecutionResult {
  actionName: string;
  payloadId: number;
  category: PayloadCategory;
  payloadDescription: string;
  payloadValue: unknown;
  status: RuntimeStatus;

  /**
   * Time spent executing candidate code inside isolated-vm.
   * This is the value strictly governed by timeoutMs.
   */
  executionMs: number;

  /**
   * Total host-side wall-clock duration for this execution attempt,
   * including setup and teardown.
   */
  wallTimeMs: number;

  /**
   * Configured candidate execution budget in milliseconds.
   */
  timeoutMs: number;

  /**
   * Backward-compatible duration alias (maps to executionMs).
   */
  durationMs: number;

  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  location?: SourceLocation;
  fuzzTarget?: string;
  strategy?: string;
  invariant?: string;
  parameter?: string;

  /**
   * Execution mode under which this result was obtained.
   */
  executionMode?: ExecutionMode;

  /**
   * Verified prefix boundary if executionMode === "PREFIX".
   */
  verifiedPrefix?: PrefixBoundary;

  /**
   * Details on the unsupported dependency where execution stopped.
   */
  stoppedAt?: StoppedAt;

  /**
   * Framework preludes utilized during this execution.
   */
  preludesUsed?: string[];
}

/**
 * Aggregate summary of runtime verification across all actions and payloads.
 */
export interface RuntimeVerificationSummary {
  executions: RuntimeExecutionResult[];
  executed: number;
  passed: number;
  failed: number;
  timedOut: number;
  unsupported: number;
  timeoutMs: number;
  fullExecutions?: number;
  prefixExecutions?: number;
  staticOnlyActions?: number;
  unsupportedActions?: number;
}

/**
 * Statically extracted candidate function ready for isolate compilation.
 */
export interface CandidateFunctionSource {
  actionName: string;
  code: string;
  location: SourceLocation;
  executionMode?: ExecutionMode;
  verifiedPrefix?: PrefixBoundary;
  stoppedAt?: StoppedAt;
  preludesUsed?: string[];
}

