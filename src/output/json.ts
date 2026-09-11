import type { AuditResult } from "../core/types.js";
import {
  OUTPUT_SCHEMA_VERSION,
  TOOL_NAME,
  TOOL_VERSION,
  mapFindingToRule,
} from "./schema.js";
import { serializeSpecialPayload } from "./payload.js";
import type {
  JsonAuditReport,
  JsonFinding,
  JsonFindingRuntime,
  JsonFindingShrink,
  JsonActionSummary,
} from "./types.js";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function formatJson(
  result: AuditResult,
  options: { pretty?: boolean } = { pretty: true }
): string {
  const verifiedFindings = result.findings.filter(
    (f) => f.severity === "error"
  ).length;

  const jsonFindings: JsonFinding[] = result.findings.map((f, index) => {
    const rule = mapFindingToRule(f.type);
    const file = normalizePath(f.location?.file ?? result.target);
    const location = {
      line: f.location?.line ?? 1,
      column: f.location?.column ?? 1,
    };

    let runtime: JsonFindingRuntime | undefined;
    if (
      f.executionMs !== undefined ||
      f.wallTimeMs !== undefined ||
      f.timeoutMs !== undefined ||
      f.failureSignature !== undefined ||
      f.errorName !== undefined ||
      f.payload !== undefined
    ) {
      runtime = {
        failureSignature: f.failureSignature ?? f.errorName,
        executionMs: f.executionMs,
        wallTimeMs: f.wallTimeMs,
        timeoutMs: f.timeoutMs,
        payload:
          f.payload !== undefined
            ? serializeSpecialPayload(f.payload)
            : undefined,
      };
    }

    let shrink: JsonFindingShrink | undefined;
    if (
      f.shrinkAttempts !== undefined ||
      f.shrinkReduction !== undefined ||
      f.minimalReproducerVerified !== undefined ||
      f.minimizedPayload !== undefined
    ) {
      shrink = {
        attempts: f.shrinkAttempts,
        reductionRatio: f.shrinkReduction,
        minimalReproducerVerified: f.minimalReproducerVerified,
        minimizedPayload:
          f.minimizedPayload !== undefined
            ? serializeSpecialPayload(f.minimizedPayload)
            : undefined,
      };
    }

    const finding: JsonFinding = {
      id: `${rule.id}-${index + 1}`,
      ruleId: rule.id,
      ruleName: rule.name,
      type: f.type,
      severity: f.severity,
      message: f.message,
      file,
      location,
    };

    if (f.action) {
      finding.actionName = f.action;
    }
    if (f.fuzzTarget) {
      finding.fuzzTarget = f.fuzzTarget;
    }
    if (f.strategy) {
      finding.strategy = f.strategy;
    }
    if (f.invariant) {
      finding.invariant = f.invariant;
    }
    if (f.parameter) {
      finding.parameter = f.parameter;
    }
    if (f.executionMode) {
      finding.executionMode = f.executionMode;
    }
    if (f.verifiedPrefix) {
      finding.verifiedPrefix = f.verifiedPrefix;
    }
    if (f.stoppedAt) {
      finding.stoppedAt = f.stoppedAt;
    }
    if (runtime) {
      finding.runtime = runtime;
    }
    if (shrink) {
      finding.shrink = shrink;
    }
    if (f.trace && f.trace.length > 0) {
      finding.trace = f.trace;
    }

    return finding;
  });

  const actions: JsonActionSummary[] = result.actions.map((a) => ({
    name: a.name,
    file: normalizePath(a.location.file),
    line: a.location.line,
    column: a.location.column,
    executionCompatibility: a.executionCompatibility,
    executionMode: a.executionMode,
    stoppedAt: a.stoppedAt,
  }));

  const filesAnalyzed = (
    result.filesAnalyzed && result.filesAnalyzed.length > 0
      ? result.filesAnalyzed
      : [result.target]
  ).map(normalizePath);

  const report: JsonAuditReport = {
    version: OUTPUT_SCHEMA_VERSION,
    tool: {
      name: TOOL_NAME.toLowerCase(),
      version: TOOL_VERSION,
    },
    target: normalizePath(result.target),
    summary: {
      filesScanned: result.statistics.filesScanned,
      filesAnalyzed: result.statistics.filesAnalyzed ?? filesAnalyzed.length,
      filesSkipped: result.statistics.filesSkipped ?? 0,
      boundariesFound: result.statistics.boundariesFound,
      serverActionsFound: result.statistics.actionsFound,
      verifiedFindings,
      runtimeFailures: result.statistics.failedExecutions ?? 0,
      taintViolations: result.statistics.taintViolations,
      analysisErrors: result.analysisErrors?.length ?? 0,
      shrinkSuccessCount: result.statistics.verifiedReproCount ?? 0,
    },
    statistics: result.statistics,
    files: filesAnalyzed,
    findings: jsonFindings,
    actions,
    errors: result.analysisErrors ?? [],
  };

  return JSON.stringify(report, null, options.pretty ? 2 : undefined);
}
