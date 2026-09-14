import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { checkoutPinnedRepository, GitAcquisitionError } from "./git.ts";
import type {
  BenchmarkCorpus,
  BenchmarkCorpusEntry,
  BenchmarkOptions,
  CorpusTier,
  ValidationResult,
} from "./types.ts";

/**
 * Filter and sort repositories deterministically according to tier options.
 */
export function selectAndSortCorpusEntries(
  corpus: BenchmarkCorpus,
  options: BenchmarkOptions
): BenchmarkCorpusEntry[] {
  let entries = [...corpus.repositories];

  // Apply tier filtering
  const hasExplicitTier = options.core || options.extended || options.adversarial;
  if (hasExplicitTier) {
    entries = entries.filter((entry) => {
      const tier = entry.tier || "CORE";
      if (options.core && tier === "CORE") return true;
      if (options.extended && tier === "EXTENDED") return true;
      if (options.adversarial && tier === "ADVERSARIAL") return true;
      return false;
    });
  } else if (!options.all && !options.repo) {
    // If no flags specified and no specific repo specified, default to CORE
    entries = entries.filter((entry) => (entry.tier || "CORE") === "CORE");
  }

  // Filter by repository name if --repo specified
  if (options.repo) {
    const query = options.repo.toLowerCase();
    entries = entries.filter(
      (r) =>
        r.name.toLowerCase() === query ||
        r.name.toLowerCase().endsWith(`/${query}`) ||
        r.name.toLowerCase().includes(query)
    );
  }

  // Deterministic sorting: by Tier (CORE -> EXTENDED -> ADVERSARIAL), then alphabetically by name
  const tierWeight: Record<CorpusTier, number> = {
    CORE: 0,
    EXTENDED: 1,
    ADVERSARIAL: 2,
  };

  entries.sort((a, b) => {
    const wA = tierWeight[a.tier || "CORE"] ?? 99;
    const wB = tierWeight[b.tier || "CORE"] ?? 99;
    if (wA !== wB) return wA - wB;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/**
 * Validates a single repository entry with full failure isolation and cleanup.
 */
export async function validateRepositoryEntry(
  entry: BenchmarkCorpusEntry,
  timeoutMs = 90_000
): Promise<ValidationResult> {
  const tier: CorpusTier = entry.tier || "CORE";
  const startTime = performance.now();

  // 1. Check if candidate is marked as excluded in manifest
  if (entry.status === "excluded") {
    return {
      repository: entry.name,
      tier,
      commit: entry.commit,
      status: "EXCLUDED",
      failureStage: "metadata",
      reason: entry.exclusionReason || "Candidate explicitly excluded in manifest",
      wallTimeMs: 0,
    };
  }

  // 2. Metadata Stage Validation
  if (!entry.url || !entry.name) {
    return {
      repository: entry.name || "(unknown)",
      tier,
      commit: entry.commit || "(missing)",
      status: "FAIL",
      failureStage: "metadata",
      failureReason: "unknown",
      reason: "Missing repository URL or name in manifest",
      wallTimeMs: Math.round(performance.now() - startTime),
    };
  }

  if (!entry.commit || !/^[0-9a-f]{40}$/i.test(entry.commit)) {
    return {
      repository: entry.name,
      tier,
      commit: entry.commit || "(invalid)",
      status: "FAIL",
      failureStage: "metadata",
      failureReason: "commit-unresolvable",
      reason: `Invalid commit SHA format: '${entry.commit}' must be a 40-character hex string`,
      wallTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // 3. Ephemeral Shallow Clone & Checkout Stage
  const tempDir = path.join(
    os.tmpdir(),
    `sis-val-${crypto.randomBytes(6).toString("hex")}`
  );

  try {
    await checkoutPinnedRepository(entry.url, entry.commit, tempDir, timeoutMs);
  } catch (err: unknown) {
    const wallTimeMs = Math.round(performance.now() - startTime);
    if (err instanceof GitAcquisitionError) {
      return {
        repository: entry.name,
        tier,
        commit: entry.commit,
        status: "FAIL",
        failureStage: "clone",
        failureReason: err.failureReason,
        reason: err.message,
        wallTimeMs,
      };
    }
    return {
      repository: entry.name,
      tier,
      commit: entry.commit,
      status: "FAIL",
      failureStage: "clone",
      failureReason: "unknown",
      reason: err instanceof Error ? err.message : String(err),
      wallTimeMs,
    };
  }

  // 4. Target Directory Validation
  const targetPath = path.resolve(tempDir, entry.targetDir || ".");
  if (!fs.existsSync(targetPath)) {
    // Cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    return {
      repository: entry.name,
      tier,
      commit: entry.commit,
      status: "FAIL",
      failureStage: "targetDir",
      failureReason: "target-directory-missing",
      reason: `Target directory '${entry.targetDir}' does not exist in checked-out repository`,
      wallTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // 5. App Router Structure Verification
  const hasAppDir =
    fs.existsSync(path.join(targetPath, "app")) ||
    fs.existsSync(path.join(targetPath, "src", "app"));

  // 6. Cleanup Verification
  let cleanupOk = true;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    cleanupOk = !fs.existsSync(tempDir);
  } catch {
    cleanupOk = false;
  }

  const wallTimeMs = Math.round(performance.now() - startTime);

  return {
    repository: entry.name,
    tier,
    commit: entry.commit,
    status: "PASS",
    reason: hasAppDir ? "App Router verified" : "Directory verified (custom structure)",
    wallTimeMs,
  };
}

/**
 * Runs corpus validation across selected tiers and renders a structured report.
 */
export async function validateCorpus(
  corpus: BenchmarkCorpus,
  options: BenchmarkOptions
): Promise<{
  total: number;
  passed: number;
  excluded: number;
  failed: number;
  results: ValidationResult[];
}> {
  const entries = selectAndSortCorpusEntries(corpus, options);

  process.stderr.write("════════════════════════════════════════════════════════════════\n");
  process.stderr.write(" SIS BENCHMARK CORPUS VALIDATION (PHASE 28)\n");
  process.stderr.write(` Selected Targets: ${entries.length} repositories\n`);
  process.stderr.write(` Mode: Non-interactive Git (GIT_TERMINAL_PROMPT=0) | Timeout: 90s\n`);
  process.stderr.write("════════════════════════════════════════════════════════════════\n\n");

  const results: ValidationResult[] = [];

  for (const entry of entries) {
    const tierTag = `[${entry.tier || "CORE"}]`.padEnd(13);
    process.stderr.write(`• Validating ${tierTag} ${entry.name} (${entry.commit.slice(0, 7)})... `);

    const res = await validateRepositoryEntry(entry);
    results.push(res);

    if (res.status === "PASS") {
      process.stderr.write(`✓ PASS (${res.wallTimeMs}ms)\n`);
    } else if (res.status === "EXCLUDED") {
      process.stderr.write(`⊘ EXCLUDED: ${res.reason}\n`);
    } else {
      process.stderr.write(`✖ FAIL [${res.failureStage} / ${res.failureReason}]: ${res.reason} (${res.wallTimeMs}ms)\n`);
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const excluded = results.filter((r) => r.status === "EXCLUDED").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  process.stderr.write("\n════════════════════════════════════════════════════════════════\n");
  process.stderr.write(" CORPUS VALIDATION SUMMARY\n");
  process.stderr.write("════════════════════════════════════════════════════════════════\n");
  process.stderr.write(` Total Evaluated: ${results.length}\n`);
  process.stderr.write(` Passed (Valid):  ${passed}\n`);
  process.stderr.write(` Excluded:        ${excluded}\n`);
  process.stderr.write(` Failed:          ${failed}\n\n`);

  // Tier Breakdown Table
  const tiers: CorpusTier[] = ["CORE", "EXTENDED", "ADVERSARIAL"];
  process.stderr.write(" Tier Breakdown:\n");
  process.stderr.write(" Tier        Total   Valid   Excluded  Failed\n");
  process.stderr.write(" ────────────────────────────────────────────\n");
  for (const t of tiers) {
    const inTier = results.filter((r) => r.tier === t);
    const tPassed = inTier.filter((r) => r.status === "PASS").length;
    const tExcluded = inTier.filter((r) => r.status === "EXCLUDED").length;
    const tFailed = inTier.filter((r) => r.status === "FAIL").length;
    process.stderr.write(
      ` ${t.padEnd(11)} ${String(inTier.length).padStart(5)}   ${String(tPassed).padStart(5)}   ${String(tExcluded).padStart(8)}  ${String(tFailed).padStart(6)}\n`
    );
  }
  process.stderr.write("════════════════════════════════════════════════════════════════\n");

  return {
    total: results.length,
    passed,
    excluded,
    failed,
    results,
  };
}
