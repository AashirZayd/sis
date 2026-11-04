# SIS — Phase 5.7: Batch 1.2 — Golden Snapshot Determinism and Commit Readiness

| | |
| :--- | :--- |
| **Base** | Batch 1 + Batch 1.1 working tree on `master` at `585af3d` (`audit/PHASE-5.5-FINAL-REVIEW.md`, `audit/PHASE-5.6-BATCH-1.1-REPORT.md`) |
| **Date** | 2026-11-04 |
| **Environment** | Windows 11 x64, 12 logical CPUs, Node v24.19.0, Vitest 5.0.0, isolated-vm 7.0.1 |
| **State** | Nothing committed, pushed, tagged or published. **The git index was not modified** (§2). npm still lists only `0.1.0`. Runtime semantics, the production timeout default, benchmark ground truth and the package version are unchanged. |

---

## 1. Summary

**Objective A — snapshot flake: fixed in the test, with root cause established.**
- isolated-vm's `timeout` is a **wall-clock** limit while the isolate executes. This was proven directly: a 100 ms CPU-idle `Atomics.wait` times out under a 20 ms budget.
- Golden fixtures ran trivial actions at the production default of 20 ms, each as the first execution in a fresh CLI process, while the full suite saturates the machine at start-up. A transient stall over 20 ms flipped SIS003 to SIS004.
- Golden fixture cases now run with `--timeout 500`. The 42 snapshots differ from before **only in budget tokens**, which was verified mechanically.
- Results:
  - golden test: 10/10;
  - full suite: **7/7** (previously 2/7 failed);
  - full suite under moderate load: 2/2;
  - dedicated short-budget timeout tests: 70/70.

**Objective B — index: still contaminated; not modified; maintainer confirmation required.**
- 94 entries are staged, all Batch 1 / 1.1 files.
- At the start of this batch, 93 staged files were identical to the working tree. The staged `vitest.config.ts` is stale (it lacks the Batch 1.1 watch fix).
- After Batch 1.2, the 37 Batch 1.2 files are also staged in outdated versions (`AM`).

**Objective C — readiness:**
- tests, type-check, build, smoke tests and packaging (147/147 exact) pass;
- the six-commit plan replays green;
- benchmark data, version and prior audit reports are unchanged.

**Two items block a clean commit:**
1. The index requires your confirmation before it can be cleared.
2. `git diff --check` flags a pre-existing blank line at EOF in 39 golden snapshot files (§7). A trivial fix awaits approval because it's outside this batch's declared scope.

---

## 2. Objective B — index inspection (read-only)

**Commands run:**
- `git status --short`
- `git diff --cached --stat`: *94 files changed, 12285 insertions(+), 366 deletions(-)*
- `git diff --cached --name-status`: 76 `A`, 18 `M`

**Findings:**
- **Overlap with Batch 1 / 1.1:** every one of the 94 staged paths is a Batch 1 or Batch 1.1 file. Nothing unrelated is staged.
- **Staged content vs working tree (start of Batch 1.2):** 93 of 94 identical, ignoring CR. **`vitest.config.ts` differs:** the staged version lacks `watchTriggerPatterns` (the Batch 1.1 R-2 fix), so committing it would ship a broken watch mode.
- **No commits:** HEAD is `585af3d`, the reflog shows no new entries, there are no stashes, and no tags.
- **The index was not modified by Batch 1.2.** The staged path list is byte-identical before and after this batch, and the staged `test/golden.test.ts` and snapshots still have their pre-1.2 content (0 occurrences of `GOLDEN_BUDGET_ARGS` / `--timeout 500` in the index).
- The configured git identity is `NomiqAI <founders.nomiq.ai@gmail.com>`, which differs from the required commit identity, `AashirZayd <aashirzayd@gmail.com>` (§8).

**Full inventory** (`git status --short --untracked-files=all`, grouped):

| XY | Path | Files |
| :--- | :--- | :-: |
| `A ` | `.gitattributes` | 1 |
| `M ` | `.github/workflows/benchmark.yml` | 1 |
| `A ` | `.github/workflows/ci.yml` | 1 |
| `M ` | `.gitignore` | 1 |
| `M ` | `CHANGELOG.md` | 1 |
| `M ` | `CONTRIBUTING.md` | 1 |
| `M ` | `README.md` | 1 |
| `A ` | `audit/PHASE-1-REPOSITORY-INTELLIGENCE.md` | 1 |
| `A ` | `audit/PHASE-2-FINDINGS-VALIDATION.md` | 1 |
| `A ` | `audit/PHASE-3-REMEDIATION-DESIGN.md` | 1 |
| `A ` | `audit/PHASE-4-IMPLEMENTATION-READINESS.md` | 1 |
| `A ` | `audit/PHASE-5-BATCH-1-IMPLEMENTATION-REPORT.md` | 1 |
| `A ` | `audit/PHASE-5.5-FINAL-REVIEW.md` | 1 |
| `??` | `audit/PHASE-5.6-BATCH-1.1-REPORT.md` | 1 |
| `??` | `audit/PHASE-5.7-BATCH-1.2-REPORT.md` (this report) | 1 |
| `M ` | `benchmarks/KNOWN_LIMITATIONS.md` | 1 |
| `M ` | `docs/benchmark.md` | 1 |
| `M ` | `package-lock.json` | 1 |
| `M ` | `package.json` | 1 |
| `A ` | `scripts/ci/check-native.mjs` | 1 |
| `A ` | `scripts/ci/smoke.mjs` | 1 |
| `A ` | `scripts/clean-dist.mjs` | 1 |
| `A ` | `scripts/validate-benchmark-inputs.mjs` | 1 |
| `M ` | `src/cli.ts` | 1 |
| `M ` | `src/output/schema.ts` | 1 |
| `M ` | `src/parser/location.ts` | 1 |
| `M ` | `src/runtime/types.ts` | 1 |
| `M ` | `src/runtime/worker.ts` | 1 |
| `A ` | `src/version.ts` | 1 |
| `AM` | `test/__golden__/*` (fixture snapshots; staged = pre-1.2) | 36 |
| `A ` | `test/__golden__/*` (never-settling + error snapshots) | 6 |
| `A ` | `test/benchmark-inputs.test.ts` | 1 |
| `A ` | `test/clean-dist.test.ts` | 1 |
| `M ` | `test/cli.test.ts` | 1 |
| `A ` | `test/fixtures/golden/**` | 8 |
| `A ` | `test/fixtures/project/dist/ignored.ts` | 1 |
| `A ` | `test/fixtures/project/node_modules/ignored.ts` | 1 |
| `AM` | `test/golden.test.ts` (staged = pre-1.2) | 1 |
| `A ` | `test/helpers/golden.ts` | 1 |
| `M ` | `test/helpers/perf-harness.ts` | 1 |
| `A ` | `test/helpers/test-build.ts` | 1 |
| `A ` | `test/location.test.ts` | 1 |
| `M ` | `test/release.test.ts` | 1 |
| `A ` | `test/runtime-deadline.test.ts` | 1 |
| `A ` | `test/setup/build-dirs.ts` | 1 |
| `A ` | `test/setup/build-dist.ts` | 1 |
| `A ` | `test/setup/paths.ts` | 1 |
| `A ` | `test/test-build-isolation.test.ts` | 1 |
| `MM` | `vitest.config.ts` (staged = pre-1.1, stale) | 1 |

Totals: 94 staged (39 `A `, 37 `AM`, 17 `M `, 1 `MM`); 38 with unstaged working-tree changes on top (all `AM`/`MM`); 2 untracked (the 5.6 and 5.7 reports).

**Per the batch instructions I stopped short of any operation that could alter the index.** §8 describes the required maintainer action.

---

## 3. Objective A — root cause of the snapshot flake

| Step | Experiment (scratch scripts; no repository change) | Result |
| :-: | :--- | :--- |
| 1 | `riskyCompute` (the action that flipped), executed in 40 fresh processes × 6 executions, idle / 6 of 12 / 12 of 12 CPUs busy | Wall latency: idle max 9 ms; 6/12 max 7 ms; **12/12: first execution in a process median 17 ms, p95 59 ms, max 69 ms**; later executions max 30 ms. Cold first executions are the slowest |
| 2 | Same action at a **20 ms budget**, 180 executions under 12/12 and then 36/12 busy-loop load | **0 timeouts.** Host-side latency (queueing for the isolate thread, awaiting the result) isn't charged to the budget |
| 3 | Real CLI on the golden `project` fixture, 30 runs idle, 30 runs at 36/12 busy-loop load, 2 × 25 runs alongside a full test suite | **0 spurious SIS004 in 110 runs.** The exact stall couldn't be produced on demand |
| 4 | **Decisive:** `Atomics.wait` 100 ms (no CPU) inside an isolate, at `timeout: 20` and `timeout: 500` | 20 ms: *"Script execution timed out."*; 500 ms: completes after 104 ms. **The budget is wall-clock time while the isolate executes**, not CPU time |

**Best-supported explanation.** Any stall of the isolate thread *during* execution counts against the budget. That includes OS preemption, page faults on cold code, I/O contention and GC.

The failing case was always the first golden case (`project.*`). It runs the first isolate execution of a fresh CLI process while the full suite starts about one Vitest worker per core, which load, transform and spawn processes at once. With a 20 ms budget, a stall of more than about 19 ms during a 1 ms action is enough to flip the outcome. Step 4 proves the mechanism. Steps 1–3 show the cold-start latency profile, but the exact stall wasn't reproduced on demand, so the trigger is **best-supported, not proven**.

**Why this isn't arbitrary.** The worst wall latency measured for a trivial action under full saturation was 69 ms. A 500 ms budget gives a margin above 7×. Larger values would only slow the one fixture with a deliberate infinite loop.

---

## 4. Changes made

| File | Change |
| :--- | :--- |
| `test/golden.test.ts` | New constant `GOLDEN_BUDGET_ARGS = ["--timeout", "500"]` with a comment stating the mechanism and the measurement. It's appended to the 12 fixture targets × 3 formats (36 cases). `never-settling` and the 3 error cases are unchanged; the comment explains that `never-settling` keeps the default because a 500 ms budget would raise its wall deadline to 5 s per payload and its outcome is decided by the deadline |
| `test/__golden__/*.txt` (36 fixture snapshots) | Regenerated. **Verified mechanically:** substituting the budget tokens in the pre-1.2 snapshots reproduces the new snapshots exactly, **0 of 42 differing**. The substitutions were: the `--timeout 500` suffix on the `# command:` line, `"timeoutMs": 20` → `500`, `/ 20ms budget` → `/ 500ms budget`, `Execution budget: 20ms per payload` → `500ms`, `timed out after 20ms execution budget` → `500ms` (76 tokens). Every finding, outcome, shrink result, identifier and exit code is identical |
| `audit/PHASE-5.7-BATCH-1.2-REPORT.md` | This report |

Not changed:
- production default `--timeout` (20 ms, `src/runtime/worker.ts`) and the deadline logic;
- every dedicated timeout or deadline test;
- every other file.

### Timeout values before and after

| Context | Before | After |
| :--- | :--- | :--- |
| Golden fixture cases (36) | 20 ms (CLI default) | **500 ms** |
| `real-world-runtime` deliberate infinite loop | Timed out at 20 ms | Still times out, at 500 ms (timeout path still covered) |
| Golden `never-settling` (3) | 20 ms budget, 1000 ms wall deadline | Unchanged |
| Golden error cases (3) | n/a | Unchanged |
| `test/runtime-deadline.test.ts` | 20, 50, 3000, 60 000 ms + explicit deadlines | Unchanged |
| `test/runtime.test.ts` | 20, 50, 100 ms | Unchanged |
| `test/hardening.test.ts` | 20, 50 ms | Unchanged |
| Production default (`sis audit` without `--timeout`) | 20 ms | **Unchanged** |

---

## 5. Repeated test results

Every run is listed, failures included.

| # | Command | Runs | Result | Wall time |
| :-: | :--- | :-: | :--- | :--- |
| 1 | `npx vitest run test/golden.test.ts` | 10 | **10/10 passed** (42/42 each) | 22–23 s |
| 2 | `npx vitest run` (full suite) | 7 | **7/7 passed** (459/459 each); 0 runner errors | 25–26 s (was about 23 s; +3 s for the infinite-loop fixture at 500 ms) |
| 3 | Full suite with 6 of 12 CPUs busy (moderate load) | 2 | **2/2 passed** (459/459) | 31 s |
| 4 | Full suite with 12 of 12 CPUs busy (saturation; beyond the requirement) | 1 | **Golden passed.** 5 failures in other files, all **Vitest per-test timeouts** (`Test timed out in 5000ms` ×3, `20000ms` ×2) in `fuzzing.test.ts`, `hardening.test.ts`, `performance.test.ts`; the run took 81 s instead of 26 s | 81 s |
| 5 | Dedicated timeout/deadline tests (`runtime-deadline`, `runtime`, `hardening`, `selective-runtime-adversarial`) | 1 | **70/70 passed**, including every infinite-loop → `timeout` and deadline test | — |
| 6 | Six-commit replay with a fresh checkout per commit (§8) | 6 | **All green** | — |

**For comparison, before Batch 1.2** (Phase 5.6): golden failed 2 of 7 ordinary full runs in this repository.

The 5 failures in run 4 aren't snapshot instability and aren't caused by this batch. They're pre-existing tests whose in-process audits exceed Vitest's per-test time limit when the machine is fully saturated, so they're slow rather than wrong. This is an **outstanding limitation**: CI runners with fewer cores than workers could hit it.

**Intermittent Vitest load failure** (Phase 5 §8.2, Phase 5.5 R-4, Phase 5.6 §6): **not observed** in this batch (0 occurrences in 22 Vitest runs in this repository and 6 replay runs). Because it was rare before and its cause was never established, it remains **UNRESOLVED**, not fixed.

---

## 6. Objective C — commit readiness checks

| Check | Result |
| :--- | :--- |
| Full tests | 459/459 (§5) |
| Type-check (`npx tsc --noEmit -p .`) | exit 0 |
| Build (`npm run build`) | exit 0 |
| CLI smoke (`scripts/ci/check-native.mjs`, `scripts/ci/smoke.mjs`) | `isolated-vm 7.0.1 OK … (ABI 137)`; `smoke OK: version 0.1.0; 15 executions (7 passed, 7 failed); never-settling audit finished in 2195ms` |
| Package generation (`npm pack`, prepack = clean + build) | exit 0, `aashirzayd-sis-0.1.0.tgz`, 147 files |
| Package contents | Identical to a clean build of current source plus `package.json`/`README.md`/`LICENSE` (147/147; missing none; stale none); 138 relative imports resolve; no undeclared dependency |
| `git diff --check` (working tree vs index) | Clean |
| `git diff HEAD --check` (full change set) | **39 × "new blank line at EOF"**, all in `test/__golden__/*.txt`; nothing else (§7) |
| Untracked files, checked individually | `audit/PHASE-5.6-BATCH-1.1-REPORT.md`: clean |
| Benchmark ground truth | `git diff HEAD -- benchmarks/reviews benchmarks/results benchmarks/corpus.json`: empty |
| Package version | `0.1.0`, unchanged |
| Prior audit reports | Phases 1–4 SHA-256 verified; Phase 5 `ff7d1b3c66ac6856` (unchanged since Phase 5.5); 5.5 and 5.6 unmodified in this batch |

---

## 7. Correction to the Phase 5.6 report, and the EOF blank line

Phase 5.6 §4 item 9 stated that new files were checked with `git diff --no-index --check`. **That check did not actually run.** The command passed many paths to a two-path `git diff --no-index` with its error output suppressed, so it checked nothing. The correct check (`git diff HEAD --check`, plus individual `--no-index` checks for untracked files) finds one issue:

- **39 golden snapshot files end with a blank line at EOF.** `test/golden.test.ts` builds each snapshot document by joining sections with `\n` and ending with an empty element. When stderr is empty, that leaves an empty line before the final newline. It dates from Batch 1 (it's also present in the staged pre-1.2 versions), so this batch didn't introduce it.
- **Effect:** it's cosmetic, but `git diff --check` and any whitespace-checking hook will flag those files.
- **Fix (not applied; outside this batch's declared scope):** end the document with a single newline (for example, trim trailing newlines from the joined document and append one `\n`), then regenerate. The diff would be the removal of one trailing empty line in 39 snapshots, and mechanical verification works the same way as in §4.

---

## 8. Six-commit plan

**Still valid.** Batch 1.2 touches only C5's files (`test/golden.test.ts`, `test/__golden__/*`). The replay (scratch clone of `585af3d`; files copied from the working tree, independent of the index; fresh checkout per commit) gives:

C1 340 (after build) → C2 355 → C3 376 → C4 391 → C5 433 → C6 **459**, all passing. The final replayed tree equals the working tree: 436 files, 0 differences, excluding this report.

**Adjustments:**
- C1's `git add` list gains `audit/PHASE-5.6-BATCH-1.1-REPORT.md` and `audit/PHASE-5.7-BATCH-1.2-REPORT.md`, and its message should say "Phase 1-5.7".
- **C5 message** (replaces the Phase 5.5 text):

```text
test: add golden CLI output snapshots

Pin terminal, JSON and SARIF output, finding identifiers, runtime
summaries and exit codes for 13 targets and 3 error cases (42
snapshots). New fixtures under test/fixtures/golden/ reproduce audited
defects that are still under remediation, so later behavior changes
show up as explicit snapshot diffs. Only host paths and measured
durations are normalized.

Fixture cases run with a 500ms execution budget: isolated-vm's timeout
is wall-clock time while the isolate runs, so at the 20ms production
default a stall during a cold first execution on a busy machine could
flip a trivial action from SIS003 to SIS004. Deliberate infinite loops
still time out; dedicated timeout tests keep their short budgets.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Required before running the plan** (needs maintainer confirmation; not done):

1. **Confirm the staged changes may be discarded from the index, then clear it.** `git restore --staged :/` leaves working-tree files untouched. Verify that `git status` shows nothing staged. `git commit` records the whole index, so without this step C1 would contain all 94 staged files, including the stale `vitest.config.ts`.
2. **Commit identity.** Every commit must be authored as `AashirZayd <aashirzayd@gmail.com>`. The configured identity is `NomiqAI <founders.nomiq.ai@gmail.com>`. Use, for each commit:

   ```bash
   git -c user.name=AashirZayd -c user.email=aashirzayd@gmail.com commit -F <message-file>
   ```

   or set the identity repository-locally first (`git config user.name AashirZayd`, `git config user.email aashirzayd@gmail.com`). Check with `git log -1 --format='%an <%ae> / %cn <%ce>'` after each commit.
3. Decide whether to apply the §7 blank-line fix first. If yes, it belongs to C5.

Then run the branch creation and C1–C6 from Phase 5.5 §6.3, with the C1/C2 additions from Phase 5.6 §7 and the C5 message above.

---

## 9. Outstanding platform limitations

- **Linux and macOS:** not tested. CI has never run, because that needs a push. Golden snapshots were generated on Windows; cross-platform equality is still unverified.
- **Saturation-only per-test timeouts:** five pre-existing tests exceed Vitest's 5 s / 20 s per-test limits when every CPU is busy (§5 run 4). Small CI runners might hit this.
- **Ctrl+C cleanup** of the per-run test build isn't tested; it can't be delivered to a background process here.
- **Watch mode** started from a Windows 8.3 short path crashes libuv's file watcher (Phase 5.6 §5.3).
- **Intermittent Vitest load failure:** unresolved (§5).
- **Leftover process:** the orphaned idle CLI process from the Phase 5.6 hard-kill experiment (PID 29632) may still be running; terminating it was not permitted from this session.

---

## 10. Verdict

The snapshot flake is fixed at its cause, which is wall-clock budget sensitivity in the golden test configuration. The fix doesn't touch production semantics or the dedicated timeout tests, and snapshots are provably unchanged apart from the budget value. All readiness checks pass and the commit plan replays green.

Approval is limited by items that need a maintainer decision or lie outside this batch:
- the **index must be cleared with your confirmation** before any commit;
- the pre-existing EOF blank line in 39 snapshots (fix offered, not applied);
- the unresolved intermittent load failure;
- saturation-only per-test timeouts;
- untested Linux/macOS.

**APPROVED WITH DOCUMENTED LIMITATIONS**
