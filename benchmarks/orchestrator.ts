import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { AuditEngine, deriveFileSeed, type AuditResult } from "../dist/index.js";
import { checkoutPinnedRepository, getSisGitCommit } from "./git.ts";
import type {
  BenchmarkCorpus,
  BenchmarkCorpusEntry,
  BenchmarkOptions,
  BenchmarkRunMetadata,
  BenchmarkRunResult,
  RepositoryBenchmarkResult,
  BenchmarkAggregate,
  FindingBreakdown,
} from "./types.ts";

/**
 * Normalizes an AuditResult into a typed RepositoryBenchmarkResult.
 */
export function normalizeAuditResult(
  entry: BenchmarkCorpusEntry,
  auditResult: AuditResult,
  wallTimeMs: number,
  seed: number
): RepositoryBenchmarkResult {
  const stats = auditResult.statistics;
  const findings = auditResult.findings || [];

  const breakdown: FindingBreakdown = {
    taintViolations: findings.filter((f) => f.type === "taint-violation").length,
    serializationViolations: findings.filter((f) => f.type === "serialization-violation").length,
    runtimeExceptions: findings.filter((f) => f.type === "runtime-exception").length,
    timeouts: findings.filter((f) => f.type === "timeout").length,
    invariantViolations: findings.filter((f) => f.type === "invariant-violation").length,
  };

  const runtimeCompatibleCount = auditResult.actions
    ? auditResult.actions.filter((a) => a.executionCompatibility === "sandbox-compatible").length
    : Math.max(0, (stats.actionsFound || 0) - (stats.unsupportedExecutions || 0));

  return {
    repository: entry.name,
    url: entry.url,
    commit: entry.commit,
    status: (stats.analysisErrors || 0) > 0 && stats.filesAnalyzed === 0 ? "failed" : "completed",
    filesDiscovered: stats.filesScanned || 0,
    filesAnalyzed: stats.filesAnalyzed || 0,
    filesSkipped: stats.filesSkipped || 0,
    boundariesFound: stats.boundariesFound || 0,
    serverActionsFound: stats.actionsFound || 0,
    propBoundariesFound: stats.propBoundariesFound || 0,
    serializabilityLeaks: stats.serializabilityViolations || 0,
    runtimeFailures: stats.failedExecutions || 0,
    taintViolations: stats.taintViolations || 0,
    analysisErrors: stats.analysisErrors || 0,
    verifiedFindings: findings.length,
    runtimeCompatibleCandidates: runtimeCompatibleCount,
    auditWallTimeMs: Math.round(wallTimeMs),
    seed,
    findingBreakdown: breakdown,
    rawFindings: findings,
  };
}

/**
 * Computes aggregate summary metrics across all benchmarked repositories.
 */
export function computeAggregate(
  repositories: RepositoryBenchmarkResult[]
): BenchmarkAggregate {
  return repositories.reduce<BenchmarkAggregate>(
    (acc, repo) => {
      acc.totalRepositories++;
      if (repo.status === "completed") {
        acc.successfulRepositories++;
      } else {
        acc.failedRepositories++;
      }
      acc.totalFilesScanned += repo.filesDiscovered;
      acc.totalFilesAnalyzed += repo.filesAnalyzed;
      acc.totalBoundariesFound += repo.boundariesFound;
      acc.totalServerActionsFound += repo.serverActionsFound;
      acc.totalPropBoundariesFound += repo.propBoundariesFound;
      acc.totalSerializabilityLeaks += repo.serializabilityLeaks;
      acc.totalRuntimeFailures += repo.runtimeFailures;
      acc.totalTaintViolations += repo.taintViolations;
      acc.totalAnalysisErrors += repo.analysisErrors;
      acc.totalVerifiedFindings += repo.verifiedFindings;
      acc.totalRuntimeCompatibleCandidates += repo.runtimeCompatibleCandidates;
      acc.totalWallTimeMs += repo.auditWallTimeMs;
      return acc;
    },
    {
      totalRepositories: 0,
      successfulRepositories: 0,
      failedRepositories: 0,
      totalFilesScanned: 0,
      totalFilesAnalyzed: 0,
      totalBoundariesFound: 0,
      totalServerActionsFound: 0,
      totalPropBoundariesFound: 0,
      totalSerializabilityLeaks: 0,
      totalRuntimeFailures: 0,
      totalTaintViolations: 0,
      totalAnalysisErrors: 0,
      totalVerifiedFindings: 0,
      totalRuntimeCompatibleCandidates: 0,
      totalWallTimeMs: 0,
    }
  );
}

/**
 * Runs the benchmark for a single repository entry with full isolation.
 */
export async function runBenchmarkForRepository(
  entry: BenchmarkCorpusEntry,
  options: BenchmarkOptions,
  baseSeed: number
): Promise<RepositoryBenchmarkResult> {
  const repoSeed = deriveFileSeed(baseSeed, entry.name);
  const tempDir = path.join(
    os.tmpdir(),
    `sis-benchmark-${crypto.randomBytes(6).toString("hex")}`
  );

  const startTime = performance.now();

  if (options.dryRun) {
    return {
      repository: entry.name,
      url: entry.url,
      commit: entry.commit,
      status: "completed",
      filesDiscovered: 0,
      filesAnalyzed: 0,
      filesSkipped: 0,
      boundariesFound: 0,
      serverActionsFound: 0,
      propBoundariesFound: 0,
      serializabilityLeaks: 0,
      runtimeFailures: 0,
      taintViolations: 0,
      analysisErrors: 0,
      verifiedFindings: 0,
      runtimeCompatibleCandidates: 0,
      auditWallTimeMs: 0,
      seed: repoSeed,
      findingBreakdown: {
        taintViolations: 0,
        serializationViolations: 0,
        runtimeExceptions: 0,
        timeouts: 0,
        invariantViolations: 0,
      },
      rawFindings: [],
    };
  }

  try {
    if (!options.silent) {
      process.stderr.write(`[benchmark] Fetching ${entry.name} (${entry.commit.slice(0, 7)})...\n`);
    }

    await checkoutPinnedRepository(entry.url, entry.commit, tempDir);

    const targetPath = path.resolve(tempDir, entry.targetDir || ".");

    if (!fs.existsSync(targetPath)) {
      throw new Error(
        `Target directory '${entry.targetDir}' does not exist in repository '${entry.name}'`
      );
    }

    if (!options.silent) {
      process.stderr.write(`[benchmark] Auditing ${entry.name}...\n`);
    }

    const engine = new AuditEngine({
      runs: options.runs ?? 10,
      seed: repoSeed,
      timeoutMs: options.timeoutMs ?? 20,
      silent: true,
    });

    const auditResult = await engine.run(targetPath);
    const wallTimeMs = performance.now() - startTime;

    return normalizeAuditResult(entry, auditResult, wallTimeMs, repoSeed);
  } catch (err: unknown) {
    const wallTimeMs = performance.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (!options.silent) {
      process.stderr.write(`[benchmark] Error auditing ${entry.name}: ${errorMessage}\n`);
    }

    return {
      repository: entry.name,
      url: entry.url,
      commit: entry.commit,
      status: "failed",
      error: errorMessage,
      filesDiscovered: 0,
      filesAnalyzed: 0,
      filesSkipped: 0,
      boundariesFound: 0,
      serverActionsFound: 0,
      propBoundariesFound: 0,
      serializabilityLeaks: 0,
      runtimeFailures: 0,
      taintViolations: 0,
      analysisErrors: 1,
      verifiedFindings: 0,
      runtimeCompatibleCandidates: 0,
      auditWallTimeMs: Math.round(wallTimeMs),
      seed: repoSeed,
      findingBreakdown: {
        taintViolations: 0,
        serializationViolations: 0,
        runtimeExceptions: 0,
        timeouts: 0,
        invariantViolations: 0,
      },
      rawFindings: [],
    };
  } finally {
    if (!options.keepTemp && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore filesystem cleanup errors on transient tmpdir
      }
    }
  }
}

/**
 * Main benchmark execution pipeline.
 */
export async function runBenchmark(
  corpus: BenchmarkCorpus,
  options: BenchmarkOptions = {}
): Promise<BenchmarkRunResult> {
  const baseSeed = options.seed ?? 42;
  const runs = options.runs ?? 10;
  const timeoutMs = options.timeoutMs ?? 20;

  // Filter repositories if --repo specified
  let targets = corpus.repositories;
  if (options.repo) {
    const query = options.repo.toLowerCase();
    targets = corpus.repositories.filter(
      (r) =>
        r.name.toLowerCase() === query ||
        r.name.toLowerCase().endsWith(`/${query}`) ||
        r.name.toLowerCase().includes(query)
    );
    if (targets.length === 0) {
      const available = corpus.repositories.map((r) => r.name).join(", ");
      throw new Error(
        `Repository '${options.repo}' not found in corpus. Available repositories: ${available}`
      );
    }
  }

  const sisCommit = await getSisGitCommit();
  const cpus = os.cpus();
  const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : "Unknown CPU";

  // Read SIS package version
  let sisVersion = "0.1.0";
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      sisVersion = pkg.version || sisVersion;
    }
  } catch {
    // Fallback
  }

  const metadata: BenchmarkRunMetadata = {
    sisVersion,
    sisCommit,
    nodeVersion: process.version,
    platform: process.platform,
    arch: os.arch(),
    cpuModel,
    corpusVersion: corpus.version,
    timestamp: new Date().toISOString(),
    baseSeed,
    runs,
    timeoutMs,
  };

  const results: RepositoryBenchmarkResult[] = [];

  for (const target of targets) {
    const res = await runBenchmarkForRepository(target, options, baseSeed);
    results.push(res);
  }

  const aggregate = computeAggregate(results);

  return {
    metadata,
    repositories: results,
    aggregate,
  };
}
