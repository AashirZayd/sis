#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "./orchestrator.ts";
import { writeReports, generateJsonReport } from "./reporter.ts";
import {
  loadGroundTruth,
  saveGroundTruth,
  syncGroundTruthReviews,
  findingToReviewRecord,
  computeGroundTruthStats,
  generateGroundTruthMarkdownReport,
  reproduceFindingByFingerprint,
} from "./reviews.ts";
import type { BenchmarkCorpus, BenchmarkOptions, ReviewRecord } from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name("sis-benchmark")
  .description("SIS Real-World Benchmark & Evaluation Runner")
  .version("0.1.0")
  .option("--repo <name>", "Filter or run benchmark against a specific repository name")
  .option("--all", "Run benchmark against all repositories in the corpus (default)")
  .option("--json", "Output benchmark results as JSON to stdout")
  .option("-s, --seed <number>", "Deterministic base random seed (default: 42)", (v) => parseInt(v, 10), 42)
  .option("-r, --runs <number>", "Number of fuzzing runs per candidate action (default: 10)", (v) => parseInt(v, 10), 10)
  .option("-t, --timeout <number>", "Execution budget per candidate inside isolate in ms (default: 20)", (v) => parseInt(v, 10), 20)
  .option("--out-dir <path>", "Directory where latest.json and latest.md are written", "benchmarks/results")
  .option("--dry-run", "Validate corpus configuration without cloning repositories")
  .option("--keep-temp", "Preserve temporary checkout directories for inspection")
  .option("--review", "Inspect, filter, or update ground-truth validation reviews")
  .option("--status <status>", "Filter review records by status: 'pending', 'reviewed', or 'all'", "all")
  .option("--rule <ruleId>", "Filter review records by rule ID (e.g. SIS002, SIS003)")
  .option("--reproduce <fingerprint>", "Reproduce a specific finding from its stable fingerprint");

program.action(async (opts: {
  repo?: string;
  all?: boolean;
  json?: boolean;
  seed: number;
  runs: number;
  timeout: number;
  outDir: string;
  dryRun?: boolean;
  keepTemp?: boolean;
  review?: boolean;
  status?: string;
  rule?: string;
  reproduce?: string;
}) => {
  const corpusPath = path.resolve(__dirname, "corpus.json");
  if (!fs.existsSync(corpusPath)) {
    process.stderr.write(`[benchmark] Error: corpus.json not found at ${corpusPath}\n`);
    process.exit(1);
  }

  let corpus: BenchmarkCorpus;
  try {
    corpus = JSON.parse(await fs.promises.readFile(corpusPath, "utf-8"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[benchmark] Error parsing corpus.json: ${msg}\n`);
    process.exit(1);
  }

  // 1. REPRODUCE MODE
  if (opts.reproduce) {
    const fingerprint = opts.reproduce.trim();
    process.stderr.write("════════════════════════════════════════════════════════════════\n");
    process.stderr.write(` REPRODUCING BENCHMARK FINDING: ${fingerprint}\n`);
    process.stderr.write("════════════════════════════════════════════════════════════════\n\n");

    try {
      const groundTruth = await loadGroundTruth();
      const result = await reproduceFindingByFingerprint(fingerprint, corpus, groundTruth);

      if (result.status === "reproduced") {
        process.stdout.write(`✓ REPRODUCTION SUCCESSFUL (${result.wallTimeMs}ms)\n\n`);
        process.stdout.write(`  Repository:        ${result.repository} (${result.commit.slice(0, 7)})\n`);
        process.stdout.write(`  Rule ID:           ${result.ruleId}\n`);
        process.stdout.write(`  File & Line:       ${result.file}#L${result.line}\n`);
        process.stdout.write(`  Action:            ${result.actionName || "(module scope)"}\n`);
        process.stdout.write(`  Message:           ${result.message}\n`);
        process.stdout.write(`  Generated Input:   ${JSON.stringify(result.generatedInput)}\n`);
        process.stdout.write(`  Failure Signature: ${result.failureSignature || "(none)"}\n\n`);
        process.stdout.write("Finding was successfully reproduced under isolated runtime execution.\n");
        process.exit(0);
      } else {
        process.stderr.write(`✖ REPRODUCTION FAILED (${result.wallTimeMs}ms)\n\n`);
        process.stderr.write(`  Repository:  ${result.repository}\n`);
        process.stderr.write(`  File:        ${result.file}#L${result.line}\n`);
        process.stderr.write(`  Rule:        ${result.ruleId}\n`);
        process.stderr.write(`  Message:     ${result.message}\n`);
        if (result.executionError) {
          process.stderr.write(`  Error:       ${result.executionError}\n`);
        }
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n[benchmark] Reproduction error: ${msg}\n`);
      process.exit(1);
    }
  }

  // 2. REVIEW MODE
  if (opts.review) {
    try {
      const groundTruth = await loadGroundTruth();
      const stats = computeGroundTruthStats(groundTruth);

      // Refresh ground-truth.md
      const mdReport = generateGroundTruthMarkdownReport(groundTruth, stats);
      const gtMdPath = path.resolve(process.cwd(), opts.outDir, "ground-truth.md");
      const outDirPath = path.resolve(process.cwd(), opts.outDir);
      if (!fs.existsSync(outDirPath)) {
        fs.mkdirSync(outDirPath, { recursive: true });
      }
      await fs.promises.writeFile(gtMdPath, mdReport, "utf8");

      let filtered = groundTruth.reviews;

      if (opts.repo) {
        const q = opts.repo.toLowerCase();
        filtered = filtered.filter((r) => r.repository.toLowerCase().includes(q));
      }

      if (opts.rule) {
        const q = opts.rule.toUpperCase();
        filtered = filtered.filter((r) => r.ruleId.toUpperCase() === q);
      }

      if (opts.status === "pending") {
        filtered = filtered.filter((r) => r.classification === "NEEDS_REVIEW");
      } else if (opts.status === "reviewed") {
        filtered = filtered.filter((r) => r.classification !== "NEEDS_REVIEW");
      }

      process.stderr.write("════════════════════════════════════════════════════════════════\n");
      process.stderr.write(" SIS GROUND-TRUTH BENCHMARK REVIEW SUMMARY\n");
      process.stderr.write(` Ground-Truth File: benchmarks/reviews/ground-truth.json\n`);
      process.stderr.write(` Report Generated:  ${gtMdPath}\n`);
      process.stderr.write("════════════════════════════════════════════════════════════════\n\n");

      process.stderr.write(`  Total Verified Findings: ${stats.total}\n`);
      process.stderr.write(`  Reviewed:                ${stats.reviewed}\n`);
      process.stderr.write(`  Pending Review:          ${stats.pending}\n`);
      process.stderr.write(`  True Positives (TP):     ${stats.truePositives}\n`);
      process.stderr.write(`  False Positives (FP):    ${stats.falsePositives}\n`);
      process.stderr.write(`  Expected Behavior:       ${stats.expectedBehavior}\n`);
      process.stderr.write(`  Unreachable:             ${stats.unreachable}\n`);
      process.stderr.write(`  Framework Artifacts:     ${stats.frameworkArtifacts}\n`);
      process.stderr.write(
        `  Precision:               ${
          stats.precision !== null ? `${(stats.precision * 100).toFixed(1)}%` : "N/A (Pending review)"
        }\n\n`
      );

      if (filtered.length === 0) {
        process.stderr.write("No findings matched the requested filter criteria.\n");
      } else {
        process.stderr.write(
          `Showing ${filtered.length} finding(s) matching filter [status: ${opts.status || "all"}${
            opts.repo ? `, repo: ${opts.repo}` : ""
          }${opts.rule ? `, rule: ${opts.rule}` : ""}]:\n\n`
        );

        for (const r of filtered) {
          const statusTag =
            r.classification === "NEEDS_REVIEW"
              ? "PENDING"
              : `${r.classification} (${r.confidence})`;
          const inputStr =
            r.generatedInput !== undefined ? JSON.stringify(r.generatedInput) : "(none)";

          process.stdout.write(`• [${r.fingerprint}] ${r.repository} — ${r.ruleId} ${r.file}#L${r.line}\n`);
          process.stdout.write(`  Action: ${r.actionName || "(module scope)"} | Status: ${statusTag}\n`);
          process.stdout.write(`  Message: ${r.message}\n`);
          process.stdout.write(`  Input: ${inputStr}\n`);
          process.stdout.write(`  Repro: npm run benchmark -- --reproduce ${r.fingerprint}\n\n`);
        }
      }
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n[benchmark] Review error: ${msg}\n`);
      process.exit(1);
    }
  }

  // 3. STANDARD BENCHMARK EXECUTION MODE
  const benchmarkOptions: BenchmarkOptions = {
    repo: opts.repo,
    all: opts.all ?? true,
    json: opts.json,
    seed: opts.seed,
    runs: opts.runs,
    timeoutMs: opts.timeout,
    outDir: opts.outDir,
    dryRun: opts.dryRun,
    keepTemp: opts.keepTemp,
    silent: opts.json,
  };

  try {
    if (!opts.json) {
      process.stderr.write("════════════════════════════════════════════════════════════════\n");
      process.stderr.write(" SIS REAL-WORLD BENCHMARK EVALUATION\n");
      process.stderr.write(` Corpus: ${corpus.description}\n`);
      process.stderr.write(` Repositories: ${corpus.repositories.length} pinned targets\n`);
      process.stderr.write(` Base Seed: ${opts.seed} | Runs: ${opts.runs} | Timeout: ${opts.timeout}ms\n`);
      if (opts.dryRun) {
        process.stderr.write(" Mode: DRY-RUN (Validation only; reports will not be modified)\n");
      }
      process.stderr.write("════════════════════════════════════════════════════════════════\n\n");
    }

    const result = await runBenchmark(corpus, benchmarkOptions);

    // Only write reports and sync ground-truth when NOT in dry-run mode
    if (!opts.dryRun) {
      const { jsonPath, mdPath } = await writeReports(result, opts.outDir);

      // Extract and sync findings into ground-truth.json
      const newRecords: ReviewRecord[] = [];
      for (const repo of result.repositories) {
        if (repo.rawFindings && repo.rawFindings.length > 0) {
          for (const f of repo.rawFindings) {
            newRecords.push(findingToReviewRecord(repo.repository, repo.commit, ".", f));
          }
        }
      }

      if (newRecords.length > 0) {
        const existingGt = await loadGroundTruth();
        const syncedGt = syncGroundTruthReviews(existingGt, newRecords);
        await saveGroundTruth(syncedGt);

        const gtStats = computeGroundTruthStats(syncedGt);
        const gtMd = generateGroundTruthMarkdownReport(syncedGt, gtStats);
        const gtMdPath = path.resolve(process.cwd(), opts.outDir, "ground-truth.md");
        await fs.promises.writeFile(gtMdPath, gtMd, "utf8");
      }

      if (opts.json) {
        process.stdout.write(generateJsonReport(result) + "\n");
      } else {
        process.stderr.write("\n════════════════════════════════════════════════════════════════\n");
        process.stderr.write(" BENCHMARK RUN COMPLETE\n");
        process.stderr.write(` Repositories Evaluated: ${result.aggregate.totalRepositories} (${result.aggregate.successfulRepositories} succeeded, ${result.aggregate.failedRepositories} failed)\n`);
        process.stderr.write(` Total Files Analyzed:   ${result.aggregate.totalFilesAnalyzed} / ${result.aggregate.totalFilesScanned}\n`);
        process.stderr.write(` Server Boundaries:      ${result.aggregate.totalBoundariesFound}\n`);
        process.stderr.write(` Server Actions:         ${result.aggregate.totalServerActionsFound}\n`);
        process.stderr.write(` Sandbox Candidates:     ${result.aggregate.totalRuntimeCompatibleCandidates}\n`);
        process.stderr.write(` Verified Findings:      ${result.aggregate.totalVerifiedFindings}\n`);
        process.stderr.write(` Total Time:             ${(result.aggregate.totalWallTimeMs / 1000).toFixed(2)}s\n`);
        process.stderr.write(` Reports Generated:\n   JSON: ${jsonPath}\n   Markdown: ${mdPath}\n   Ground-Truth: ${path.resolve(process.cwd(), opts.outDir, "ground-truth.md")}\n`);
        process.stderr.write("════════════════════════════════════════════════════════════════\n");
      }
    } else {
      if (opts.json) {
        process.stdout.write(generateJsonReport(result) + "\n");
      } else {
        process.stderr.write("✓ Dry-run completed: Corpus configuration and targets validated successfully.\n");
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\n[benchmark] Fatal error: ${msg}\n`);
    process.exit(1);
  }
});

program.parse(process.argv);

