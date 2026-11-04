// Validates workflow_dispatch inputs for .github/workflows/benchmark.yml before
// they reach a shell. Inputs arrive through environment variables (never through
// `${{ }}` expression interpolation inside `run:` scripts).
//
// Accepted values:
//   IN_REPO  empty, "all", or the exact name of a repository in benchmarks/corpus.json
//   IN_RUNS  empty or 1-6 decimal digits
//   IN_SEED  empty or 1-10 decimal digits
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIGITS = (max) => new RegExp(`^[0-9]{1,${max}}$`);

/**
 * @param {{ repo?: string, runs?: string, seed?: string }} inputs
 * @param {string[]} corpusNames
 * @returns {{ ok: true, repo: string, runs: string, seed: string } | { ok: false, errors: string[] }}
 */
export function validateBenchmarkInputs(inputs, corpusNames) {
  const errors = [];
  const repo = inputs.repo ?? "";
  const runs = inputs.runs ?? "";
  const seed = inputs.seed ?? "";

  const known = new Map(corpusNames.map((name) => [name.toLowerCase(), name]));
  let normalizedRepo = "all";
  if (repo !== "" && repo !== "all") {
    const match = known.get(repo.toLowerCase());
    if (!match) {
      errors.push(`repo must be "all" or an exact corpus repository name; received ${JSON.stringify(repo)}`);
    } else {
      normalizedRepo = match;
    }
  }

  if (runs !== "" && !DIGITS(6).test(runs)) {
    errors.push(`runs must be a positive integer (digits only); received ${JSON.stringify(runs)}`);
  } else if (runs !== "" && Number(runs) < 1) {
    errors.push("runs must be at least 1");
  }

  if (seed !== "" && !DIGITS(10).test(seed)) {
    errors.push(`seed must be a non-negative integer (digits only); received ${JSON.stringify(seed)}`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, repo: normalizedRepo, runs: runs || "10", seed: seed || "42" };
}

export function loadCorpusNames(repoRoot) {
  const corpus = JSON.parse(fs.readFileSync(path.join(repoRoot, "benchmarks", "corpus.json"), "utf-8"));
  return corpus.repositories.map((r) => r.name);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const result = validateBenchmarkInputs(
    { repo: process.env.IN_REPO, runs: process.env.IN_RUNS, seed: process.env.IN_SEED },
    loadCorpusNames(repoRoot)
  );
  if (!result.ok) {
    for (const e of result.errors) console.error(`Invalid benchmark input: ${e}`);
    process.exit(1);
  }
  console.log(`Benchmark inputs OK: repo=${result.repo} runs=${result.runs} seed=${result.seed}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `repo=${result.repo}\nruns=${result.runs}\nseed=${result.seed}\n`
    );
  }
}
