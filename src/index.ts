import fs from "node:fs";
import path from "node:path";
import type { AuditOptions, AuditResult } from "./core/types.js";
import { TargetNotFoundError, ParserError } from "./core/errors.js";
import { terminal } from "./reporter/terminal.js";
import { parseModule } from "./parser/index.js";
import { analyzeTaint } from "./taint/index.js";
import {
  synthesizePayloads,
  synthesizeBoundaryPayloads,
  extractFuzzTargets,
  type PayloadSynthesisResult,
  type GeneratedPayload,
} from "./payload/index.js";
import {
  verifyRuntimeActions,
  extractCandidateFunction,
  type RuntimeVerificationSummary,
} from "./runtime/index.js";
import { shrinkFailurePayload, type ShrinkResult } from "./shrinker/index.js";
import {
  discoverFiles,
  deriveFileSeed,
  toPosixPath,
} from "./discovery/index.js";
import {
  buildModuleGraph,
  analyzeInterproceduralDataflow,
} from "./dataflow/index.js";
import {
  analyzePropBoundaries,
  analyzeReturnBoundaries,
} from "./boundary/index.js";

export * from "./core/types.js";
export * from "./core/errors.js";
export * from "./reporter/index.js";
export * from "./parser/index.js";
export * from "./taint/index.js";
export * from "./payload/index.js";
export * from "./runtime/index.js";
export * from "./shrinker/index.js";
export * from "./discovery/index.js";
export * from "./output/index.js";
export * from "./dataflow/index.js";
export * from "./boundary/index.js";

export class AuditEngine {
  constructor(private readonly options: AuditOptions = {}) {}

  /**
   * Runs the audit pipeline against a specified target directory or file.
   * Dispatches to single-file or directory audit while maintaining full pipeline integrity.
   */
  async run(target: string): Promise<AuditResult> {
    const resolvedPath = path.resolve(process.cwd(), target);

    if (!fs.existsSync(resolvedPath)) {
      throw new TargetNotFoundError(target);
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      return this.auditDirectory(resolvedPath, target);
    }

    return this.auditSingleFile(resolvedPath, target);
  }

  /**
   * Audits an individual source file through the complete SIS pipeline.
   */
  private async auditSingleFile(
    resolvedPath: string,
    target: string
  ): Promise<AuditResult> {
    if (!this.options.silent) {
      terminal.discovery(target, false);
    }

    const source = await fs.promises.readFile(resolvedPath, "utf8");
    const parsed = await parseModule(source, { filename: target });

    if (!this.options.silent) {
      terminal.astAnalysis(parsed.boundaries, parsed.actions);
    }

    // Phase 3: Static Taint Analysis
    const isClientBoundary = parsed.boundaries.some((b) => b.type === "client");
    const taintResult = analyzeTaint(
      parsed.ast,
      { file: target, isClientBoundary },
      parsed.locator
    );

    if (!this.options.silent) {
      terminal.taintAnalysis(taintResult.findings, taintResult.taintSourcesFound);
    }

    // Phase 4 & 11: Boundary-Aware & Property-Based Payload Synthesis
    let payloadResult: PayloadSynthesisResult | undefined;
    let runtimeResult: RuntimeVerificationSummary | undefined;
    const runtimeFindings: import("./core/types.js").Finding[] = [];
    const shrinkResults: ShrinkResult[] = [];
    let boundaryDirectedCount = 0;
    let genericFallbackCount = 0;
    const strategiesUsedSet = new Set<string>();

    const fuzzTargets = extractFuzzTargets(parsed, parsed.actions);

    if (parsed.actions.length > 0) {
      const actionPayloadsMap = new Map<string, GeneratedPayload[]>();
      const allPayloads: GeneratedPayload[] = [];

      for (const action of parsed.actions) {
        const argTarget = fuzzTargets.find(
          (t) => t.actionName === action.name && t.kind === "server-action-argument"
        );

        if (argTarget) {
          const boundaryRes = synthesizeBoundaryPayloads(argTarget, {
            runs: this.options.runs,
            seed: this.options.seed,
          });
          actionPayloadsMap.set(action.name, boundaryRes.payloads);
          allPayloads.push(...boundaryRes.payloads);
          boundaryDirectedCount += boundaryRes.boundaryDirectedCount;
          genericFallbackCount += boundaryRes.genericFallbackCount;
          for (const s of boundaryRes.strategiesUsed) strategiesUsedSet.add(s);
        } else {
          const generic = synthesizePayloads({
            runs: this.options.runs,
            seed: this.options.seed,
          });
          actionPayloadsMap.set(action.name, generic.payloads);
          allPayloads.push(...generic.payloads);
          genericFallbackCount += generic.generatedRuns;
          strategiesUsedSet.add("generic-fallback");
        }
      }

      payloadResult = {
        payloads: allPayloads,
        requestedRuns: this.options.runs ?? 100,
        generatedRuns: allPayloads.length,
        categories: {
          nullish: allPayloads.filter((p) => p.category === "nullish").length,
          empty: allPayloads.filter((p) => p.category === "empty").length,
          "numeric-extreme": allPayloads.filter((p) => p.category === "numeric-extreme").length,
          "prototype-sensitive": allPayloads.filter((p) => p.category === "prototype-sensitive").length,
          "deep-nested": allPayloads.filter((p) => p.category === "deep-nested").length,
          "serialization-trap": allPayloads.filter((p) => p.category === "serialization-trap").length,
          "primitive-mismatch": allPayloads.filter((p) => p.category === "primitive-mismatch").length,
        },
        seed: this.options.seed,
      };

      if (!this.options.silent) {
        terminal.payloadSynthesis(payloadResult);
      }

      // Phase 5: Isolated Runtime Verification
      runtimeResult = await verifyRuntimeActions(
        source,
        parsed,
        actionPayloadsMap,
        {
          timeoutMs: this.options.timeoutMs,
        }
      );

      // Map genuine candidate failures/timeouts to findings
      for (const exec of runtimeResult.executions) {
        if (exec.status === "failed") {
          runtimeFindings.push({
            type: "runtime-exception",
            severity: "error",
            message: `${exec.actionName} threw ${exec.error?.name ?? "Error"}: ${exec.error?.message ?? "Execution failed"}`,
            location: exec.location,
            action: exec.actionName,
            payload: exec.payloadValue,
            payloadId: exec.payloadId,
            category: exec.category,
            payloadDescription: exec.payloadDescription,
            executionMs: exec.executionMs,
            wallTimeMs: exec.wallTimeMs,
            timeoutMs: exec.timeoutMs,
            durationMs: exec.executionMs,
            errorName: exec.error?.name,
            fuzzTarget: exec.fuzzTarget,
            strategy: exec.strategy,
            invariant: exec.invariant,
            parameter: exec.parameter,
          });
        } else if (exec.status === "timeout") {
          runtimeFindings.push({
            type: "timeout",
            severity: "error",
            message: `${exec.actionName} timed out after ${exec.timeoutMs}ms execution budget`,
            location: exec.location,
            action: exec.actionName,
            payload: exec.payloadValue,
            payloadId: exec.payloadId,
            category: exec.category,
            payloadDescription: exec.payloadDescription,
            executionMs: exec.executionMs,
            wallTimeMs: exec.wallTimeMs,
            timeoutMs: exec.timeoutMs,
            durationMs: exec.executionMs,
            errorName: "TimeoutError",
            fuzzTarget: exec.fuzzTarget,
            strategy: exec.strategy,
            invariant: exec.invariant,
            parameter: exec.parameter,
          });
        }
      }

      if (!this.options.silent) {
        terminal.runtimeVerification(runtimeResult);
      }

      // Phase 6: Failure Shrinking / Minimal Reproduction Synthesis
      if (this.options.shrink !== false) {
        const failures = runtimeResult.executions.filter(
          (exec) => exec.status === "failed" || exec.status === "timeout"
        );

        if (failures.length > 0) {
          const candidateMap = new Map<string, import("./runtime/types.js").CandidateFunctionSource | null>();
          for (const action of parsed.actions) {
            candidateMap.set(
              action.name,
              extractCandidateFunction(source, parsed, action)
            );
          }

          for (const failure of failures) {
            const candidate = candidateMap.get(failure.actionName);
            if (!candidate) continue;

            const shrinkRes = await shrinkFailurePayload(candidate, failure, {
              maxAttempts: this.options.maxShrinkAttempts,
              timeoutMs: this.options.timeoutMs,
            });
            shrinkResults.push(shrinkRes);

            const finding = runtimeFindings.find(
              (f) =>
                f.action === failure.actionName &&
                f.payloadId === failure.payloadId
            );
            if (finding) {
              finding.originalPayload = shrinkRes.originalPayload;
              finding.minimizedPayload = shrinkRes.minimalPayload;
              finding.shrinkAttempts = shrinkRes.statistics.attempts;
              finding.shrinkReduction = shrinkRes.statistics.reductionPercent;
              finding.minimalReproducerVerified = shrinkRes.verified;
              finding.failureSignature = shrinkRes.signature;
            }
          }

          shrinkResults.sort(
            (a, b) =>
              b.statistics.attempts - a.statistics.attempts ||
              b.statistics.reductionPercent - a.statistics.reductionPercent
          );

          if (!this.options.silent && shrinkResults.length > 0) {
            terminal.failureShrinking(shrinkResults);
          }
        }
      }
    } else {
      if (!this.options.silent) {
        terminal.divider();
      }
    }

    const allFindings = [...taintResult.findings, ...runtimeFindings];

    return {
      target: resolvedPath,
      boundaries: parsed.boundaries,
      actions: parsed.actions,
      findings: allFindings,
      payloadSynthesis: payloadResult,
      runtime: runtimeResult,
      shrinkResults: shrinkResults.length > 0 ? shrinkResults : undefined,
      statistics: {
        filesScanned: 1,
        filesAnalyzed: 1,
        filesSkipped: 0,
        analysisErrors: 0,
        boundariesFound: parsed.boundaries.length,
        actionsFound: parsed.actions.length,
        taintSourcesFound: taintResult.taintSourcesFound,
        taintViolations: taintResult.taintViolations,
        payloadsGenerated: payloadResult ? payloadResult.generatedRuns : 0,
        executions: runtimeResult ? runtimeResult.executed : 0,
        passedExecutions: runtimeResult ? runtimeResult.passed : 0,
        failedExecutions: runtimeResult ? runtimeResult.failed : 0,
        timeoutExecutions: runtimeResult ? runtimeResult.timedOut : 0,
        unsupportedExecutions: runtimeResult ? runtimeResult.unsupported : 0,
        shrinkAttempts: shrinkResults.reduce((acc, s) => acc + s.statistics.attempts, 0),
        verifiedReproCount: shrinkResults.filter((s) => s.verified).length,
        fuzzTargetsDiscovered: fuzzTargets.length,
        fuzzStrategiesApplied: strategiesUsedSet.size,
        boundaryDirectedPayloads: boundaryDirectedCount,
        genericFallbackPayloads: genericFallbackCount,
      },
    };
  }

  /**
   * Recursively audits a directory target with per-file error isolation,
   * deterministic per-file seed derivation, and aggregated presentation.
   */
  private async auditDirectory(
    resolvedPath: string,
    target: string
  ): Promise<AuditResult> {
    const discovery = await discoverFiles(resolvedPath, {
      ignore: this.options.ignore,
    });

    const displayTarget = toPosixPath(path.relative(process.cwd(), resolvedPath)) || target;

    if (!this.options.silent) {
      terminal.discovery(displayTarget, true);
      terminal.directoryScanning(discovery.files.length);
    }

    if (discovery.files.length === 0) {
      const emptyResult: AuditResult = {
        target: resolvedPath,
        filesAnalyzed: [],
        boundaries: [],
        actions: [],
        findings: [],
        analysisErrors: [],
        statistics: {
          filesScanned: discovery.scannedCount,
          filesAnalyzed: 0,
          filesSkipped: discovery.skippedCount,
          analysisErrors: 0,
          boundariesFound: 0,
          actionsFound: 0,
          taintSourcesFound: 0,
          taintViolations: 0,
          payloadsGenerated: 0,
          executions: 0,
          passedExecutions: 0,
          failedExecutions: 0,
          timeoutExecutions: 0,
          unsupportedExecutions: 0,
          shrinkAttempts: 0,
          verifiedReproCount: 0,
        },
      };

      if (!this.options.silent) {
        terminal.directoryAuditSummary(emptyResult);
      }
      return emptyResult;
    }

    const allBoundaries: import("./core/types.js").Boundary[] = [];
    const allActions: import("./core/types.js").ServerAction[] = [];
    const allFindings: import("./core/types.js").Finding[] = [];
    const allShrinkResults: ShrinkResult[] = [];
    const analysisErrors: import("./core/types.js").AnalysisError[] = [];
    const filesAnalyzed: string[] = [];
    const parsedModulesMap = new Map<string, import("./parser/types.js").ParsedModule>();

    let totalTaintSources = 0;
    let totalTaintViolations = 0;
    let totalPayloadsGenerated = 0;
    let totalExecutions = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTimeout = 0;
    let totalUnsupported = 0;
    let totalShrinkAttempts = 0;
    let verifiedReproCount = 0;
    let totalFuzzTargets = 0;
    let totalBoundaryDirectedPayloads = 0;
    let totalGenericFallbackPayloads = 0;
    const allStrategiesUsedSet = new Set<string>();

    for (const file of discovery.files) {
      try {
        const source = await fs.promises.readFile(file.absolutePath, "utf8");
        const parsed = await parseModule(source, { filename: file.relativePath });

        filesAnalyzed.push(file.relativePath);
        parsedModulesMap.set(file.relativePath, parsed);
        allBoundaries.push(...parsed.boundaries);
        allActions.push(...parsed.actions);

        // Static taint analysis
        const isClientBoundary = parsed.boundaries.some((b) => b.type === "client");
        const taintResult = analyzeTaint(
          parsed.ast,
          { file: file.relativePath, isClientBoundary },
          parsed.locator
        );
        totalTaintSources += taintResult.taintSourcesFound;
        totalTaintViolations += taintResult.taintViolations;
        allFindings.push(...taintResult.findings);

        // Candidate Server Actions verification (Phase 4, 5, 11)
        if (parsed.actions.length > 0) {
          const fileSeed =
            this.options.seed !== undefined
              ? deriveFileSeed(this.options.seed, file.relativePath)
              : undefined;

          const fileFuzzTargets = extractFuzzTargets(parsed, parsed.actions);
          totalFuzzTargets += fileFuzzTargets.length;

          const actionPayloadsMap = new Map<string, GeneratedPayload[]>();
          let filePayloadsCount = 0;

          for (const action of parsed.actions) {
            const argTarget = fileFuzzTargets.find(
              (t) => t.actionName === action.name && t.kind === "server-action-argument"
            );

            if (argTarget) {
              const boundaryRes = synthesizeBoundaryPayloads(argTarget, {
                runs: this.options.runs,
                seed: fileSeed,
              });
              actionPayloadsMap.set(action.name, boundaryRes.payloads);
              filePayloadsCount += boundaryRes.payloads.length;
              totalBoundaryDirectedPayloads += boundaryRes.boundaryDirectedCount;
              totalGenericFallbackPayloads += boundaryRes.genericFallbackCount;
              for (const s of boundaryRes.strategiesUsed) allStrategiesUsedSet.add(s);
            } else {
              const generic = synthesizePayloads({
                runs: this.options.runs,
                seed: fileSeed,
              });
              actionPayloadsMap.set(action.name, generic.payloads);
              filePayloadsCount += generic.generatedRuns;
              totalGenericFallbackPayloads += generic.generatedRuns;
              allStrategiesUsedSet.add("generic-fallback");
            }
          }
          totalPayloadsGenerated += filePayloadsCount;

          const runtimeResult = await verifyRuntimeActions(
            source,
            parsed,
            actionPayloadsMap,
            {
              timeoutMs: this.options.timeoutMs,
            }
          );

          totalExecutions += runtimeResult.executed;
          totalPassed += runtimeResult.passed;
          totalFailed += runtimeResult.failed;
          totalTimeout += runtimeResult.timedOut;
          totalUnsupported += runtimeResult.unsupported;

          const fileRuntimeFindings: import("./core/types.js").Finding[] = [];
          for (const exec of runtimeResult.executions) {
            if (exec.status === "failed") {
              fileRuntimeFindings.push({
                type: "runtime-exception",
                severity: "error",
                message: `${exec.actionName} threw ${exec.error?.name ?? "Error"}: ${exec.error?.message ?? "Execution failed"}`,
                location: exec.location,
                action: exec.actionName,
                payload: exec.payloadValue,
                payloadId: exec.payloadId,
                category: exec.category,
                payloadDescription: exec.payloadDescription,
                executionMs: exec.executionMs,
                wallTimeMs: exec.wallTimeMs,
                timeoutMs: exec.timeoutMs,
                durationMs: exec.executionMs,
                errorName: exec.error?.name,
                fuzzTarget: exec.fuzzTarget,
                strategy: exec.strategy,
                invariant: exec.invariant,
                parameter: exec.parameter,
              });
            } else if (exec.status === "timeout") {
              fileRuntimeFindings.push({
                type: "timeout",
                severity: "error",
                message: `${exec.actionName} timed out after ${exec.timeoutMs}ms execution budget`,
                location: exec.location,
                action: exec.actionName,
                payload: exec.payloadValue,
                payloadId: exec.payloadId,
                category: exec.category,
                payloadDescription: exec.payloadDescription,
                executionMs: exec.executionMs,
                wallTimeMs: exec.wallTimeMs,
                timeoutMs: exec.timeoutMs,
                durationMs: exec.executionMs,
                errorName: "TimeoutError",
                fuzzTarget: exec.fuzzTarget,
                strategy: exec.strategy,
                invariant: exec.invariant,
                parameter: exec.parameter,
              });
            }
          }

          if (this.options.shrink !== false) {
            const failures = runtimeResult.executions.filter(
              (exec) => exec.status === "failed" || exec.status === "timeout"
            );

            if (failures.length > 0) {
              const candidateMap = new Map<string, import("./runtime/types.js").CandidateFunctionSource | null>();
              for (const action of parsed.actions) {
                candidateMap.set(
                  action.name,
                  extractCandidateFunction(source, parsed, action)
                );
              }

              for (const failure of failures) {
                const candidate = candidateMap.get(failure.actionName);
                if (!candidate) continue;

                const shrinkRes = await shrinkFailurePayload(candidate, failure, {
                  maxAttempts: this.options.maxShrinkAttempts,
                  timeoutMs: this.options.timeoutMs,
                });
                allShrinkResults.push(shrinkRes);
                totalShrinkAttempts += shrinkRes.statistics.attempts;
                if (shrinkRes.verified) {
                  verifiedReproCount++;
                }

                const finding = fileRuntimeFindings.find(
                  (f) =>
                    f.action === failure.actionName &&
                    f.payloadId === failure.payloadId
                );
                if (finding) {
                  finding.originalPayload = shrinkRes.originalPayload;
                  finding.minimizedPayload = shrinkRes.minimalPayload;
                  finding.shrinkAttempts = shrinkRes.statistics.attempts;
                  finding.shrinkReduction = shrinkRes.statistics.reductionPercent;
                  finding.minimalReproducerVerified = shrinkRes.verified;
                  finding.failureSignature = shrinkRes.signature;
                }
              }
            }
          }

          allFindings.push(...fileRuntimeFindings);
        }
      } catch (err: unknown) {
        // Per-file isolation: Do not abort the audit on single file failures
        if (err instanceof ParserError) {
          analysisErrors.push({
            file: file.relativePath,
            type: "parse-error",
            message: err.message,
            detail: err.detail,
          });
        } else {
          analysisErrors.push({
            file: file.relativePath,
            type: "analysis-error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    let totalPropBoundaries = 0;
    let totalVerifiedSafeProps = 0;
    let totalSerializabilityViolations = 0;
    let totalUnknownSerializability = 0;

    // Phase 9 & 10: Interprocedural Data-Flow & Next.js Boundary Analysis
    if (parsedModulesMap.size > 0) {
      const moduleGraph = buildModuleGraph(parsedModulesMap);
      const dataflowResult = analyzeInterproceduralDataflow(moduleGraph, {
        maxDepth: this.options.maxAnalysisDepth,
      });

      for (const dfFinding of dataflowResult.findings) {
        const existingIdx = allFindings.findIndex(
          (f) =>
            f.type === "taint-violation" &&
            f.location?.file === dfFinding.location?.file &&
            f.location?.line === dfFinding.location?.line
        );
        if (existingIdx >= 0) {
          allFindings[existingIdx] = dfFinding;
        } else {
          allFindings.push(dfFinding);
        }
      }

      // Phase 10: Next.js Prop & Return Boundary Analysis
      const propResult = analyzePropBoundaries(moduleGraph);
      const returnResult = analyzeReturnBoundaries(moduleGraph);

      totalPropBoundaries = propResult.edges.length;
      totalVerifiedSafeProps = propResult.verifiedSafeProps + returnResult.verifiedSafeReturns;
      totalSerializabilityViolations =
        propResult.serializabilityViolations + returnResult.returnViolations;
      totalUnknownSerializability =
        propResult.unknownSerializability + returnResult.unknownReturns;

      // Merge prop boundary findings
      for (const finding of propResult.findings) {
        const existingIdx = allFindings.findIndex(
          (f) =>
            f.location?.file === finding.location?.file &&
            f.location?.line === finding.location?.line &&
            f.type === finding.type
        );
        if (existingIdx >= 0) {
          allFindings[existingIdx] = finding;
        } else {
          allFindings.push(finding);
        }
      }

      // Merge return boundary findings
      for (const finding of returnResult.findings) {
        const existingIdx = allFindings.findIndex(
          (f) =>
            f.location?.file === finding.location?.file &&
            f.location?.line === finding.location?.line &&
            f.type === finding.type
        );
        if (existingIdx >= 0) {
          allFindings[existingIdx] = finding;
        } else {
          allFindings.push(finding);
        }
      }

      totalTaintViolations = allFindings.filter((f) => f.type === "taint-violation").length;
      totalTaintSources = Math.max(totalTaintSources, totalTaintViolations);
    }

    const aggregatedResult: AuditResult = {
      target: resolvedPath,
      filesAnalyzed,
      boundaries: allBoundaries,
      actions: allActions,
      findings: allFindings,
      analysisErrors: analysisErrors.length > 0 ? analysisErrors : undefined,
      shrinkResults: allShrinkResults.length > 0 ? allShrinkResults : undefined,
      statistics: {
        filesScanned: discovery.scannedCount,
        filesAnalyzed: filesAnalyzed.length,
        filesSkipped: discovery.skippedCount,
        analysisErrors: analysisErrors.length,
        boundariesFound: allBoundaries.length,
        actionsFound: allActions.length,
        taintSourcesFound: totalTaintSources,
        taintViolations: totalTaintViolations,
        propBoundariesFound: totalPropBoundaries,
        verifiedSafeProps: totalVerifiedSafeProps,
        serializabilityViolations: totalSerializabilityViolations,
        unknownSerializability: totalUnknownSerializability,
        payloadsGenerated: totalPayloadsGenerated,
        executions: totalExecutions,
        passedExecutions: totalPassed,
        failedExecutions: totalFailed,
        timeoutExecutions: totalTimeout,
        unsupportedExecutions: totalUnsupported,
        shrinkAttempts: totalShrinkAttempts,
        verifiedReproCount,
        fuzzTargetsDiscovered: totalFuzzTargets,
        fuzzStrategiesApplied: allStrategiesUsedSet.size,
        boundaryDirectedPayloads: totalBoundaryDirectedPayloads,
        genericFallbackPayloads: totalGenericFallbackPayloads,
      },
    };

    if (!this.options.silent) {
      terminal.directoryAuditSummary(aggregatedResult);
    }

    return aggregatedResult;
  }
}

/**
 * Convenient standalone audit function.
 */
export async function audit(
  target: string,
  options: AuditOptions = {}
): Promise<AuditResult> {
  const engine = new AuditEngine(options);
  return engine.run(target);
}
