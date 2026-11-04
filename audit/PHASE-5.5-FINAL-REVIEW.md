# SIS — Phase 5.5: Batch 1 Final Engineering Review

| | |
| :--- | :--- |
| **Reviewed** | Uncommitted Batch 1 working tree on `master` at `585af3d` (18 modified, 70 new files) |
| **Inputs** | Phase 1–4 audit reports, `audit/PHASE-5-BATCH-1-IMPLEMENTATION-REPORT.md`, complete `git diff` and new files |
| **Date** | 2026-11-02 |
| **Environment** | Windows 11 x64 (12 logical CPUs), Node v24.19.0, isolated-vm 7.0.1 |
| **Method** | Source review, then empirical probes and a full replay of the proposed commit series in throwaway scratch repositories. No application code was modified during the review. The only file written to the repository is this report. |

Evidence labels: **CONFIRMED** means reproduced in this review; **SUPPORTED** means shown by source or documentation but not reproduced; **UNRESOLVED** means the cause was not established.

---

## 0. Verdict summary

The two product changes, the wall-clock deadline and Unicode locations, are **sound**. I found no correctness defect in them. The package is complete and functionally identical to the repo build. Every commit in the proposed series passes the full suite on a fresh checkout.

The review **did** find test-infrastructure limitations in the new build-independent test pipeline. None affects product behavior or single-process CI:

| ID | Finding | Severity | Status |
| :- | :--- | :--- | :--- |
| R-1 | Concurrent `vitest` runs in one checkout fail through the fixed shared test-build directory: `EPERM` on cleanup, or every file failing with "failed to find the runner" | P2 | **CONFIRMED** |
| R-2 | In watch mode (`npm run test:watch`), CLI-based tests keep using the build made at session start | P2 | **CONFIRMED** |
| R-3 | Outcomes at the default 20 ms CPU budget, including golden snapshots, can flip under extreme CPU contention | P2 | **CONFIRMED** under two concurrent suites; **not** reproduced under full single-suite load |
| R-4 | The Phase 5 "intermittent Vitest failure" has the exact signature R-1 produces, but no concurrent run was identified at the original occurrences | — | **UNRESOLVED** (plausible cause identified, not proven) |
| R-5 | `prepack` builds without cleaning `dist/`, so a deleted source module's stale output would be published | P3 | **SUPPORTED** (latent; no stale files today) |
| R-6 | Packaged JS keeps `//# sourceMappingURL=` comments pointing to excluded `.map` files | P3 | **CONFIRMED**, cosmetic (no runtime warning) |
| R-7 | The Phase 5 commit plan depended on session-scratch snapshot copies for one commit | P3 | **CONFIRMED**; fixed by the re-ordered series in §6 |

**Final verdict (§7): APPROVED WITH DOCUMENTED LIMITATIONS.**

---

## 1. Wall-clock deadline verification (`src/runtime/worker.ts`)

### 1.1 Lifecycle review

| Requirement | Assessment | Evidence |
| :--- | :--- | :--- |
| Deadline is independent of isolate CPU execution | **Yes.** A host `setTimeout` is created before `executeLifecycle()` starts and runs on the Node event loop, not inside the isolate. The isolate has no handle to it. | Source. Test "cannot be defeated by application code replacing timers or the clock" passes |
| Never-settling promises terminated | **Yes.** On expiry the timer disposes the isolate, and the pending `run()` rejects ("Promise was abandoned"). | `runtime-deadline.test.ts`; Phase 5 probe |
| Returned Proxies cannot cause unbounded result inspection | **Yes, bounded.** A looping `get`/`then` trap during result adoption is stopped by the CPU budget (legacy `timeout`) or, with a large budget, by the deadline. | Two Proxy tests |
| Late timeouts handled | **Yes.** The deadline resolves synchronously inside the timer callback before any disposal rejection reaches the lifecycle promise, so `Promise.race` takes the deadline outcome. A late lifecycle result is discarded, and its rejection is consumed (`lifecycle.catch`). | Boundary-race probe (§1.2) |
| Host remains responsive | **Yes.** | Host-tick test; the probe recorded steady 10 ms ticks during stalls |
| Isolates disposed correctly | **Yes.** The timer disposes on expiry, and `releaseResources()` in `finally` releases script and context and disposes, tolerating already-disposed objects. | Source; leak probe |
| No leaks under repeated timeouts | **Yes.** 230 deadline terminations (100 + 100 stalled, 30 CPU-bound): **0 active handles** afterwards, heap 4.1 → 4.4 MB, external 1.6 → 1.7 MB, RSS 42 → 48 MB and plateaued; a healthy execution afterwards. **CONFIRMED** | `p55/leak.mjs` |
| A timeout can't become an application finding | **Yes.** The deadline yields `execution-error`. `verifyRuntimeActions` counts it as `unsupported` (`src/runtime/executor.ts:307-309`), and findings are only built from `failed`/`timeout` (`src/index.ts:185-235`, `:514-564`). Shrinking only runs for `failed`/`timeout`, and a shrink candidate hitting the deadline has a different signature and is rejected. | Source; audit-level test; smoke test |

### 1.2 Boundary-race probe (new in this review)

To test the race between completion and expiry, I used deadlines of 1, 2, 3, 5, 8 and 10 ms, with 15 runs each, for three candidates: one that returns, one that throws `TypeError`, and a 3 ms busy loop. That's 270 executions. Every result was either the genuine outcome (`passed` or `failed / TypeError`) or `execution-error / WallClockDeadlineError`. **There were no disposal artefacts misclassified as application results and no unhandled rejections (CONFIRMED).**

### 1.3 Untested edge cases (documented, not defects)

1. **Host event-loop starvation.** The deadline timer can only fire when the host event loop is free. Synchronous host work in the same process (for example, a very large `ExternalCopy` of a payload, or SWC parsing on the main thread) would delay it. Payloads are depth-bounded (`isPayloadTransferable`), and audits run executions sequentially, so this is theoretical today.
2. **Deadline expiring while the isolate is being disposed for OOM.** Both paths dispose idempotently. Not exercised by a test.
3. **Pre-existing:** the `ExternalCopy` created for the payload isn't explicitly released (`worker.ts`, setup phase). It's reclaimed by GC. The leak probe shows no growth, but releasing it explicitly would be cleaner.
4. An explicit `wallTimeoutMs` below `timeoutMs` turns CPU-bound loops into `execution-error`. This is documented and only reachable through the library API.

**Conclusion: deadline implementation approved.**

---

## 2. Package integrity

| Check | Result |
| :--- | :--- |
| `npm pack` (into a scratch directory, after `prepack` rebuilt `dist/`) | `aashirzayd-sis-0.1.0.tgz`, **147 files**, 109.9 kB packed / 475.3 kB unpacked, version `0.1.0` (unchanged) |
| `files` allowlist | `dist`, minus `dist/analyzer`, `dist/fuzzer`, `dist/sandbox`, `dist/**/*.map`. Placeholder **directories** are absent from the tarball. (The real modules `dist/dataflow/analyzer.js` and `dist/taint/analyzer.js` are present, as intended.) |
| Source maps | 0 `.map` files packed |
| Entry points | `dist/cli.js` (shebang `#!/usr/bin/env node`), `dist/index.js`, `dist/index.d.ts`, `dist/version.js` present; `package.json` included (needed by `src/version.ts`) |
| Required runtime modules | `dist/runtime/prefix.js` and all 5 `dist/runtime/preludes/*.js` present |
| Relative imports | **139 checked, all resolve inside the tarball.** The one false hit (`./auth`) is inside a code comment |
| Bare imports | `@swc/core`, `chalk`, `commander`, `fast-check`, `isolated-vm`, `node:*`. **No undeclared dependency.** `ora` is not imported anywhere |
| Native dependencies | Unchanged (`@swc/core ^1.16.2`, `isolated-vm ^7.0.1`) |
| Functional equivalence | The extracted packaged CLI and the repo `dist/` CLI produce **identical** JSON (timing fields normalized) for `real-world/runtime`, `real-world/framework-dependencies` and `next-boundaries`. Preludes run from the package (FULL), and **PREFIX execution works from the package** (6 prefix executions, stopped at `db`) |
| Can the exclusions drop runtime functionality? | **No.** Nothing in `src/` imports the placeholder modules, and `.map` files aren't loaded at runtime. `node --enable-source-maps` with the packaged CLI produces no warnings (R-6: the dangling comments are cosmetic) |
| Stale-output risk (R-5) | The working `dist/` has exactly the 300 files a clean build produces today. But `build` is plain `tsc` (no clean step), so a future deletion of a source module would leave its compiled output in `dist/`, and `prepack` would publish it. **Recommendation:** clean `dist/` in `prepack` (Batch 2 or the release workflow, R-6 of the Phase 4 plan) |

**Conclusion: package approved.**

---

## 3. Test build cache (`test/setup/build-dist.ts`)

| Requirement | Result | Evidence |
| :--- | :--- | :--- |
| Source changes invalidate stale output (`vitest run`) | **Yes.** Every run deletes and rebuilds `node_modules/.cache/sis-test-build`. | Source; the L-1 change was picked up |
| Separate runs don't reuse invalid artifacts | **Yes, for sequential `vitest run`.** | Same |
| **Watch mode** | **No (R-2, CONFIRMED).** `globalSetup` runs once per session. After a source edit in watch mode, the re-run read live `src/` (`'0.1.0-watch-edit'`), while the CLI built at session start still printed `0.1.0`. CLI, golden, location-terminal and release tests are therefore stale in watch mode. Fix: rebuild on `onTestsRerun` in the global setup, or document `test:watch` as library-tests-only. |
| **Concurrent processes** | **No (R-1, CONFIRMED).** Two concurrent full runs with the repository config produced (a) `EPERM, Permission denied … rm …\node_modules\.cache\sis-test-build` (Windows lock held by the other run), failing the whole run, and in another trial (b) **all 28 files failing with "Vitest failed to find the runner" / "Cannot read properties of undefined (reading 'config')"**. The same concurrent pair **without** the global setup (scratch `.mjs` config) ran with no runner errors. Fix: a per-run build directory (for example suffixed with the process id and handed to tests via Vitest `provide`/`inject`), plus clean-up of old directories. |
| Checkouts sharing `node_modules` (junction or symlink) share the cache | **Yes**, a variant of R-1. The cache path resolves through `node_modules`. Observed in this review's scratch clones, which junction the repo's `node_modules`. | Observation |
| Failed builds can't leave apparently valid output | **Yes.** With a type error injected (scratch clone), the run aborts in global setup (exit 1, `error TS2322`, no tests executed). `tsc` may still have emitted files, but the next run deletes them before rebuilding. | **CONFIRMED** |
| Fresh clones work without `dist/` | **Yes.** Six fresh checkouts in §6, and Phase 5's two clones | **CONFIRMED** |
| Production build independent | **Yes.** The test build writes only under `node_modules/.cache`. Tests never read or create `dist/` (verified by running with `dist/` absent). `tsconfig.json` is unchanged, and the production `npm run build` output is unaffected. | **CONFIRMED** |

**Conclusion:** correct for the documented workflow (`npm ci && npm test`, one process at a time, and CI). It's unsafe for concurrent or watch-mode use until R-1/R-2 are fixed.

---

## 4. Intermittent Vitest failure (Phase 5 §8.2)

**Investigation:**

| Hypothesis | Test | Result |
| :--- | :--- | :--- |
| Drive-letter casing (`E:` vs `e:`) creating duplicate module instances | Ran Vitest from a lowercase `e:\` working directory via PowerShell | Node normalizes the cwd to `E:`; tests pass. **Rejected** |
| "Edit a test file, then immediately run" (the context of both original occurrences) | 6 iterations in a scratch clone: append to a test file, `tsc --noEmit`, full run | 6 / 6 passed. **Not reproduced** |
| Another Vitest process running at the same time | Process list during the review | None running. A third-party agent runtime process was present on the machine, but there's no evidence it ran tests |
| **Concurrent runs sharing the test-build directory** | Two concurrent full runs, repository config | **Reproduces the exact signature** (all 28 files fail, "failed to find the runner"), and also `EPERM` variants. Without the global setup: no runner errors |
| Vitest worker pool, file discovery, `node_modules/.vite` cache | Same-file-set concurrent runs without the global setup | No runner errors, so Vitest's own cache isn't sufficient to cause it |
| Windows file locking | `EPERM` on `rmSync` of the shared directory during concurrency | **CONFIRMED** as the mechanism for the `EPERM` variant |

**Classification: UNRESOLVED.** The only reproduction of the signature is concurrent runs through the shared test-build directory (R-1). That's a plausible cause, but at the two original occurrences no concurrent run was identified, so the original failures are **not** proven to have this cause. No retry or masking has been added.

I'd recommend fixing R-1 (per-run directory) first, then watching CI and local runs for any recurrence.

**Related discovery (R-3).** While investigating, I saw outcomes flip under extreme contention (two full suites at once):
- In `project.terminal`, `riskyCompute threw TypeError …` became `riskyCompute timed out after 20ms execution budget`.
- A pre-existing `selective-verification.test.ts` assertion received `timeout` instead of `runtime-exception`.

With all 12 logical CPUs saturated by busy loops, a single golden run still passed 42/42. So the risk to normal single-suite CI on 2–4 vCPU runners is low but **unverified**. Options, for a maintainer decision:
- run golden cases with a larger `--timeout` (fixtures with deliberate infinite loops then get slower);
- run the golden file without file parallelism;
- accept the risk and watch CI.

The 20 ms budget's load-sensitivity is pre-existing (it affects older tests too). The golden snapshots make it visible rather than causing it.

---

## 5. Git and diff review

| Check | Result |
| :--- | :--- |
| Unrelated changes | **None.** Every one of the 88 changed or new files maps to a Batch 1 item and is assigned to exactly one commit (§6) |
| Accidental generated files | **None.** No `dist/`, `.tgz`, `.log`, `.map`, coverage or cache files. `test/fixtures/project/dist/ignored.ts` is an intentional fixture (§3.3 of the Phase 5 report). `node_modules/.cache` is ignored |
| Secrets | **None** (scan for GitHub/npm/AWS/Slack/OpenAI token patterns, private keys, e-mail). No machine-specific absolute paths outside `audit/`; the Phase 5 report only mentions a relative scratch-directory name |
| Historical benchmark data | **Unchanged** (`git diff -- benchmarks/reviews benchmarks/results benchmarks/corpus.json` is empty) |
| Audit reports | Phases 1–4 **unchanged** (SHA-256 verified against the pre-Phase-5 hashes). Phase 5 report unchanged during this review |
| Package version | **Unchanged** (`0.1.0`; no `version` line in the `package.json` diff) |
| Dependency changes | Only the intended removal of `ora` and its 17 transitive packages, plus npm's correction of stale lockfile root metadata (`name`, `engines`). No other version changes |
| Line endings | No churn: `.gitattributes` matches the existing LF index (all files stored LF) |

---

## 6. Commit preparation (not executed)

### 6.1 Why the series differs from the Phase 5 report (R-7)

Phase 5's commit 4 (golden snapshots) needed the **pre-L-1** versions of three snapshots, which exist only in the session scratchpad. The series below puts the two fixes **before** the golden snapshots, so every commit uses only the final repository content. The proof that the snapshots match the original, pre-change behavior is the 36/36 comparison documented in the Phase 5 report §3.4.

### 6.2 Verification

I replayed the series in a scratch repository cloned from `585af3d`, then checked out each commit fresh with no `dist/` and ran the full suite:

| Commit | Tests on fresh checkout |
| :--- | :--- |
| C1 docs | 340 / 340 (after `npm run build`; this commit predates build-independent tests) |
| C2 chore/test infra | 342 / 342, no build |
| C3 locations | 363 / 363, no build |
| C4 deadline | 378 / 378, no build |
| C5 golden | 420 / 420, no build |
| C6 CI | **446 / 446**, no build |

The final replayed tree equals the working tree: **429 files, 0 content differences**, excluding this report, which joins C1.

### 6.3 Exact commands, boundaries and messages

Create the branch first:

```bash
git switch -c reliability-reset/batch-1
```

**C1 — docs**

```bash
git add README.md docs/benchmark.md benchmarks/KNOWN_LIMITATIONS.md \
  audit/PHASE-1-REPOSITORY-INTELLIGENCE.md audit/PHASE-2-FINDINGS-VALIDATION.md \
  audit/PHASE-3-REMEDIATION-DESIGN.md audit/PHASE-4-IMPLEMENTATION-READINESS.md \
  audit/PHASE-5-BATCH-1-IMPLEMENTATION-REPORT.md audit/PHASE-5.5-FINAL-REVIEW.md
git commit -F- <<'EOF'
docs: add reliability-reset notice and independent audit reports

State the current verification and release limitations in the README,
docs/benchmark.md and benchmarks/KNOWN_LIMITATIONS.md: the published
npm 0.1.0 predates Selective Runtime Verification and the Phase 23
classification fixes; runtime verification only supplies the first
Server Action argument and can label unexecuted actions FULL; and the
benchmark figures are historical, payload-level and pre-correction.

Historical benchmark data and review records are unchanged.

Adds the Phase 1-5.5 audit reports that the notices link to.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**C2 — chore/test infrastructure**

```bash
git add .gitattributes .gitignore package.json package-lock.json \
  src/version.ts src/cli.ts src/output/schema.ts vitest.config.ts \
  test/setup/build-dist.ts test/helpers/test-build.ts test/cli.test.ts \
  test/release.test.ts test/helpers/perf-harness.ts \
  test/fixtures/project/dist/ignored.ts test/fixtures/project/node_modules/ignored.ts
git commit -F- <<'EOF'
chore: build-independent tests and repository hygiene

Tests no longer read a prebuilt dist/: a Vitest globalSetup compiles
src/ into node_modules/.cache/sis-test-build, mirroring the package
layout, and benchmark imports of ../dist/index.js resolve to src/ under
Vitest. A fresh clone can run `npm ci && npm test`.

Track test/fixtures/project/{dist,node_modules}/ignored.ts, which
.gitignore had silently excluded, leaving the default-ignore tests
without input on fresh clones and in CI.

Hygiene: read the version from package.json in one place
(src/version.ts), normalize line endings with .gitattributes, remove
the unused ora dependency, and exclude source maps and the empty
analyzer/fuzzer/sandbox placeholders from the package (299 -> 147
files). npm also corrected stale lockfile root metadata.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**C3 — Unicode locations**

```bash
git add src/parser/location.ts test/location.test.ts
git commit -F- <<'EOF'
fix: map SWC UTF-8 byte offsets to correct source locations

SWC reports 1-based UTF-8 byte positions and excludes a leading BOM;
SourceMapLocator indexed them as UTF-16 positions, so columns and
sometimes lines were wrong after non-ASCII text, and columns were off
by one in BOM-prefixed files. Build per-line UTF-8/UTF-16 tables and
convert byte offsets to 1-based lines and UTF-16 code-unit columns.

Every location producer (findings, actions, taint sinks,
verifiedPrefix, stoppedAt, SARIF regions) uses this mapper.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**C4 — wall-clock deadline**

```bash
git add src/runtime/worker.ts src/runtime/types.ts test/runtime-deadline.test.ts
git commit -F- <<'EOF'
fix: bound sandbox executions with a wall-clock deadline

V8's CPU timeout does not cover time spent waiting on promises that
never settle, so an action awaiting such a promise hung the audit
indefinitely. Race the whole isolate lifecycle against a host-side
deadline (default max(10 x timeoutMs, 1000ms)); on expiry dispose the
isolate and record the execution as execution-error, which is never
reported as a finding. All other outcomes are classified as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**C5 — golden snapshots**

```bash
git add test/golden.test.ts test/helpers/golden.ts test/fixtures/golden test/__golden__ CONTRIBUTING.md
git commit -F- <<'EOF'
test: add golden CLI output snapshots

Pin terminal, JSON and SARIF output, finding identifiers, runtime
summaries and exit codes for 13 targets and 3 error cases (42
snapshots). New fixtures under test/fixtures/golden/ reproduce audited
defects that are still under remediation, so later behavior changes
show up as explicit snapshot diffs. Only host paths and measured
durations are normalized.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

**C6 — CI**

```bash
git add .github/workflows/ci.yml .github/workflows/benchmark.yml \
  scripts/ci/check-native.mjs scripts/ci/smoke.mjs scripts/validate-benchmark-inputs.mjs \
  test/benchmark-inputs.test.ts CHANGELOG.md
git commit -F- <<'EOF'
ci: add Linux and Windows CI and harden the benchmark workflow

Add a push/PR workflow (ubuntu-latest and windows-latest, Node 24;
non-blocking Node 26 and --no-node-snapshot observation jobs) that
installs, type-checks, runs the suite before any build, builds, smoke
tests the CLI, checks the package contents and lints workflows with a
checksum-verified actionlint. Read-only token, SHA-pinned actions,
persist-credentials disabled.

Pass benchmark workflow_dispatch inputs only through environment
variables and validate them before use; set read-only permissions and
pin actions by SHA.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

After C6, `git status` should report a clean working tree.

### 6.4 Exclusions

- **Nothing in the working tree should be excluded.** All 88 changed or new files belong to the series, plus this report in C1.
- **Never add:** `dist/`, `node_modules/` (including `node_modules/.cache/sis-test-build`), or any `*.tgz`. All are ignored, and staging by explicit paths as above avoids them.
- **Not part of the repository:** the session-scratch artifacts (`p5-baseline/`, `p5-verify/`, `p55/`).

### 6.5 Final acceptance checklist (before and after push)

**Before committing:**
- [ ] Maintainer accepts the limitations R-1 … R-7, or asks for R-1/R-2 (test-cache concurrency and watch mode) to be fixed first as a small Batch 1.1.
- [ ] `npm ci && npm test` passes locally (446/446) with no other Vitest process running.
- [ ] `npx tsc --noEmit -p .` and `npm run build` succeed.
- [ ] `git status` shows only the 88 + 1 files listed in §6.3.

**After pushing (approval required):**
- [ ] CI `Test (ubuntu-latest, Node 24)` and `Test (windows-latest, Node 24)` pass, including golden snapshots on Linux (first cross-platform comparison).
- [ ] `workflow-lint` (actionlint + shellcheck) passes; fix any reported issues before Batch 2.
- [ ] Note the observation results (Node 26; `--no-node-snapshot` accepted in `NODE_OPTIONS`?) without making support claims.
- [ ] The README CI badge resolves.
- [ ] Watch the first CI runs for R-3 (timing flips) and R-4 (load failures).
- [ ] npm remains at `0.1.0`; no tag created.

---

## 7. Decision

The product changes (deadline, locations), package contents, documentation and commit series are verified. The limitations found are confined to the test infrastructure (concurrent and watch-mode use of the shared test build, load sensitivity of the 20 ms budget) and to latent packaging hygiene. They don't affect product behavior or the single-process CI the batch introduces, and each is documented with a fix path. The original intermittent failure remains unresolved, with a plausible, reproduced mechanism.

**APPROVED WITH DOCUMENTED LIMITATIONS**
