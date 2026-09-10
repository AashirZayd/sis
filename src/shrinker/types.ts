import type { RuntimeStatus } from "../runtime/types.js";

/**
 * Normalized failure signature identifying the category and class of failure.
 */
export interface FailureSignature {
  actionName: string;
  status: RuntimeStatus;
  errorName?: string;
  normalizedMessage?: string;
}

/**
 * Options configuring the failure-preserving shrinking engine.
 */
export interface ShrinkOptions {
  /**
   * Maximum candidate execution attempts allowed per failure.
   * Default: 30
   */
  maxAttempts?: number;

  /**
   * Per-attempt execution timeout budget in milliseconds.
   * Default: inherited from runtime options (e.g. 20ms)
   */
  timeoutMs?: number;
}

/**
 * Metrics tracking size reduction and execution attempts.
 */
export interface ShrinkStatistics {
  attempts: number;
  accepted: number;
  originalSize: number;
  minimalSize: number;
  reductionPercent: number;
}

/**
 * Final result of shrinking a runtime failure.
 */
export interface ShrinkResult {
  actionName: string;
  originalPayload: unknown;
  minimalPayload: unknown;
  signature: string;
  statistics: ShrinkStatistics;
  verified: boolean;
  attempts?: number;
  reductionRatio?: number;
}
