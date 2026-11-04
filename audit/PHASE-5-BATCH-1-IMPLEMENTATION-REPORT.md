# SIS — Phase 5: Reliability Reset, Implementation Batch 1

| | |
| :--- | :--- |
| **Base commit** | `585af3d` on `master` (upstream `origin/main`; remote `main` is `cbd7d8e`, +2 docs-only commits; see Phase 2 V-R2) |
| **Specification** | Phase 4 corrected 29-step sequence, items 1–7, with the acceptance criteria in `audit/PHASE-4-IMPLEMENTATION-READINESS.md` §9.5 |
| **Date** | 2026-11-01 |
| **Environment** | Windows 11 x64, Node v24.19.0 (ABI 137), npm 11.17.0, isolated-vm 7.0.1 |
| **State** | All changes are **uncommitted** in the working tree. Nothing was committed, pushed, tagged or published. npm still lists only `0.1.0` (modified 2026-09-10). |

---

## 1. Summary

The seven Batch 1 items are implemented, each with tests:

| # | Item | Result |
| :-: | :--- | :--- |
| 1 | Documentation notice (R-0) | Done |
| 2 | Repository hygiene (R-1) | Done |
| 3 | Tests independent of `dist/` (R-2a) | Done, verified on clean clones |
| 4 | Golden output snapshots (R-2b) | Done, verified identical to pre-change output |
| 5 | Wall-clock execution deadline (S-0, V-26) | Done |
| 6 | Linux and Windows CI (R-5) | Workflows written; **not executed** (needs a push) |
| 7 | Unicode source locations (L-1, V-12) | Done |

The suite grew from 340 to **446 tests (28 files), all passing**. Type-check and production build are clean.

Clean-checkout verification found and fixed one pre-existing defect: two default-ignore fixture files had never been committed, so the ignore tests were vacuous in CI.

**Open items:**
- CI has not run, because that needs a push. Local `actionlint` was not run: downloading the binary was denied by the permission policy. It runs in the new CI job instead.
- An intermittent Vitest load failure was seen twice and is unresolved (§7).

---

## 2. Step 0 — Baseline

| Check | Result |
| :--- | :--- |
| `git status` | Clean apart from the four untracked audit reports |
| HEAD / branch / upstream | `585af3d885bbadeb74709c6d2fd675c327fa65c2` / `master` / `origin/main` |
| Audit reports | Phases 1–4 present; SHA-256 recorded before any change (§9) |
| Index line endings | All 359 tracked files stored LF (`git ls-files --eol`); working tree CRLF via `core.autocrlf=true` |
| Type-check | `tsc --noEmit` exit 0 |
| Build | `npm run build` exit 0 |
| Tests | 24 files, **340 passed** |
| Package | `npm pack --dry-run`: 299 files, 785.4 kB unpacked |
| Output formats / exit codes | Raw terminal, JSON and SARIF output for 12 targets captured **twice** from the original build. Only timing fields differed between runs. Exit codes: `project` 1, `next-boundaries` 1, `real-world/runtime` 1, `empty-project` 0, single file 1, `two-param` 1, `return-function` 1, `dynamic-import` 1, `helper-dependent` 0, `export-shapes` 0, `unicode-prefix` 0, `route-under-api` 1 |
| npm release state | `@aashirzayd/sis` `0.1.0` only; untouched |

---

## 3. Changes implemented

### 3.1 Documentation notice (R-0)

- **`README.md`**
  - A `[!WARNING]` notice after the quick-start covers three things: the published-package gap, incomplete runtime verification, and the benchmark figures being historical and pre-correction.
  - Qualifiers sit next to every historical benchmark claim (headline, Phase 24 table, review table, evolution table, precision formulas, commerce section). The historical figures themselves are unchanged.
  - Inaccurate pipeline claims are corrected: `.gitignore` is not read; preludes on `main` vs static-only in 0.1.0; fingerprints are benchmark-only, truncated SHA-256, and payload-specific.
  - Defaults are corrected: `--runs` gives 25 when omitted, and the seed is unseeded.
  - New limitation #8.
  - The development steps now read `npm ci` → `npm test` (no build needed) → `npm run build`.
  - The stale "284 passed" badge is replaced by a CI badge.
- **`docs/benchmark.md`**: a historical/pre-correction `[!WARNING]` header plus qualifiers on the TP section and the precision section.
- **`benchmarks/KNOWN_LIMITATIONS.md`**: the framework-globals row and compatibility-gate bullets are corrected (`:35`, `:40`), and `FULL` is described as a static prediction.
- **`CONTRIBUTING.md`**: setup order, plus golden-snapshot update rules.
- **`CHANGELOG.md`**: an `[Unreleased]` section.

Nothing claims unsupported functionality or unestablished precision. `test/docs.test.ts` still asserts the historical headline sentence verbatim; it's kept as the historical record, with the qualifier directly below it.

### 3.2 Repository hygiene (R-1)

- **`src/version.ts`** (new) reads the version from `package.json` at runtime. `src/cli.ts` and `src/output/schema.ts` use it, removing two hard-coded copies.
- **`.gitattributes`** (new): `* text=auto eol=lf`, plus binary patterns.
- **`package.json`** `files`: `["dist", "!dist/analyzer", "!dist/fuzzer", "!dist/sandbox", "!dist/**/*.map"]` (D13).
- **`ora` removed** via `npm uninstall`. The lockfile change removes exactly ora's 17-package subtree. npm also corrected two pre-existing **stale lockfile metadata fields**: the root `name` (`sis` → `@aashirzayd/sis`) and `engines` (`>=18` → `>=24.0.0`). No other package versions changed. isolated-vm still loads; npm did not re-run its install script.

### 3.3 Tests independent of `dist/` (R-2a)

- **`test/setup/build-dist.ts`** (new, Vitest `globalSetup`) compiles `src/` with the production `tsconfig.json` into `node_modules/.cache/sis-test-build/dist` and copies `package.json` beside it, reproducing the tarball layout. A compile error fails the run.
- **`test/helpers/test-build.ts`** (new) is the shared location constant.
- **`vitest.config.ts`** gains the global setup and an alias mapping `../dist/index.js` (imported by `benchmarks/*.ts`) to `src/index.ts` under Vitest only. `npm run benchmark` still uses the real `dist/`.
- **`test/cli.test.ts`** runs the test build's CLI. **`test/release.test.ts`** checks entrypoints in the test build. **`test/helpers/perf-harness.ts`** imports `src/`.
- **`.gitignore`** re-includes `test/fixtures/project/dist/` and `test/fixtures/project/node_modules/`. **Defect found by clean-checkout verification:**
  - These two fixture files (`ignored.ts`, "should be excluded by default") existed only in the local working copy. The repo's `dist/` and `node_modules/` rules had kept them out of git.
  - So the default-ignore assertions in `test/discovery.test.ts:95` had no input on fresh clones or in CI.
  - The golden `project` snapshot captured from the local tree (`filesScanned: 10`) also failed on a clean clone (`8`).
  - Fix: the files are now trackable. The root `dist/` and `node_modules/` are still ignored (verified with `git check-ignore`).

### 3.4 Golden output snapshots (R-2b)

- **`test/golden.test.ts`** (new) runs the test-build CLI for **42 cases**:
  - 12 targets × {terminal, JSON, SARIF};
  - the never-settling fixture × 3;
  - three error/exit-code cases: missing target, conflicting `--json --sarif`, `--runs 0`.

  Each snapshot records the command, exit code, normalized stdout and normalized stderr in `test/__golden__/<case>.txt`.
- **`test/helpers/golden.ts`** (new) normalizes **only** the absolute repo path, measured durations (`executionMs`, `wallTimeMs`, `durationMs`, terminal "Wall time"/"Execution"), CRLF and ANSI codes. Budgets such as `timeoutMs` and "20ms budget" are kept.
- **New fixtures** `test/fixtures/golden/*` reproduce the Phase 2/4 defect shapes: two-param (V-01), return-function and dynamic-import (V-02), helper-dependent and export-shapes (V-03/V-27), unicode-prefix (V-12), route-under-api (V-07), and never-settling (V-26, added with S-0).
- **Baseline proof:** the 36 fixture snapshots were generated before any `src/` change and are **byte-identical (36/36)** to the normalized raw outputs captured from the original build in Step 0 (`compare.mjs`).
- **CI protection:** with `CI=true`, a missing snapshot fails and isn't written (verified by hiding `two-param.json.txt`).

### 3.5 Wall-clock execution deadline (S-0, V-26)

**`src/runtime/worker.ts`:**

- The execution lifecycle (isolate creation, context, payload transfer, compile, run, promise settlement, result copy) now runs as `executeLifecycle()`, which never rejects. It races a **host-side** `setTimeout` deadline.
- When the deadline fires, the timer disposes the isolate. Disposal aborts both pending promises ("Promise was abandoned") and CPU-bound code. The execution is recorded with the existing non-finding status `execution-error`, error name `WallClockDeadlineError`.
- A lifecycle that settles late is ignored, and its rejection is consumed.
- Resources are released once, in the caller's `finally`.
- The timer is never visible to the isolate, and nothing new is exposed to it.

Defaults and behavior preserved:

- `resolveWallDeadlineMs()`: the default is `max(10 × timeoutMs, 1000ms)`. An explicit `wallTimeoutMs` (new optional field in `RuntimeExecutionOptions`, `src/runtime/types.ts`) is honored exactly; non-positive or non-finite values throw `RangeError`.
- Classification of every other outcome is **unchanged**. The 39 existing golden snapshots were identical before and after S-0.
- The shrinker inherits the deadline through `runInIsolate`.

**Correction made during implementation.** The first draft clamped explicit deadlines to `timeoutMs + 1`, which silently turned `{timeoutMs: 60000, wallTimeoutMs: 300}` into a 60 s deadline. The tests caught it and the clamp was removed. The documentation now states that a deadline below the CPU budget makes CPU-bound loops end as infrastructure outcomes.

### 3.6 Unicode source locations (L-1, V-12)

**`src/parser/location.ts`** keeps the same public API (`new SourceMapLocator(file, source)`, `getLocation()`).

**Empirically measured before implementing:**
- SWC positions are **1-based UTF-8 byte offsets**;
- SWC **excludes a leading BOM**;
- lone surrogates count as 3 bytes (U+FFFD, matching Node's encoder);
- CRLF needs no special handling.

**Implementation:**
- Per-line tables of UTF-8 byte offsets and UTF-16 indices, with an ASCII fast path.
- Non-ASCII lines are converted by walking code points; a position inside a multi-byte character maps to that character.
- Columns are **1-based UTF-16 code units** (JavaScript and editor convention). The BOM isn't counted.
- Every location producer (findings, actions, taint sinks, `verifiedPrefix`, `stoppedAt.line`, SARIF regions) goes through this one class, so the fix applies everywhere at once.

### 3.7 CI (R-5)

- **`.github/workflows/ci.yml`** (new):
  - **Triggers and policy:** push to `main`, pull requests and manual dispatch; `permissions: contents: read`; concurrency cancellation; actions SHA-pinned (`checkout` v4.4.0 `11d5960a…`, `setup-node` v4.4.0 `49933ea5…`, both resolved from GitHub's own run log and verified against the action repositories); `persist-credentials: false`; bash on every OS.
  - **Required jobs:** `ubuntu-latest` and `windows-latest` × Node 24.
  - **Non-blocking observation jobs:** Ubuntu × Node 26, and Ubuntu × `NODE_OPTIONS=--no-node-snapshot`.
  - **Steps:** report runtime and ABI → `npm ci` → native isolated-vm check → type-check → assert no `dist/` → **`npm test` before any build** (the clean-checkout guarantee) → targeted deadline and location tests → production build → CLI smoke test → `npm pack --dry-run`.
  - **`workflow-lint` job:** downloads `actionlint` 1.7.12, verifies its SHA-256 against the release checksums, and lints all workflows (shellcheck is preinstalled on Ubuntu runners).
- **`scripts/ci/check-native.mjs`** (new): loads isolated-vm, evaluates code, and verifies the CPU timeout is enforced.
- **`scripts/ci/smoke.mjs`** (new): `--version` parity; real sandbox execution (executions, passes and failures > 0, exit 1); the never-settling audit completes with no runtime finding.
- **`.github/workflows/benchmark.yml`** (hardened, V-18):
  - workflow-level `permissions: contents: read`;
  - SHA-pinned actions (including `upload-artifact` v4.6.2 `ea165f8d…`);
  - `persist-credentials: false`;
  - inputs passed **only** through `env:` to **`scripts/validate-benchmark-inputs.mjs`** (new), which accepts an exact corpus name, `all`, or empty for `repo`, and digits only for `runs`/`seed`;
  - the orchestrator step uses the validated step outputs through environment variables.

  No `${{ }}` remains inside any `run:` script. Behavior is unchanged for valid inputs, but the workflow `repo` input is now **exact-match** (case-insensitive) instead of the orchestrator's substring match.
- No release or publish permissions exist or were added. No macOS job and no platform-support claim was added.

---

## 4. Files modified

**Modified (18):**
- `.github/workflows/benchmark.yml`
- `.gitignore`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `benchmarks/KNOWN_LIMITATIONS.md`
- `docs/benchmark.md`
- `package-lock.json`
- `package.json`
- `src/cli.ts`
- `src/output/schema.ts`
- `src/parser/location.ts`
- `src/runtime/types.ts`
- `src/runtime/worker.ts`
- `test/cli.test.ts`
- `test/helpers/perf-harness.ts`
- `test/release.test.ts`
- `vitest.config.ts`

**Added:**
- `.gitattributes`
- `.github/workflows/ci.yml`
- `scripts/ci/check-native.mjs`
- `scripts/ci/smoke.mjs`
- `scripts/validate-benchmark-inputs.mjs`
- `src/version.ts`
- `test/setup/build-dist.ts`
- `test/helpers/test-build.ts`
- `test/helpers/golden.ts`
- `test/golden.test.ts`
- `test/runtime-deadline.test.ts`
- `test/location.test.ts`
- `test/benchmark-inputs.test.ts`
- `test/__golden__/*.txt` (42 files)
- `test/fixtures/golden/**` (8 fixtures)
- `test/fixtures/project/dist/ignored.ts` and `test/fixtures/project/node_modules/ignored.ts`: pre-existing local files, newly trackable
- `audit/PHASE-5-BATCH-1-IMPLEMENTATION-REPORT.md`

**Not modified:**
- `benchmarks/reviews/ground-truth.json` and every `benchmarks/results/*` file (historical evidence);
- the Phase 1–4 audit reports (hash-verified);
- `tsconfig.json`;
- all other `src/` files.

---

## 5. Tests added (106 new; 340 → 446)

| File | Tests | Covers |
| :--- | :-: | :--- |
| `test/golden.test.ts` | 42 | Terminal/JSON/SARIF output, finding IDs, runtime summaries, exit codes |
| `test/runtime-deadline.test.ts` | 15 | Default and explicit deadlines and validation; never-settling promise; slow-but-settling chains; sync loop (still `timeout`); late termination of a CPU-bound loop; returned Proxy with a looping trap (CPU-bound and wall-bound); trap-free Proxy; app code replacing `setTimeout`/`Date.now`; no host timers or privileged globals exposed; host event-loop responsiveness; repeated and concurrent executions after termination; no unhandled rejections; full audit records stalled executions as unsupported, not findings |
| `test/location.test.ts` | 21 | 14 source shapes (ASCII, 2/3/4-byte, non-Latin scripts, same-line prefix, 40-CJK line shift, many lines, literals, CRLF, LF, BOM, BOM+multibyte, lone surrogate); offsets inside multi-byte characters; astral = 2 units; clamping; ASCII identical to old behavior; `verifiedPrefix` and `stoppedAt.line`; JSON + SARIF locations of runtime and taint findings; terminal `file:line` |
| `test/benchmark-inputs.test.ts` | 26 | Defaults; every corpus name; 9 malicious `repo` values (command substitution, `;`, quotes, newline, `${GITHUB_TOKEN}`, path traversal, substring); 8 bad `runs`; 6 bad `seed`; CLI exit status |
| `test/release.test.ts` (+2) | 2 | Version parity (CLI, `TOOL_VERSION`, `SIS_VERSION`, `package.json`); `files` exclusions and no `ora` |

**Regression proof.** The new location tests encode behavior the old code got wrong. For example, the prefix test case on the original `585af3d` build yields `verifiedPrefix 5:23–6:20` and `stoppedAt.line 7`; the correct values are `5:3–5:32` and line 6. The deadline tests hang on the old worker: Phase 4 measured `runInIsolate` still pending after 5 s.

---

## 6. Before / after

| Measure | Before (`585af3d`) | After (working tree) |
| :--- | :--- | :--- |
| Test files / tests | 24 / 340 passing | 28 / **446 passing** |
| Fresh clone, `npm test` before build | **5 files fail** (33 tests), 3 suites don't load (Phase 2) | **445/445 pass**¹ in clones made with `autocrlf=true` and `false`; tests don't create `dist/` |
| Fresh clone, `npm test` after build | 340 pass | 445/445 pass¹ |
| Default-ignore fixtures in a clean checkout | Missing (tests vacuous) | Present (tracked) |
| `dist/` byte-identical across line-ending configs | No (CRLF in template-literal code on Windows checkouts) | **Yes**: tree hash `c328763cc8932e20` for both clones, no CR bytes |
| Never-settling action | Audit hangs indefinitely | Terminated at the deadline (≈1 s per payload by default); counted `unsupported`; exit unchanged |
| Location after 1 line of non-ASCII text | Column +6 to +14; wrong line after 40 CJK chars | Exact |
| Location in BOM-prefixed files | Column −1 | Exact |
| npm package | 299 files, 785 kB, with maps and placeholders | 147 files, 465 kB |
| Version sources | 3 hard-coded | 1 (`package.json`) |
| Push/PR CI | None | `ci.yml` (not yet run) |
| Benchmark workflow | `${{ inputs }}` interpolated into shell, default token, tag-pinned | env-only + validated, `contents: read`, SHA-pinned |

¹ 445 = the suite at the time of the clean-clone runs. The final prefix-location test was added afterwards; the in-repo total is 446.

**Intentional golden snapshot changes (all from L-1; nothing else changed):**

| Snapshot | Field(s) | Old → new | Why |
| :--- | :--- | :--- | :--- |
| `unicode-prefix.json` | `actions[0].column` | 37 → 23 | Line 3 contains `Ünïcödé`, `漢字` and `🚀`: +14 UTF-8 bytes. True position of `describe` is 6:23 |
| `single-file-fragile-action.json` | 3 × `column` | 22 → 23 | `test/fixtures/fragile-action.ts` starts with a BOM, which SWC excludes. True position of `executeTransfer` is 9:23 |
| `single-file-fragile-action.sarif` | 2 × `startColumn` | 22 → 23 | Same as above |

New snapshots added after S-0: `never-settling.{terminal,json,sarif}`. There's no earlier baseline because the old runtime never returned for that fixture. They record the current, still-incomplete policy: exit 0, "2 unsupported", "0 verified findings".

Pre-update copies of all snapshots are preserved in the session scratchpad (`p5-baseline/golden-before-L1/`).

---

## 7. Acceptance criteria status (Phase 4 §9.5)

| Item | Status | Evidence / notes |
| :--- | :--- | :--- |
| **R-0** | **Met** | No unqualified "9 confirmed true positives" or "100% emitted precision"; unreleased features marked; defaults described as implemented; `KNOWN_LIMITATIONS.md:35,40` corrected. Docs and site tests pass. **Deviation:** the change set isn't `*.md`-only, because R-0 shares the working tree with the other items. The R-0 commit in §10 contains only Markdown files. |
| **R-1** | **Met** | Version parity test passes. `npm ls ora` is empty. `.gitattributes` present; byte-identical, CR-free builds from `autocrlf=true` and `false` clones (same tree hash). `npm pack --dry-run`: 0 maps, 0 placeholder files. All pre-existing tests pass. |
| **R-2a** | **Met** | Fresh clones (`autocrlf` true and false) with no `dist/`: `npm test` passes 445/445¹ and doesn't create `dist/`. Working-tree `dist/` moved aside: 24/24 files pass. |
| **R-2b** | **Met, with one documented deviation** | All listed fixtures snapshotted, including the new Phase 2 shapes. Baseline proven identical to the original build (36/36). Only timing fields are normalized. Snapshots capture known-defective behavior, labeled with V-IDs in the fixtures and the test header. **Deviation:** Phase 4 expected L-1 to change *only the unicode fixture*. It also changed `single-file-fragile-action` (BOM off-by-one). Both are V-12 corrections in location fields only (§6). |
| **S-0** | **Met** | A never-settling fixture terminates with status `execution-error` (non-finding); unrelated snapshots unchanged; isolate disposed; no unhandled rejections; the process exits normally. **Deviation (by instruction):** Phase 4 suggested asserting "< `wallMs` + 500 ms". Phase 5 requires generous margins, so tests assert < 10 s. Measured: about 1.1 s per payload with the 1 s default (smoke test: 2 payloads in 2.19 s). The tests are in `test/runtime-deadline.test.ts`, not `test/runtime.test.ts`. |
| **R-5** | **Partially met. Blocker: CI cannot run without a push.** | Workflows written with least privilege, SHA pins, env-only inputs and a tested validator; static checks pass (no tabs, no `${{ }}` in `run:`, all actions pinned, permissions declared). **Not done:** (1) **CI has not executed**; (2) **`actionlint` not run locally**: downloading the binary was denied by the permission policy, and I didn't work around it. It runs in the `workflow-lint` job. (3) Phase 4's ARM-Linux, macOS-ARM and Alpine observation jobs weren't added, because Phase 5 scopes CI to Linux and Windows and excludes macOS. (4) README platform text is unchanged: no green CI job exists yet to support a "tested in CI" statement. |
| **L-1** | **Met** | Every Phase 2 location-table row is correct (parameterized test). `verifiedPrefix` and `stoppedAt.line` are verified. JSON, SARIF and terminal locations are verified. Snapshot changes are location-only (deviation noted under R-2b). |

---

## 8. Known limitations

1. **CI is unverified.** Neither workflow has run. Not yet established on Linux:
   - golden snapshot equality across platforms (the snapshots were generated on Windows; paths, ordering and messages are normalized or expected to match, but that's unproven);
   - whether `--no-node-snapshot` is accepted inside `NODE_OPTIONS` (observation job);
   - the shellcheck findings `actionlint` may report.
2. **Intermittent Vitest load failure (unresolved).**
   - **Observed:** in 2 of about 14 runs, Vitest failed to load test files ("Vitest failed to find the runner"; the second time, all 28 files reported "no tests").
   - **Context:** both occurrences followed edits to test files.
   - **Not observed:** in 7 consecutive full runs afterwards, in both clean-clone runs, or with another Vitest process running (none was).
   - **Unknowns:** the full error output wasn't captured, and the root cause is unknown. No retry or masking was added.
3. **Fixed test-build directory.** Two concurrent `npm test` runs in the same checkout would race on `node_modules/.cache/sis-test-build`.
4. **Deadline classification is a stopgap.** Stalled executions map to the legacy `execution-error` status (counted as `unsupported`). A directory where every execution stalls still exits 0. The `app-stalled` outcome and the exit-code policy come in later batches (A-1/A-2, B-6c).
5. **Explicit `wallTimeoutMs` below `timeoutMs`** makes CPU-bound loops infrastructure outcomes. This is documented. There's no CLI flag, so only library callers can set it.
6. **SARIF doesn't declare `columnKind`.** Columns are UTF-16 code units. Declaring `run.columnKind: "utf16CodeUnits"` would change every SARIF snapshot, so it's deferred.
7. **`--help` still says the `--runs` default is 10.** The actual default is 25 (V-19, scheduled with the precision cleanups). The README now states both.
8. **The published package is unchanged:** users of `npx @aashirzayd/sis` get none of these fixes.

---

## 9. Regressions and integrity checks

- **No functional regressions found.** All pre-existing tests pass unmodified, apart from the path changes needed for R-2a in `cli.test.ts`, `release.test.ts` and `perf-harness.ts`; no assertion was weakened.
- **User-visible behavior changes (intended):**
  - stalled executions now terminate;
  - columns (and, rarely, lines) change after non-ASCII text or a BOM;
  - the package no longer contains source maps, so stack traces point into `dist/`;
  - the lockfile metadata is corrected.
- **Audit reports Phases 1–4:** SHA-256 unchanged (`sha256sum -c`: 4 × OK).
- **Historical benchmark data:** untouched.
- **Git:** HEAD `585af3d`; no commits, tags or stashes created; no push. The working tree shows only the intended 18 modified and the new files, with no line-ending churn.
- **npm:** `versions: ["0.1.0"]`, `time.modified 2026-09-10T21:22:32Z`; unchanged.

---

## 10. Deferred work

- **Next per the Phase 4 sequence:** item 8 onward (A-1 outcome types, A-2 hardened envelope, …).
- **Prerequisites before Batch 2:** a push to run CI; triage of the first CI results (cross-platform golden equality; `actionlint`/shellcheck); D1, D3–D7, D14–D16 for later batches.
- **Carried over:** the SARIF `columnKind`, `--help` default text, and observation jobs for ARM Linux, macOS and Alpine once approved; a per-run test-build directory if concurrent runs matter; root-causing the intermittent Vitest load failure.

---

## 11. Commit recommendation

Create a branch from `master` (for example `reliability-reset/batch-1`). Then commit **with explicit approval**, either as a single commit or as the series below. Every commit should end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Recommended series** (each commit builds and tests green, given the note on commit 4):

1. `docs: add reliability-reset notice and audit reports`
   - Files: `README.md`, `docs/benchmark.md`, `benchmarks/KNOWN_LIMITATIONS.md`, `audit/PHASE-1…PHASE-5*.md`. The README links to the audit reports, so they belong in this commit.
2. `chore: single-source version, LF normalization, drop unused ora, trim package files`
   - Files: `src/version.ts`, `src/cli.ts`, `src/output/schema.ts`, `.gitattributes`, `package.json`, `package-lock.json`.
3. `test: run tests against a fresh build of src/ instead of dist/`
   - Files: `vitest.config.ts`, `test/setup/build-dist.ts`, `test/helpers/test-build.ts`, `test/cli.test.ts`, `test/release.test.ts`, `test/helpers/perf-harness.ts`, `.gitignore`, `test/fixtures/project/dist/ignored.ts`, `test/fixtures/project/node_modules/ignored.ts`.
4. `test: add golden output snapshots of current CLI behavior`
   - Files: `test/golden.test.ts`, `test/helpers/golden.ts`, `test/fixtures/golden/*` (except `never-settling`), `test/__golden__/*` (except `never-settling.*`), `CONTRIBUTING.md`.
   - For a green build at this commit, use the **pre-L-1** versions of `unicode-prefix.json.txt`, `single-file-fragile-action.json.txt` and `single-file-fragile-action.sarif.txt` from `p5-baseline/golden-before-L1/`.
5. `fix: bound sandbox executions with a wall-clock deadline (V-26)`
   - Files: `src/runtime/worker.ts`, `src/runtime/types.ts`, `test/runtime-deadline.test.ts`, `test/fixtures/golden/never-settling/`, `test/__golden__/never-settling.*`.
6. `fix: map SWC UTF-8 byte offsets to correct source locations (V-12)`
   - Files: `src/parser/location.ts`, `test/location.test.ts`, the three updated snapshots (final versions).
   - The commit body lists the three snapshot changes from §6.
7. `ci: add Linux/Windows CI and harden the benchmark workflow (V-18)`
   - Files: `.github/workflows/ci.yml`, `.github/workflows/benchmark.yml`, `scripts/ci/*`, `scripts/validate-benchmark-inputs.mjs`, `test/benchmark-inputs.test.ts`, `CHANGELOG.md`.

**Simpler alternative:** a single commit, `chore: reliability reset batch 1 (docs notice, hygiene, build-independent tests, golden snapshots, wall-clock deadline, unicode locations, CI)`, with this report linked in the body.

Push only after approval, then confirm that the required CI jobs (Ubuntu and Windows, Node 24) and `workflow-lint` pass before starting Batch 2.
