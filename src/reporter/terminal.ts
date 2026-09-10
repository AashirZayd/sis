import chalk from "chalk";
import type { Boundary, Finding, ServerAction } from "../core/types.js";
import type { ParserError } from "../core/errors.js";
import { formatPayloadValue } from "../payload/display.js";

/**
 * Restrained semantic symbol palette.
 * Inspired by modern compiler diagnostics and developer tooling.
 */
export const symbols = {
  discovery: chalk.cyan("◇"),
  analysis: chalk.cyan("◆"),
  synthesis: chalk.cyan("⟳"),
  execution: chalk.yellow("⚡"),
  shrinking: chalk.magenta("✂"),
  success: chalk.green("✓"),
  failure: chalk.red("✖"),
  warning: chalk.yellow("⚠"),
  unsupported: chalk.dim("⊘"),
  bullet: chalk.dim("•"),
  pointer: chalk.dim("→"),
} as const;

export interface TerminalPresenter {
  header(): void;
  auditInit(target: string): void;
  discovery(target: string, isDirectory?: boolean): void;
  directoryScanning(count: number): void;
  astAnalysis(boundaries: Boundary[], actions: ServerAction[]): void;
  taintAnalysis(findings: Finding[], taintSourcesFound: number): void;
  payloadSynthesis(result: import("../payload/types.js").PayloadSynthesisResult): void;
  runtimeVerification(summary: import("../runtime/types.js").RuntimeVerificationSummary): void;
  failureShrinking(results: import("../shrinker/types.js").ShrinkResult[]): void;
  directoryAuditSummary(result: import("../core/types.js").AuditResult): void;
  fileAnalysisError(err: import("../core/types.js").AnalysisError): void;
  targetNotFound(target: string): void;
  parserError(err: ParserError, debug?: boolean): void;
  error(title: string, detail?: string): void;
  warning(title: string, detail?: string): void;
  divider(): void;
}

export class DefaultTerminalPresenter implements TerminalPresenter {
  /**
   * Renders the minimal, high-contrast SIS header.
   */
  header(): void {
    console.log();
    console.log(
      `${chalk.bold("SIS")}  ${chalk.dim("Speculative Invariant Synthesis")}`
    );
    console.log(
      chalk.dim("Autonomous runtime verification for Next.js boundaries")
    );
    console.log();
  }

  /**
   * Renders the initial target discovery block.
   */
  discovery(target: string, isDirectory = false): void {
    this.header();
    console.log(`${symbols.discovery} ${chalk.bold("DISCOVERY")}`);
    console.log(`  Target: ${chalk.cyan(target)}${isDirectory ? chalk.dim(" (Directory)") : ""}`);
    console.log();
  }

  /**
   * Renders the directory scanning progress indicator.
   */
  directoryScanning(count: number): void {
    console.log(chalk.dim(`Scanning ${count} source files...`));
    console.log();
  }

  /**
   * Legacy initialization state fallback.
   */
  auditInit(target: string): void {
    this.header();
    console.log(`${symbols.discovery} ${chalk.bold("AUDIT")}`);
    console.log(`  Target: ${chalk.cyan(target)}`);
    console.log();
    console.log(`  ${chalk.dim("Analysis engine initialized.")}`);
    console.log(
      `  ${chalk.dim("Static and dynamic verification modules are ready.")}`
    );
    console.log();
  }

  /**
   * Renders real Phase 2 AST analysis results.
   */
  astAnalysis(boundaries: Boundary[], actions: ServerAction[]): void {
    console.log(`${symbols.analysis} ${chalk.bold("AST ANALYSIS")}`);

    const clientBoundaries = boundaries.filter((b) => b.type === "client");
    const serverBoundaries = boundaries.filter((b) => b.type === "server");

    if (boundaries.length === 0) {
      console.log(`  ${symbols.bullet} 0 boundaries discovered`);
    } else {
      if (serverBoundaries.length > 0) {
        const plural = serverBoundaries.length === 1 ? "boundary" : "boundaries";
        console.log(
          `  ${symbols.success} ${serverBoundaries.length} server ${plural}`
        );
      }
      if (clientBoundaries.length > 0) {
        const plural = clientBoundaries.length === 1 ? "boundary" : "boundaries";
        console.log(
          `  ${symbols.success} ${clientBoundaries.length} client ${plural}`
        );
      }
    }

    if (actions.length === 0) {
      console.log(`  ${symbols.bullet} 0 candidate Server Actions`);
    } else {
      const plural = actions.length === 1 ? "Server Action" : "Server Actions";
      console.log(`  ${symbols.success} ${actions.length} candidate ${plural}`);
      console.log();
      for (const action of actions) {
        console.log(`    ${chalk.bold(action.name)}`);
        console.log(
          `    ${chalk.dim(`${action.location.file}:${action.location.line}`)}`
        );
      }
    }

    console.log();
  }

  /**
   * Renders Phase 3 static taint analysis results.
   */
  taintAnalysis(findings: Finding[], taintSourcesFound: number): void {
    console.log(`${symbols.analysis} ${chalk.bold("TAINT ANALYSIS")}`);

    const violations = findings.filter((f) => f.type === "taint-violation");

    if (violations.length === 0) {
      console.log(`  ${symbols.success} No high-confidence secret flows detected`);
    } else {
      const plural =
        violations.length === 1
          ? "sensitive value reaches client boundary"
          : "sensitive values reach client boundary";

      console.log(
        `  ${symbols.failure} ${chalk.red.bold(`${violations.length} ${plural}`)}`
      );
      console.log();

      for (const finding of violations) {
        if (finding.trace && finding.trace.length > 0) {
          console.log(`    ${chalk.red(finding.trace[0])}`);
          for (let i = 1; i < finding.trace.length; i++) {
            console.log(
              `      ${symbols.pointer} ${chalk.cyan(finding.trace[i])}`
            );
          }
          console.log();
        }

        if (finding.location) {
          console.log(
            `  ${chalk.dim(
              `${finding.location.file}:${finding.location.line}`
            )}`
          );
          console.log();
        }
      }
    }

    console.log();
  }

  /**
   * Renders Phase 4 property-based payload synthesis results.
   */
  payloadSynthesis(
    result: import("../payload/types.js").PayloadSynthesisResult
  ): void {
    console.log(`${symbols.analysis} ${chalk.bold("PAYLOAD SYNTHESIS")}`);
    console.log(
      `  ${symbols.synthesis} ${chalk.dim("Generating adversarial payloads")}`
    );
    console.log(
      `  ${symbols.success} ${chalk.bold(result.generatedRuns)} payloads generated`
    );
    if (result.seed !== undefined) {
      console.log(`  ${chalk.dim(`Seed: ${result.seed}`)}`);
    }
    console.log();

    const maxCatLen = Math.max(
      ...Object.keys(result.categories).map((k) => k.length)
    );
    for (const [category, count] of Object.entries(result.categories)) {
      const paddedCat = category.padEnd(maxCatLen + 4);
      console.log(`    ${chalk.dim(paddedCat)} ${count}`);
    }

    console.log();
    this.divider();
  }

  /**
   * Renders Phase 5 isolated runtime verification results.
   */
  runtimeVerification(
    summary: import("../runtime/types.js").RuntimeVerificationSummary
  ): void {
    console.log(`${symbols.analysis} ${chalk.bold("RUNTIME VERIFICATION")}`);
    console.log();
    console.log(`  ${chalk.dim(`Execution budget: ${summary.timeoutMs}ms per payload`)}`);
    console.log(`  Executed ${summary.executed} transferable payloads`);
    console.log(`  Unsupported ${summary.unsupported}`);
    console.log(`  Passed ${summary.passed}`);
    console.log(`  Failed ${summary.failed + summary.timedOut}`);
    console.log();

    const failures = summary.executions.filter(
      (e) => e.status === "failed" || e.status === "timeout"
    );

    if (failures.length === 0) {
      console.log(`  ${symbols.success} No runtime failures detected`);
    } else {
      for (const fail of failures) {
        console.log(`  ${symbols.failure} ${chalk.bold(fail.actionName)}`);
        console.log(`    Payload #${fail.payloadId}`);
        if (fail.parameter) {
          console.log(`    Parameter: ${chalk.cyan(fail.parameter)}`);
        }
        if (fail.strategy || fail.invariant) {
          const genParts = [];
          if (fail.strategy) genParts.push(`strategy: ${fail.strategy}`);
          if (fail.invariant) genParts.push(`invariant: ${fail.invariant}`);
          console.log(`    Generated by: ${chalk.magenta(genParts.join(", "))}`);
        }
        console.log(`    Category: ${chalk.cyan(fail.category)}`);
        console.log(`    Input: ${chalk.white(formatPayloadValue(fail.payloadValue))}`);
        console.log();
        if (fail.error) {
          console.log(
            `    ${chalk.red.bold(`${fail.error.name}: ${fail.error.message}`)}`
          );
        }
        if (fail.location) {
          console.log(
            `    ${chalk.dim(`${fail.location.file}:${fail.location.line}`)}`
          );
        }
        console.log();
        if (fail.status === "timeout") {
          console.log(`    ${chalk.dim(`Execution budget: ${fail.timeoutMs}ms`)}`);
          console.log(`    ${chalk.dim(`Wall time: ${fail.wallTimeMs}ms`)}`);
        } else {
          console.log(
            `    ${chalk.dim(`Execution: ${fail.executionMs}ms / ${fail.timeoutMs}ms budget`)}`
          );
          console.log(`    ${chalk.dim(`Wall time: ${fail.wallTimeMs}ms`)}`);
        }
        console.log();
      }
    }

    console.log();
    this.divider();
  }

  /**
   * Renders Phase 6 failure shrinking results.
   */
  failureShrinking(
    results: import("../shrinker/types.js").ShrinkResult[]
  ): void {
    if (results.length === 0) return;

    console.log(`${symbols.analysis} ${chalk.bold("FAILURE SHRINKING")}`);
    console.log();

    for (const res of results) {
      console.log(`  ${symbols.failure} ${chalk.bold(res.actionName)}`);
      console.log(
        `    Original: ${chalk.white(formatPayloadValue(res.originalPayload))}`
      );
      console.log(
        `    Minimal reproducer: ${chalk.cyan(formatPayloadValue(res.minimalPayload))}`
      );
      console.log(`    Attempts: ${res.statistics.attempts}`);
      console.log(`    Reduction: ${res.statistics.reductionPercent}%`);
      const verificationStatus = res.verified
        ? `${symbols.success} failure preserved`
        : `${symbols.failure} verification failed`;
      console.log(`    Verification: ${verificationStatus}`);
      console.log();
    }

    this.divider();
  }

  /**
   * Renders non-fatal per-file analysis error.
   */
  fileAnalysisError(err: import("../core/types.js").AnalysisError): void {
    console.log(`  ${symbols.warning} ${chalk.yellow(err.file)}: ${err.message}`);
  }

  /**
   * Renders aggregated directory audit summary.
   */
  directoryAuditSummary(result: import("../core/types.js").AuditResult): void {
    const stats = result.statistics;
    const serverBoundaries = result.boundaries.filter((b) => b.type === "server").length;
    const clientBoundaries = result.boundaries.filter((b) => b.type === "client").length;
    const actions = result.actions.length;

    console.log(`${symbols.analysis} ${chalk.bold("DISCOVERY")}`);
    console.log(`  ${symbols.success} ${serverBoundaries} server ${serverBoundaries === 1 ? "boundary" : "boundaries"}`);
    if (clientBoundaries > 0) {
      console.log(`  ${symbols.success} ${clientBoundaries} client ${clientBoundaries === 1 ? "boundary" : "boundaries"}`);
    }
    console.log(`  ${symbols.success} ${actions} candidate ${actions === 1 ? "Server Action" : "Server Actions"}`);
    console.log();

    console.log(`${symbols.analysis} ${chalk.bold("TAINT ANALYSIS")}`);
    if (stats.taintViolations === 0) {
      console.log(`  ${symbols.success} No high-confidence secret flows detected`);
    } else {
      const plural = stats.taintViolations === 1 ? "secret flow" : "secret flows";
      console.log(`  ${symbols.failure} ${chalk.red.bold(`${stats.taintViolations} high-confidence ${plural}`)}`);
      console.log();

      const taintFindings = result.findings.filter((f) => f.type === "taint-violation");
      for (const finding of taintFindings) {
        if (finding.trace && finding.trace.length > 0) {
          console.log(`    ${chalk.cyan(finding.trace[0])}`);
          for (let i = 1; i < finding.trace.length; i++) {
            console.log(`      ${symbols.pointer} ${chalk.white(finding.trace[i])}`);
          }
        } else {
          console.log(`    ${chalk.white(finding.message)}`);
        }
        if (finding.location) {
          console.log(`    ${chalk.dim(`${finding.location.file}:${finding.location.line}`)}`);
        }
        console.log();
      }
    }
    console.log();

    const serializationFindings = result.findings.filter(
      (f) => f.type === "serialization-violation"
    );
    if (
      serializationFindings.length > 0 ||
      (stats.propBoundariesFound !== undefined && stats.propBoundariesFound > 0)
    ) {
      console.log(`${symbols.analysis} ${chalk.bold("REACT FLIGHT SERIALIZABILITY")}`);
      if (stats.verifiedSafeProps !== undefined && stats.verifiedSafeProps > 0) {
        console.log(`  ${symbols.success} ${stats.verifiedSafeProps.toLocaleString()} boundary props verified safe`);
      }
      if (stats.serializabilityViolations && stats.serializabilityViolations > 0) {
        console.log(
          `  ${symbols.failure} ${chalk.red.bold(`${stats.serializabilityViolations.toLocaleString()} serialization violations`)}`
        );
      }
      if (stats.unknownSerializability && stats.unknownSerializability > 0) {
        console.log(
          `  ${symbols.warning} ${stats.unknownSerializability.toLocaleString()} unknown / dynamic props`
        );
      }
      console.log();

      if (serializationFindings.length > 0) {
        for (const finding of serializationFindings) {
          console.log(`  ${symbols.failure} ${chalk.red.bold(finding.message)}`);
          if (finding.location) {
            console.log(`    ${chalk.dim(`${finding.location.file}:${finding.location.line}`)}`);
          }
          console.log();
        }
      }
    }

    if (actions > 0) {
      if (stats.fuzzTargetsDiscovered !== undefined && stats.fuzzTargetsDiscovered > 0) {
        console.log(`${symbols.analysis} ${chalk.bold("SPECULATIVE FUZZING")}`);
        console.log(`  ${symbols.discovery} ${stats.fuzzTargetsDiscovered} boundary targets discovered`);
        console.log(`  ${symbols.synthesis} ${stats.fuzzStrategiesApplied ?? 0} fuzz strategies applied`);
        console.log(`  ${symbols.success} ${stats.boundaryDirectedPayloads ?? 0} boundary-directed payloads`);
        if (stats.genericFallbackPayloads && stats.genericFallbackPayloads > 0) {
          console.log(`  ${chalk.dim(`${stats.genericFallbackPayloads} generic fallback payloads`)}`);
        }
        console.log();
      }

      console.log(`${symbols.analysis} ${chalk.bold("PAYLOAD SYNTHESIS")}`);
      console.log(`  ${symbols.success} ${stats.payloadsGenerated.toLocaleString()} adversarial payloads`);
      console.log();

      console.log(`${symbols.analysis} ${chalk.bold("RUNTIME VERIFICATION")}`);
      const passed = stats.passedExecutions ?? (result.runtime ? result.runtime.passed : 0);
      const failed = (stats.failedExecutions ?? 0) + (stats.timeoutExecutions ?? 0);
      const unsupported = stats.unsupportedExecutions ?? (result.runtime ? result.runtime.unsupported : 0);
      console.log(`  ${symbols.success} ${passed.toLocaleString()} passed`);
      if (failed > 0) {
        console.log(`  ${symbols.failure} ${failed.toLocaleString()} failed`);
      }
      if (unsupported > 0) {
        console.log(`  ${symbols.unsupported} ${unsupported.toLocaleString()} unsupported`);
      }
      console.log();

      // If there are failures, list them with source location
      const runtimeFailures = result.findings.filter(
        (f) => f.type === "runtime-exception" || f.type === "timeout"
      );
      if (runtimeFailures.length > 0) {
        for (const fail of runtimeFailures) {
          console.log(`  ${symbols.failure} ${chalk.bold(fail.action ?? "action")}`);
          if (fail.payloadId) {
            console.log(`    Payload #${fail.payloadId}`);
          }
          if (fail.parameter) {
            console.log(`    Parameter: ${chalk.cyan(fail.parameter)}`);
          }
          if (fail.strategy || fail.invariant) {
            const genParts = [];
            if (fail.strategy) genParts.push(`strategy: ${fail.strategy}`);
            if (fail.invariant) genParts.push(`invariant: ${fail.invariant}`);
            console.log(`    Generated by: ${chalk.magenta(genParts.join(", "))}`);
          }
          if (fail.category) {
            console.log(`    Category: ${chalk.cyan(fail.category)}`);
          }
          console.log(`    Input: ${chalk.white(formatPayloadValue(fail.payload))}`);
          console.log(`    ${chalk.red.bold(fail.message)}`);
          if (fail.location) {
            console.log(`    ${chalk.dim(`${fail.location.file}:${fail.location.line}`)}`);
          }
          console.log();
        }
      }

      if (result.shrinkResults && result.shrinkResults.length > 0) {
        console.log(`${symbols.analysis} ${chalk.bold("FAILURE SHRINKING")}`);
        const count = result.shrinkResults.length;
        console.log(`  ${symbols.success} ${count} ${count === 1 ? "failure" : "failures"} reduced`);
        console.log();

        for (const res of result.shrinkResults) {
          console.log(`  ${symbols.failure} ${chalk.bold(res.actionName)}`);
          console.log(`    Original: ${chalk.white(formatPayloadValue(res.originalPayload))}`);
          console.log(`    Minimal reproducer: ${chalk.cyan(formatPayloadValue(res.minimalPayload))}`);
          console.log(`    Attempts: ${res.statistics.attempts}`);
          console.log(`    Reduction: ${res.statistics.reductionPercent}%`);
          const verificationStatus = res.verified
            ? `${symbols.success} failure preserved`
            : `${symbols.failure} verification failed`;
          console.log(`    Verification: ${verificationStatus}`);
          console.log();
        }
      }
    } else {
      console.log(`${symbols.analysis} ${chalk.bold("RUNTIME VERIFICATION")}`);
      console.log(`  ${chalk.dim("No candidate actions to execute.")}`);
      console.log();
    }

    if (result.analysisErrors && result.analysisErrors.length > 0) {
      for (const err of result.analysisErrors) {
        console.log(`  ${symbols.warning} ${chalk.yellow(err.file)}: ${err.message}`);
      }
      console.log();
    }

    this.divider();
    console.log(chalk.bold("AUDIT COMPLETE"));
    console.log(`  Files analyzed:        ${stats.filesAnalyzed ?? stats.filesScanned}`);
    console.log(`  Server boundaries:     ${serverBoundaries}`);
    console.log(`  Candidate actions:     ${actions}`);
    if (stats.propBoundariesFound !== undefined && stats.propBoundariesFound > 0) {
      console.log(`  Prop boundaries:       ${stats.propBoundariesFound}`);
    }
    if (stats.serializabilityViolations !== undefined && stats.serializabilityViolations > 0) {
      console.log(`  Serializability leaks: ${stats.serializabilityViolations}`);
    }
    console.log(`  Runtime failures:      ${(stats.failedExecutions ?? 0) + (stats.timeoutExecutions ?? 0)}`);
    console.log(`  Taint violations:      ${stats.taintViolations}`);
    if (stats.analysisErrors && stats.analysisErrors > 0) {
      console.log(`  Analysis errors:       ${stats.analysisErrors}`);
    }
    console.log();

    const totalFindings = result.findings.length;
    if (totalFindings > 0) {
      const plural = totalFindings === 1 ? "verified finding" : "verified findings";
      console.log(`${symbols.failure} ${chalk.red.bold(`SIS found ${totalFindings} ${plural}`)}`);
    } else {
      console.log(`${symbols.success} ${chalk.green.bold("SIS found 0 verified findings")}`);
    }
    this.divider();
  }

  /**
   * Renders target-not-found diagnostic.
   */
  targetNotFound(target: string): void {
    console.log();
    console.log(`${symbols.failure} ${chalk.red.bold("Audit target does not exist")}`);
    console.log();
    console.log(`  ${chalk.dim(target)}`);
    console.log();
  }

  /**
   * Renders a clean compiler-style parser error.
   */
  parserError(err: ParserError, debug = false): void {
    console.log();
    console.log(`${symbols.failure} ${chalk.red.bold("Failed to parse file")}`);
    console.log();
    const loc = err.line ? `${err.file}:${err.line}${err.column ? `:${err.column}` : ""}` : err.file;
    console.log(`  ${chalk.cyan(loc)}`);
    console.log(`  ${chalk.red(err.message)}`);
    if (debug && err.detail) {
      console.log();
      console.log(chalk.dim(err.detail));
    }
    console.log();
  }

  /**
   * Renders a generic error diagnostic.
   */
  error(title: string, detail?: string): void {
    console.log();
    console.log(`${symbols.failure} ${chalk.red.bold(title)}`);
    if (detail) {
      console.log();
      console.log(`  ${chalk.dim(detail)}`);
    }
    console.log();
  }

  /**
   * Renders a warning diagnostic.
   */
  warning(title: string, detail?: string): void {
    console.log();
    console.log(`${symbols.warning} ${chalk.yellow.bold(title)}`);
    if (detail) {
      console.log();
      console.log(`  ${chalk.dim(detail)}`);
    }
    console.log();
  }

  /**
   * Renders a restrained horizontal divider.
   */
  divider(): void {
    console.log(chalk.dim("────────────────────────────────────────"));
  }
}

export const terminal = new DefaultTerminalPresenter();
