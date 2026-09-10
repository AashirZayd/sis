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
}

/**
 * Statically extracted candidate function ready for isolate compilation.
 */
export interface CandidateFunctionSource {
  actionName: string;
  code: string;
  location: SourceLocation;
}
