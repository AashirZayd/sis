import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT, TEST_CLI } from "./helpers/test-build.js";
import { normalizeGoldenOutput } from "./helpers/golden.js";

const execFileAsync = promisify(execFile);

/**
 * Golden output snapshots (Reliability Reset, Phase 4 change R-2b).
 *
 * These pin the CLI's observable behavior — terminal, JSON and SARIF output,
 * finding identifiers, runtime summaries and exit codes — so that every later
 * behavior change shows up as an explicit, reviewable snapshot diff.
 *
 * Several fixtures under test/fixtures/golden/ capture KNOWN-DEFECTIVE behavior
 * documented in audit/PHASE-2-FINDINGS-VALIDATION.md (V-01, V-02, V-03, V-07,
 * V-12). A snapshot change is only acceptable when it is intentional and
 * explained in the change description, citing the defect it addresses.
 */

interface GoldenCase {
  id: string;
  args: string[];
}

const SEED_ARGS = ["--seed", "42", "--runs", "6"];

/**
 * Execution budget for the fixture snapshots (Batch 1.2).
 *
 * isolated-vm's `timeout` is a wall-clock limit while the isolate executes:
 * time the isolate thread spends stalled (preemption, page faults, I/O) counts
 * against it. Each golden case runs a trivial action as the first execution in a
 * fresh CLI process, and the full suite saturates the machine at start-up, so at
 * the production default of 20ms a trivial action occasionally "timed out" and
 * the snapshot flipped from SIS003 to SIS004 (2 of 7 full runs).
 *
 * 500ms is more than 7x the worst wall latency measured for a trivial action
 * under full CPU saturation (69ms). Deliberate infinite loops still time out (at
 * 500ms), so the snapshots keep covering the timeout path. Dedicated
 * timeout/deadline tests use their own short budgets and are unaffected, and the
 * production default (20ms) is unchanged.
 */
const GOLDEN_BUDGET_ARGS = ["--timeout", "500"];

const FIXTURE_TARGETS: Array<{ id: string; target: string }> = [
  { id: "project", target: "test/fixtures/project" },
  { id: "next-boundaries", target: "test/fixtures/next-boundaries" },
  { id: "real-world-runtime", target: "test/fixtures/real-world/runtime" },
  { id: "empty-project", target: "test/fixtures/empty-project" },
  { id: "single-file-fragile-action", target: "test/fixtures/fragile-action.ts" },
  { id: "two-param", target: "test/fixtures/golden/two-param" },
  { id: "return-function", target: "test/fixtures/golden/return-function" },
  { id: "dynamic-import", target: "test/fixtures/golden/dynamic-import" },
  { id: "helper-dependent", target: "test/fixtures/golden/helper-dependent" },
  { id: "export-shapes", target: "test/fixtures/golden/export-shapes" },
  { id: "unicode-prefix", target: "test/fixtures/golden/unicode-prefix" },
  { id: "route-under-api", target: "test/fixtures/golden/route-under-api/app/api" },
];

const CASES: GoldenCase[] = [
  ...FIXTURE_TARGETS.flatMap(({ id, target }) =>
    (["terminal", "json", "sarif"] as const).map((format) => ({
      id: `${id}.${format}`,
      args: ["audit", target, "--format", format, ...SEED_ARGS, ...GOLDEN_BUDGET_ARGS],
    }))
  ),
  // Added with change S-0 (V-26). There is no pre-S-0 baseline: the old runtime
  // never returned for this fixture. Two runs keep the 1s-per-payload deadline cheap.
  // It keeps the default 20ms budget: its outcome is decided by the wall-clock
  // deadline (max(10 x budget, 1000ms)), which a 500ms budget would raise to 5s
  // per payload, and it executes no action body that a stall could flip.
  ...(["terminal", "json", "sarif"] as const).map((format) => ({
    id: `never-settling.${format}`,
    args: ["audit", "test/fixtures/golden/never-settling", "--format", format, "--seed", "42", "--runs", "2"],
  })),
  { id: "error-target-not-found.json", args: ["audit", "test/fixtures/does-not-exist", "--json"] },
  { id: "error-conflicting-formats", args: ["audit", "test/fixtures/project", "--json", "--sarif"] },
  { id: "error-invalid-runs.json", args: ["audit", "test/fixtures/project", "--runs", "0", "--json"] },
];

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [TEST_CLI, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    if (typeof e.code !== "number") throw err;
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code };
  }
}

describe("Golden CLI output snapshots", () => {
  for (const goldenCase of CASES) {
    it(`matches golden output: ${goldenCase.id}`, async () => {
      const result = await runCli(goldenCase.args);
      // Sections are joined with "\n" and the document ends with exactly one
      // newline, so an empty stderr section leaves no blank line at EOF.
      const document =
        [
          `# golden: ${goldenCase.id}`,
          `# command: sis ${goldenCase.args.join(" ")}`,
          `# exit: ${result.exitCode}`,
          "# --- stdout ---",
          normalizeGoldenOutput(result.stdout).trimEnd(),
          "# --- stderr ---",
          normalizeGoldenOutput(result.stderr).trimEnd(),
        ]
          .join("\n")
          .trimEnd() + "\n";

      await expect(document).toMatchFileSnapshot(
        path.join(REPO_ROOT, "test", "__golden__", `${goldenCase.id}.txt`)
      );
    }, 60_000);
  }
});
