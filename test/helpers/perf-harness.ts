import { AuditEngine, type AuditResult, type AuditOptions } from "../../dist/index.js";

export interface PerfMetrics {
  target: string;
  filesScanned: number;
  filesAnalyzed: number;
  boundaries: number;
  actions: number;
  fuzzTargets: number;
  payloads: number;
  executions: number;
  failedExecutions: number;
  timeoutExecutions: number;
  unsupportedExecutions: number;
  shrinkAttempts: number;
  verifiedReproCount: number;
  wallTimeMs: number;
}

/**
 * Executes a deterministic audit with high-precision wall-clock timing.
 */
export async function measureAudit(
  targetPath: string,
  options: AuditOptions = {}
): Promise<{ result: AuditResult; metrics: PerfMetrics }> {
  const engine = new AuditEngine({
    silent: true,
    ...options,
  });

  const t0 = performance.now();
  const result = await engine.run(targetPath);
  const wallTimeMs = Math.round(performance.now() - t0);

  const stats = result.statistics;
  const metrics: PerfMetrics = {
    target: targetPath,
    filesScanned: stats.filesScanned,
    filesAnalyzed: stats.filesAnalyzed ?? 0,
    boundaries: stats.boundariesFound,
    actions: stats.actionsFound,
    fuzzTargets: stats.fuzzTargetsDiscovered ?? 0,
    payloads: stats.payloadsGenerated,
    executions: stats.executions,
    failedExecutions: stats.failedExecutions ?? 0,
    timeoutExecutions: stats.timeoutExecutions ?? 0,
    unsupportedExecutions: stats.unsupportedExecutions ?? 0,
    shrinkAttempts: stats.shrinkAttempts ?? 0,
    verifiedReproCount: stats.verifiedReproCount ?? 0,
    wallTimeMs,
  };

  return { result, metrics };
}