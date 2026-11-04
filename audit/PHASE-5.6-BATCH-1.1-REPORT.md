# SIS — Phase 5.6: Batch 1.1 — Test Isolation, Watch Correctness, Packaging Hygiene

| | |
| :--- | :--- |
| **Base** | Batch 1 working tree on `master` at `585af3d`, reviewed in `audit/PHASE-5.5-FINAL-REVIEW.md` (verdict: approved with documented limitations) |
| **Scope** | R-1 (concurrent test builds), R-2 (watch mode uses current source), stale `dist/` before `prepack` (Phase 5.5 R-5) |
| **Date** | 2026-11-04 |
| **Environment** | Windows 11 x64, 12 logical CPUs, Node v24.19.0, Vitest 5.0.0, isolated-vm 7.0.1 |
| **State** | Uncommitted. Nothing was committed, pushed, tagged or published. npm still lists only `0.1.0`. SIS runtime semantics, analysis, findings, fingerprints and benchmark data are unchanged. |

---

## 1. Summary

All three fixes are implemented and **verified by execution**:

| Fix | Result |
| :--- | :--- |
| **R-1 isolation** | Each `vitest` process builds into its own `run-<pid>-<startedAtMs>` directory and receives the path through Vitest `provide`/`inject`. The exact Phase 5.5 reproduction (two concurrent unbounded `npm test` runs) now **passes, 459/459 each**, where it previously failed with `EPERM` / "failed to find the runner". |
| **R-2 watch mode** | A source change re-runs the CLI-based tests, and they run against a **fresh build of current `src/`**. Shown with a discriminating test and a negative control. |
| **Packaging** | `prepack` now runs `clean` (removes `dist/`) before `build`. A deliberately stale compiled file survives a plain build but is **absent** from `dist/` and from the tarball after `npm pack`. The tarball equals a clean build of current source plus the three package assets (147 = 147). |

The suite grew from **446 to 459 tests** (30 files).

**Open items, none caused by these fixes:**
1. A pre-existing **timing flake in golden snapshots** (Phase 5.5 R-3). It appeared in 2 of 7 ordinary single runs in the real repository and in 0 of 10 runs in scratch copies.
2. The **intermittent Vitest load failure** recurred once in the real repository. It's still unresolved.
3. The repository **index contains staged changes this session did not make**. They must be cleared before the commit plan is executed (§8).

---

## 2. Files changed (Batch 1.1 delta relative to the reviewed Batch 1 tree)

| File | Change | Purpose |
| :--- | :--- | :--- |
| `test/setup/paths.ts` | **new** | `REPO_ROOT`, `TEST_BUILD_PARENT`, and the type-only `ProvidedContext` augmentation. It has no runtime Vitest import, so the global setup can load it |
| `test/setup/build-dirs.ts` | **new** | Per-run directory helpers: `runDirName`, `parseRunDirName`, `isProcessAlive` (`process.kill(pid, 0)`), `pruneStaleRunDirs` (removes only directories of dead processes), `createRunDir` (refuses to adopt an existing directory), `removeRunDir` |
| `test/setup/build-dist.ts` | modified | Prunes stale run directories, creates this process's directory, builds into it, then `project.provide("sisTestBuildRoot", …)`. It also registers `project.onTestsRerun(() => buildInto(buildRoot))` (R-2), removes the directory on teardown, on initial-build failure and on process `exit` |
| `test/helpers/test-build.ts` | modified | `TEST_BUILD_ROOT = inject("sisTestBuildRoot")`. The export names (`REPO_ROOT`, `TEST_BUILD_ROOT`, `TEST_DIST`, `TEST_CLI`) are unchanged, so no consumer test changed |
| `vitest.config.ts` | modified | `watchTriggerPatterns`: a change under `src/**/*.ts` or to `tsconfig.json` re-runs the test files that import `helpers/test-build`, discovered by scanning `test/*.test.ts` |
| `scripts/clean-dist.mjs` | **new** | Removes `<package root>/dist`, resolved from the script's own location (never the cwd or arguments). It unlinks a symlinked `dist/` without following it, and refuses to run without a `package.json` |
| `package.json` | modified (+2 lines in `scripts`) | `"clean": "node scripts/clean-dist.mjs"`, `"prepack": "npm run clean && npm run build"`. `build` is still `tsc`. **Version unchanged** (`0.1.0`), no dependency change |
| `test/test-build-isolation.test.ts` | **new**, 7 tests | Naming and parsing; refusal to adopt; pruning removes only dead-owner run directories and leaves non-run entries; liveness detection; idempotent removal; this run's build is a live-owned run directory, not `dist/` |
| `test/clean-dist.test.ts` | **new**, 6 tests | Removes nested stale output and nothing else; ignores the cwd; no-op without `dist/`; unlinks a symlink (junction) without touching its target; refuses outside a package root; `prepack` wiring |
| `audit/PHASE-5.6-BATCH-1.1-REPORT.md` | **new** | This report |

Nothing else changed:
- `git diff -- benchmarks/reviews benchmarks/results benchmarks/corpus.json` is empty.
- No `src/` file changed in Batch 1.1.
- Phase 1–5 audit reports are hash-verified unchanged, and the Phase 5.5 report is unmodified.

---

## 3. Design notes

**Why per-process directories instead of a lock.** A shared directory with a lock still serializes concurrent runs and still risks Windows `EPERM` when one run deletes files another has open. Separate directories remove the shared mutable state entirely.
- The name embeds the owning pid and start time, so a directory can be attributed to a process.
- `createRunDir` uses a non-recursive `mkdir`, so a collision fails instead of adopting another run's output.
- `pruneStaleRunDirs` deletes only `run-*` directories whose owner is no longer alive. `EPERM` from `process.kill(pid, 0)` counts as alive.
- Nothing about this is random, and test behavior doesn't depend on the directory name. No golden snapshot contains the build path (verified: 0 of 42).

**Why `watchTriggerPatterns` as well as `onTestsRerun`.** The CLI tests run the built CLI as a *subprocess*, so `src/` isn't in their module graph, and a source edit never schedules them for a re-run. Rebuilding on re-run alone is therefore not enough (shown in §5.3). Both are needed:
- the trigger, so the right tests re-run;
- the rebuild, so they test current code.

Single runs (`vitest run`) never fire `onTestsRerun` and build exactly once, as before.

**Cleanup coverage:**

| Exit path | Result |
| :--- | :--- |
| Normal completion or test failure | Global-setup teardown removes the directory |
| Initial build failure | Removed before rethrowing |
| Ordinary process exit | `process.once("exit")` fallback removes it |
| Hard kill | Cannot clean up; the next run prunes the directory |

---

## 4. Commands run and results

Every result below was executed and its output inspected.

| # | Command / procedure | Result |
| :-: | :--- | :--- |
| 1 | `npx tsc --noEmit -p .` | exit 0 (several runs) |
| 2 | `npx vitest run` (full suite), real repository | **459/459 passed** in clean runs (e.g. final run 2 and frequency runs 1–4; 23 s wall, same as Batch 1). See §6 for failing runs |
| 3 | `npm run build` | exit 0 |
| 4 | `node scripts/ci/check-native.mjs` and `node scripts/ci/smoke.mjs` | `isolated-vm 7.0.1 OK on win32-x64 … (ABI 137)`; `smoke OK: version 0.1.0; 15 executions (7 passed, 7 failed); never-settling audit finished in 2209ms` |
| 5 | Concurrent runs (§5.1) | Pass (two unbounded; 2 × two bounded) |
| 6 | Watch-mode source change (§5.3) | Demonstrated, plus a negative control |
| 7 | Stale-output packaging (§5.4) | Stale file excluded |
| 8 | Package contents and imports (§5.5) | 147/147 exact; 138 relative imports resolve; no undeclared dependency |
| 9 | `git diff --check` | Clean (exit 0); new files also checked with `git diff --no-index --check` |
| 10 | `git status` / delta review | Only the files in §2 differ from the reviewed Batch 1 tree. **Unexpected staged index state found (§8)** |
| 11 | Fresh checkout (no `dist/`), `npm test` before any build | **459/459**, `dist/` not created, no run directories left |
| 12 | `npm pack` from a fresh checkout with no `dist/` | exit 0, 147 entries |
| 13 | `npm pack --dry-run` in the real repository | 147 files, version `0.1.0`, 0 maps, only `LICENSE`, `README.md`, `package.json` outside `dist/` |
| 14 | Six-commit replay with a fresh checkout per commit (§7) | All green: 340 → 355 → 376 → 391 → 433 → 459; the final tree equals the working tree (435 files, 0 differences) |

---

## 5. Verification details

### 5.1 R-1: concurrent runs

A sampler polled `node_modules/.cache/sis-test-build` every 100 ms during each experiment.

| Experiment | Outcome |
| :--- | :--- |
| **Two unbounded concurrent `npm test`** (the exact Phase 5.5 R-1 reproduction) | Both exit 0, **459/459**; 0 runner errors, 0 `EPERM` |
| Two concurrent `npm test -- --maxWorkers=3`, trial 1 | Both 459/459. Sampler: 2 distinct run directories present simultaneously (`run-19348-…`, `run-22192-…`). 0 left afterwards |
| Same, trial 2 | Both 459/459; 2 distinct directories; 0 left |
| Three concurrent unbounded `npm test` (≈3 × 11 workers on 12 CPUs) | **Isolation held:** 3 distinct directories coexisted, 0 `EPERM`, 0 runner errors, 0 left. But 2 of 3 runs had **timing** failures under oversubscription: two pre-existing tests hit the 5 s timeout, an infinite-loop fixture was misattributed, and one golden flip. That's Phase 5.5 R-3, not an isolation failure |

**One process cannot delete or overwrite another's output:**
- unit test `prunes only directories whose owning process is gone` (a live owner's file survived);
- `refuses to adopt an existing directory`;
- the hard-kill experiment below, where a directory owned by a live process with a marker file was untouched by the next run's pruning.

### 5.2 R-1: cleanup

These ran in a scratch copy of the working tree, so the repository was never modified.

| Path | Outcome |
| :--- | :--- |
| Normal completion | 0 run directories left after every run |
| Test failure (deliberately failing test file) | Run exit 1 (1 failed / 7 passed); its directory existed during the run and was gone afterwards |
| Build failure (type error injected into `src/`) | Run exit 1, `error TS2322` shown, 0 tests executed, 0 directories left; the copy was restored and re-run green |
| Hard kill (`taskkill /F /T` of a running `vitest`) | Its directory was left behind (no cleanup possible) and **pruned by the next run**. A live process's directory was untouched |

### 5.3 R-2: watch mode

This was driven by a Node script (no shell timing) running `vitest --watch test/cli.test.ts -t "should output version"` in a scratch copy. That test asserts `sis --version` prints `0.1.0`.

| Step | Result with Batch 1.1 | Negative control (only `onTestsRerun` disabled) |
| :--- | :--- | :--- |
| Initial run | 1 passed | 1 passed |
| Edit `src/version.ts` to append `-watch-edit` | Re-run **1 failed**, with output showing `0.1.0-watch-edit`: the CLI was rebuilt from current source | Re-run 1 **passed**, no `-watch-edit` in output: stale CLI (the Phase 5.5 R-2 defect) |
| Restore the file | Re-run **1 passed** | 1 passed |

Before `watchTriggerPatterns` was added, the edit triggered **no re-run at all**. That's the subprocess-graph gap described in §3, found during this verification.

**Windows-specific observation.** The first watch attempt, launched from the scratchpad's 8.3 short path (`C:\Users\AASHIR~1\…`), crashed Vitest's file watcher in libuv (`Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c`). Run from the long path of the same directory, watch mode worked. This is an environment/libuv limitation: don't start watch mode from an 8.3 short path. The repository path `E:\development\sis` isn't affected.

### 5.4 Stale-output packaging (scratch copy)

1. `npm run build`: 75 JS files.
2. Add `src/__stale_probe.ts`, then `npm run build`: `dist/__stale_probe.js` exists.
3. Delete the source, then a plain `npm run build` (the **old** `prepack` behavior): `dist/__stale_probe.js` **still exists**. This demonstrates the defect.
4. `npm pack` (`prepack` = `clean` + `build`): exit 0; `dist/__stale_probe.js` **absent**; 0 tarball entries contain `__stale_probe`; 147 files, version `0.1.0`.

### 5.5 Package contents and internal imports

The extracted tarball was compared with a clean `tsc` build of current source, minus the `files` exclusions, plus `package.json`, `README.md` and `LICENSE`:
- **147 / 147**, missing: none, unexpected or stale: none;
- relative imports with comments stripped: **138 checked, 0 unresolved**;
- bare imports `@swc/core`, `chalk`, `commander`, `fast-check`, `isolated-vm`: **undeclared: none**.

---

## 6. Flaky and unresolved tests

| Issue | Observations | Status |
| :--- | :--- | :--- |
| **Golden timing flake** (Phase 5.5 R-3) | In ordinary single full runs in the **real repository**, 2 of 7 failed one golden case on the `project` fixture: `riskyCompute` hit the 20 ms CPU budget, flipping SIS003 → SIS004 in `project.sarif` and `project.terminal` (the first golden cases, which run while other workers start). In **scratch copies**: Batch 1 tree 0/5, Batch 1.1 tree 0/5. | **Unresolved.** It isn't attributable to Batch 1.1, since the same Batch 1.1 tree is clean in scratch. The susceptibility is real (the 20 ms budget), and it can make CI fail intermittently. |
| **Intermittent Vitest load failure** (Phase 5 §8.2 / Phase 5.5 R-4) | **Recurred once** in a single, non-concurrent full run in the real repository: all 30 files failed with `TypeError: Cannot read properties of undefined (reading 'config')` and "failed to find the runner"; the run directory was still cleaned up. `tsc` → `vitest` correlation tested: **0/10**. Never seen in about 20 scratch-copy runs. | **Unresolved.** R-1 removed the one reproducible trigger (concurrent shared builds), yet it recurred, so another cause exists. Every occurrence so far was in the real repository directory, where the IDE and other tools are active; that's an observation, not a proven cause. |
| Orphaned CLI subprocess after a hard kill | The hard-kill experiment left a grandchild `node …/run-35484-…/dist/cli.js audit test/fixtures/project …` running (PID **29632**, idle, 0 CPU s). `taskkill /T` did not reach it. My attempt to terminate it was **denied by the permission policy**. | **Action for the user:** end PID 29632 (for example in Task Manager). It's harmless but should be cleaned up. |

**Recommended next step (not in scope here).** Make golden snapshots independent of CPU contention before relying on CI as a merge gate. Two options:
- run the golden cases with a larger `--timeout` for fixtures without deliberate infinite loops;
- run `golden.test.ts` without file parallelism.

This is a decision for the maintainer, because both options change test cost or coverage.

---

## 7. Commit plan adjustment

The six-commit structure from Phase 5.5 §6.3 is **preserved**, with these additions:

- **C1** additionally includes `audit/PHASE-5.6-BATCH-1.1-REPORT.md` (the Phase 5.5 report is already listed).
- **C2** additionally includes `test/setup/paths.ts`, `test/setup/build-dirs.ts`, `test/test-build-isolation.test.ts`, `test/clean-dist.test.ts` and `scripts/clean-dist.mjs`. Its existing files `vitest.config.ts`, `test/setup/build-dist.ts`, `test/helpers/test-build.ts` and `package.json` now carry the Batch 1.1 content. All Batch 1.1 changes are test-infrastructure or packaging changes, which is exactly C2's scope.
- C3–C6 are unchanged.

**Verified by replay** (scratch clone of `585af3d`, fresh checkout per commit, no `dist/` from C2 on): C1 340 (after build) → C2 **355** → C3 376 → C4 391 → C5 433 → C6 **459**, all passing. The final tree is identical to the working tree (435 files; this report excluded because it didn't exist yet).

**Updated C1 message** (replaces the Phase 5.5 text):

```text
docs: add reliability-reset notice and independent audit reports

State the current verification and release limitations in the README,
docs/benchmark.md and benchmarks/KNOWN_LIMITATIONS.md: the published
npm 0.1.0 predates Selective Runtime Verification and the Phase 23
classification fixes; runtime verification only supplies the first
Server Action argument and can label unexecuted actions FULL; and the
benchmark figures are historical, payload-level and pre-correction.

Historical benchmark data and review records are unchanged.

Adds the Phase 1-5.6 audit reports that the notices link to.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Updated C2 command and message:**

```bash
git add .gitattributes .gitignore package.json package-lock.json \
  src/version.ts src/cli.ts src/output/schema.ts vitest.config.ts \
  test/setup/paths.ts test/setup/build-dirs.ts test/setup/build-dist.ts \
  test/helpers/test-build.ts test/cli.test.ts test/release.test.ts test/helpers/perf-harness.ts \
  test/test-build-isolation.test.ts test/clean-dist.test.ts scripts/clean-dist.mjs \
  test/fixtures/project/dist/ignored.ts test/fixtures/project/node_modules/ignored.ts
```

```text
chore: build-independent tests and repository hygiene

Tests no longer read a prebuilt dist/: a Vitest globalSetup compiles
src/ into a per-process directory under node_modules/.cache/
sis-test-build, mirroring the package layout, and hands its path to
tests via provide/inject. Concurrent runs never share or delete each
other's builds; directories are removed on teardown and pruned once
their owning process has exited. In watch mode, changes to src/ re-run
the CLI-based tests against a fresh build. Benchmark imports of
../dist/index.js resolve to src/ under Vitest. A fresh clone can run
`npm ci && npm test`.

Track test/fixtures/project/{dist,node_modules}/ignored.ts, which
.gitignore had silently excluded, leaving the default-ignore tests
without input on fresh clones and in CI.

Hygiene: read the version from package.json in one place
(src/version.ts), normalize line endings with .gitattributes, remove
the unused ora dependency, clean dist/ before prepack so deleted
modules cannot be published, and exclude source maps and the empty
analyzer/fuzzer/sandbox placeholders from the package (299 -> 147
files). npm also corrected stale lockfile root metadata.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

The C1 `git add` list gains `audit/PHASE-5.6-BATCH-1.1-REPORT.md`. Commands and messages for C3–C6 are exactly as in Phase 5.5 §6.3.

---

## 8. Repository index: staged changes not made by this session

At the end of validation, `git status` showed **94 staged entries** (`A`/`M` in the index). At the start of Batch 1.1 nothing was staged (18 modified, 71 untracked, all unstaged).

**Facts established:**
- **No commits:** HEAD is `585af3d` and the reflog has no new entries. No tags.
- **Timing:** the staged `vitest.config.ts` lacks `watchTriggerPatterns`, while the staged `test/setup/build-dist.ts` already contains the per-run directory code. So the staging happened *during* this batch's validation window, after `clean-dist` was written and before the watch fix. `vitest.config.ts` therefore shows as `MM` (staged ≠ working tree).
- **Not this session:**
  - No command run by this session executed `git add` in the repository. The commit replay operates only in its own scratch clone, and staging there would have captured the current `vitest.config.ts`.
  - No repository code stages files; the only mutating git call is `git remote add`, in temporary benchmark checkouts.
  - The cause is outside this session: an IDE source-control action, another tool, or a person.

**I did not modify the index**, because it may be intentional. **Before executing the commit plan, the index must be emptied.** `git commit` records the entire index, so with 94 pre-staged files, C1 would contain everything. A maintainer should, after confirming the staging was not intended to be kept:

```bash
git restore --staged :/     # unstage everything; working-tree files are not touched
git status                  # expect: modified + untracked only, nothing staged
```

Then run C1–C6.

**Other housekeeping.** `node_modules/.cache/sis-test-build/` still contains `dist/` and `package.json` from the Batch 1 (shared-directory) layout. They're unused, ignored by the new pruning (which only touches `run-*` directories), and can be deleted manually.

---

## 9. Required answers

| Question | Answer |
| :--- | :--- |
| Exact files changed | §2 (5 new, 4 modified, plus this report) |
| Exact commands and results | §4–§5 |
| Did concurrent runs pass? | **Yes.** Two unbounded and 2 × two bounded concurrent runs: all 459/459, with distinct coexisting directories. Three-way oversubscription keeps isolation but shows timing failures (R-3) |
| Did watch mode pick up source changes? | **Yes**, demonstrated (fail with `0.1.0-watch-edit`, then pass after restore), with a negative control showing the stale behavior without the fix |
| Were stale compiled files excluded? | **Yes.** Absent from `dist/` and the tarball after `npm pack`; the tarball matches a clean build exactly |
| Flaky or unresolved tests? | Yes: the golden timing flake (2/7 real-repo runs, 0/10 scratch) and the intermittent load failure (recurred once). Both are unresolved and not caused by these fixes (§6) |
| Did the 446-test baseline change? | **446 → 459** (+13 new tests). No existing test changed |
| Windows-specific validation not performed | Ctrl+C / `SIGINT` interruption cleanup wasn't tested (it can't be delivered to a background process here; the `exit` handler and next-run pruning cover it by design). Linux and macOS weren't tested (CI not yet run). Watch mode from an 8.3 short path crashes libuv (§5.3) |

---

## 10. Verdict

The three requested fixes are implemented narrowly, tested, and demonstrated:
- concurrent runs are isolated;
- watch mode tests current source;
- packages contain only current build output.

They don't change SIS runtime behavior, the package version, or benchmark data, and the six-commit plan remains valid with the documented C1/C2 additions.

Approval is limited by issues **outside** this batch's scope that remain unresolved:
- the golden timing flake, which can make CI fail intermittently;
- the recurring intermittent load failure;
- the externally staged index, which must be cleared before committing.

**APPROVED WITH DOCUMENTED LIMITATIONS**
