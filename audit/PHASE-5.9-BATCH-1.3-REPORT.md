# SIS — Phase 5.9: Batch 1.3 Default Timeout Test Reliability

| | |
| :--- | :--- |
| **Base** | `8d38f8b` (C6) on `reliability-reset/batch-1` |
| **Date** | 2026-11-04 |
| **Environment** | Windows 11, 12 logical CPUs, Node v24.19.0, isolated-vm 7.0.1 |
| **Scope** | Test-only. **No `src/` change**; production default `--timeout` remains 20 ms; no snapshot, fixture or benchmark ground-truth change |
| **Outcome** | 53 call sites that expect a natural (non-timeout) result now pass an explicit 500 ms budget. After the change: 20/20 target-file runs, 5/5 affected-file runs, 10/10 full-suite runs and 3/3 loaded full-suite runs passed at **459/459**. Two pre-existing flakes outside this batch's mandate are left unchanged and documented (§6) |

---

## 1. Mechanism (recap)

`runInIsolate` uses `options.timeoutMs ?? 20` (`src/runtime/worker.ts:83`). isolated-vm's `timeout` is **wall-clock time while the isolate executes** (Phase 5.7 §3), so a trivial action that is descheduled by the OS for more than 20 ms under parallel test load is reported as `timeout` instead of `passed` or `failed`. Tests that silently rely on the default and assert a natural outcome are therefore load-sensitive. Phase 5.7 measured a 69 ms worst-case stall; Batch 1.2 fixed the golden snapshots with `--timeout 500`.

---

## 2. Reproduction before any change (Objective 1)

Command: `npx vitest run` (full suite, default reporter), 10 consecutive runs on an otherwise idle machine, at `8d38f8b` with a clean tree (only the untracked 5.8 report).

| Run | Result | Duration |
| :-: | :--- | :--- |
| 1–5 | 459 passed | 23.8–27.6 s |
| **6** | **1 failed / 458 passed** | 29.1 s |
| **7** | **1 failed / 458 passed** | 26.0 s |
| 8–10 | 459 passed | 25.6–25.7 s |

**Frequency: 2 of 10 full runs failed (20%), each with a different test.** The Phase 5.8 failure (`selective-runtime-adversarial.test.ts:54`) did not recur in these 10 runs; it was observed once in Phase 5.8.

Run 6:
```
FAIL  test/runtime-deadline.test.ts > Wall-clock execution deadline > terminates a never-settling promise as an infrastructure outcome, not a finding status
AssertionError: expected 'timeout' to be 'execution-error'
 ❯ test/runtime-deadline.test.ts:66:27
     63|  const result = await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 300 });
     66|  expect(result.status).toBe("execution-error");
```

Run 7:
```
FAIL  test/runtime.test.ts > Runtime Subsystem > Execution Budget & Wall Time Semantics > measures executionMs strictly inside isolate while wallTimeMs accounts for setup
AssertionError: expected 21 to be less than or equal to 20
 ❯ test/runtime.test.ts:226:34
     223|  const result = await runInIsolate(fastCandidate, {}, { timeoutMs: 20 });
     226|  expect(result.executionMs).toBeLessThanOrEqual(20);
```

**Pattern:** all three observed failures (5.8, run 6, run 7) are the same mechanism, a 20 ms wall-clock budget overrun under load, but they differ in kind:
- 5.8 relied on the *default* budget while expecting `passed` (in scope, fixed here);
- runs 6 and 7 pass an *explicit* 20 ms budget in dedicated budget/deadline tests (out of scope, §6).

---

## 3. Audit of timeout-dependent call sites (Objective 2)

**Method.** A scanner enumerated every test call that can execute the sandbox: `runInIsolate`, `verifyRuntimeActions`, `audit(...)`, `new AuditEngine(...)`, `measureAudit(...)`, and CLI `sis audit` via `execFileAsync`. For each call it recorded whether an explicit budget is passed. For every default-budget site, the enclosing test's assertions and the fixture were then read manually. Fixtures with deliberate infinite loops are:
- `test/fixtures/runtime-timeout-action.ts`
- `test/fixtures/real-world/runtime/actions.ts`
- `test/fixtures/real-world/adversarial/full-project/app/actions.ts`

**Categories:**
1. Intentionally tests timeouts, or runs a loop fixture.
2. Expects a natural runtime result (passed, app exception, zero failures or findings, exit code tied to the runtime outcome, determinism equality of runtime-derived findings).
3. Tests unsupported or inconclusive execution.
4. Other (no execution, outcome-insensitive assertions, explicit budget, or measurement).

Line numbers refer to `8d38f8b`.

### 3.1 Category 2: changed (53 call sites in 9 files)

| File | Lines | What is asserted |
| :--- | :--- | :--- |
| `selective-runtime-adversarial.test.ts` | 53, 73, 90, 93, 203, 241, 269, 289, 421, 442, 459, 496, 524, 525, 530, 531 (`runInIsolate`) | `status` `passed`, or `failed` with `TypeError` / `GENUINE_APPLICATION_ERROR`; output equality across runs. **53 is the 5.8 failure** |
| `selective-runtime-adversarial.test.ts` | 379 (`AuditEngine`) | PREFIX provenance on runtime findings (findings > 0) |
| `runtime.test.ts` | 163, 166 | both sequential executions `passed` (state leakage) |
| `selective-verification.test.ts` | 186, 187, 188 | three concurrent executions all `passed` |
| `selective-verification.test.ts` | 317, 360 | `runtime-exception` findings with PREFIX/FULL provenance; `failedExecutions > 0` |
| `discovery.test.ts` | 134 | runtime finding for `fragile-action.ts` with verified minimal reproducer |
| `hardening.test.ts` | 80 | ≥ 10 failed executions, destructuring `TypeError`s, verified repro |
| `hardening.test.ts` | 140 | **zero** findings for safe constructs |
| `location.test.ts` | 156 (`AuditEngine`), 193 (CLI) | runtime finding locations (JSON, SARIF, terminal) |
| `sis.test.ts` | 123 | zero findings for `taint-safe-server.ts` (contains an action) |
| `sis.test.ts` | 137, 187, 211 | runtime failures, `runtime-exception` finding, verified shrink results |
| `sis.test.ts` | 161 | `runtime.failed === 0`, `runtime.timedOut === 0`, zero findings |
| `performance.test.ts` | 79, 82 / 95, 98, 101 / 125, 128 | seed determinism of runtime-derived findings, reproducers, JSON/SARIF |
| `performance.test.ts` | 175 (`measureAudit`) | `verifiedReproCount ≥ 1` |
| `cli.test.ts` | 51, 75, 122 | exit 1 *with* `TypeError` / `Minimal reproducer` / `failure preserved` |
| `cli.test.ts` | 143, 198, 280, 510, 524, 537 | exit 0 / `No runtime failures detected` / `verifiedFindings: 0` (a timeout would yield a finding and exit 1) |
| `cli.test.ts` | 252, 297 | first finding is `SIS003` (a timeout would make it `SIS004`, the Phase 5.7 golden flake) |

### 3.2 Category 1: unchanged

| Site | Reason |
| :--- | :--- |
| `sis.test.ts:174` | audits `runtime-timeout-action.ts` and asserts the timeout |
| `cli.test.ts:158`, `runtime.test.ts:119`, `runtime.test.ts:237`, `hardening.test.ts:120` | dedicated timeout tests, explicit 20 ms |
| `runtime-deadline.test.ts:213`, the golden `never-settling` case | dedicated wall-clock deadline tests |
| `hardening.test.ts:173, 176, 179` | determinism on `real-world/runtime` (loop fixture); a 500 ms budget would make each looping execution take 500 ms. Residual exposure documented in §6 |
| `hardening.test.ts:216` | `adversarial/full-project` (loop fixture); assertions are lower bounds (`failedExecutions ≥ 5`) and tolerant |

### 3.3 Category 3: unchanged

| Site | Asserted |
| :--- | :--- |
| `selective-runtime-adversarial.test.ts:332` | `unsupported` / `ReferenceError` for an unbundled module-scope helper |
| `selective-verification.test.ts:151, 165` | `unsupported` for `process` / `fetch` |
| `hardening.test.ts:109`, `performance.test.ts:144` | framework-dependent actions classified static-only / `unsupported` |

### 3.4 Category 4: unchanged

| Site(s) | Reason |
| :--- | :--- |
| `cli.test.ts:13, 18` | `--version`, `--help`: no execution |
| `cli.test.ts:181, 208, 218, 228, 240, 565` | no Server Actions in the target, or a missing target: nothing executes |
| `cli.test.ts:325, 368, 385, 403, 421, 439, 457, 475, 493` | argument-validation errors raised before execution |
| `cli.test.ts:25, 101, 342, 549` | exit 1 is expected and occurs whether the outcome is a failure or a timeout; text assertions are section headers or taint only |
| `sis.test.ts:55, 67, 81, 91, 105, 112, 129, 227, 242` | static, taint or option assertions only, or no actions |
| `discovery.test.ts:173, 184, 196` | empty, client-only or syntax-error projects |
| `hardening.test.ts:12, 28, 47, 63, 97, 155, 161` | boundary, taint, serialization, import or count assertions independent of runtime outcome |
| `performance.test.ts:19–65, 155` | payload, action and file counts; `executions ≥ 100` counts timeouts too |
| `boundary.test.ts:235`, `dataflow.test.ts:338` | boundary and taint statistics only |
| `ground-truth-regression.test.ts:162` | explicit `timeoutMs: 20` (out of scope); asserts only ≥ 1 `TypeError` among 10 executions, tolerant of a single stall |
| `runtime.test.ts:223` | explicit 20 ms; a **measurement** assertion (`executionMs ≤ 20`). Run-7 flake, §6 |
| `runtime-deadline.test.ts:63` | explicit budget and deadline. Run-6 flake, §6 |

---

## 4. Changes made

**New `test/helpers/budgets.ts`:**
- `SUCCESS_PATH_BUDGET_MS = 500`
- `SUCCESS_PATH_RUNTIME_OPTIONS = { timeoutMs: 500 }`
- `SUCCESS_PATH_CLI_ARGS = ["--timeout", "500"]`

A header comment documents the wall-clock mechanism, when the constants must **not** be used (timeout or deadline tests, loop fixtures), and that production is unchanged.

**Edits** add the budget to exactly the 53 category-2 call sites in §3.1, plus one `import` per file. The diff is 62 insertions and 37 deletions across 9 test files, and every change is one of:
- a third argument `SUCCESS_PATH_RUNTIME_OPTIONS` on `runInIsolate`;
- a property `timeoutMs: SUCCESS_PATH_BUDGET_MS` on `AuditEngine`, `audit` or `measureAudit` options;
- a spread `...SUCCESS_PATH_CLI_ARGS` after the audited target in a CLI argument list.

No assertion was added, removed or weakened.

**Why 500 ms:**
- It is the value already validated for the golden snapshots in Batch 1.2.
- It is about 7× the worst stall measured in Phase 5.7 (69 ms).
- It is far below every per-test timeout.
- It has no cost on the success path: the budget is only consumed by executions that would otherwise overrun, and no changed site executes a looping fixture.

The full-suite duration is unchanged: 23.1–24.6 s after the change, against 23.8–29.1 s before.

**Not changed:**
- `src/` (production default 20 ms; analysis semantics);
- snapshots, fixtures, benchmark ground truth;
- dedicated timeout and deadline tests, which keep their short explicit budgets;
- `audit/PHASE-5.8-BATCH-1-COMMIT-REPORT.md` (still untracked; SHA-256 `1f1c5676…b99`, identical before and after).

---

## 5. Validation (Objective 3)

| Check | Command | Result |
| :--- | :--- | :--- |
| Previously failing file, repeated | `npx vitest run test/selective-runtime-adversarial.test.ts` ×20 | **20/20 passed** (23/23 tests each) |
| All 9 affected files, repeated | `npx vitest run <9 files>` ×5 | **5/5 passed** (165/165 each) |
| Full suite, repeated | `npx vitest run` ×10 | **10/10 passed (459/459)**; 23.1–24.6 s |
| Full suite under moderate CPU load | 6 busy-loop Node processes (half of 12 logical CPUs) + `npx vitest run` ×3 | **3/3 passed (459/459)**; 27.0–28.2 s; burners confirmed stopped afterwards |
| Type-check | `npx tsc --noEmit -p .` | exit 0 |
| Type-check of tests (not covered by `tsconfig.json`, which excludes `test/`) | temporary config including `test/**/*.ts`, before vs after | 23 pre-existing errors both before and after, identical per-file distribution; **none** involve the changed code |
| Build | `npm run build` | exit 0 |
| CLI smoke | `node scripts/ci/check-native.mjs`; `node scripts/ci/smoke.mjs` | `isolated-vm 7.0.1 OK on win32-x64, Node v24.19.0 (ABI 137)`; `smoke OK: version 0.1.0; 15 executions (7 passed, 7 failed); never-settling audit finished in 2199ms` |
| Whitespace | `git diff --check`; `git diff --no-index --check` on the new helper | clean |

**Interpretation.** 0 failures in 13 post-change full runs (10 idle, 3 loaded), against 2 in 10 before. However, **the two pre-change failures were in tests this batch deliberately did not change** (§6), so their absence after the change is chance, not a fix. The batch removes the default-budget exposure (the Phase 5.8 class); it does not remove the explicit-20-ms exposure.

---

## 6. Unresolved intermittent failures

| Test | Observed | Why not changed in this batch | Proposed fix (needs approval) |
| :--- | :--- | :--- | :--- |
| `runtime-deadline.test.ts:66` (never-settling, `{ timeoutMs: 20, wallTimeoutMs: 300 }`) | 1/10 before (`timeout` instead of `execution-error`) | Dedicated deadline test with an explicit short budget; the batch rules require those to keep short explicit deadlines | Raise only the *incidental* isolate budget (e.g. `timeoutMs: 200`) while keeping `wallTimeoutMs: 300`. The deadline under test is unchanged; the never-settling promise consumes no isolate time, so the deadline still fires first |
| `runtime.test.ts:226` (`executionMs ≤ 20` for a passed run with `timeoutMs: 20`) | 1/10 before (21 ms) | Measurement assertion on an explicit budget, not a timeout outcome | Either allow ~1–5 ms of measurement tolerance, or give the run a larger budget and assert `executionMs ≤ timeoutMs`. Both preserve intent ("executionMs measures inside the isolate") |
| `hardening.test.ts:173–179` (seed determinism on the loop fixture) | not observed | Loop fixture; a larger budget would slow every looping execution | Determinism could compare non-timeout findings only, or use a fixture without a loop. Low priority |

Also still open, from Phase 5.8:
- the intermittent Vitest "failed to find the runner" load failure (not observed in this phase);
- saturation-only per-test timeouts in the fuzzing, hardening and performance tests;
- Linux and macOS untested (CI has not run);
- the orphan CLI process from Phase 5.6 (PID 29632) is still running; killing it was previously declined.

---

## 7. Commit

One new commit on top of C6 (`8d38f8b`). Identity `AashirZayd <aashirzayd@gmail.com>`, set via per-command `git -c` overrides. Explicit `git add` of:
- the 9 test files;
- `test/helpers/budgets.ts`;
- this report.

The Phase 5.8 report remains untracked and unmodified. No push, tag, publish, merge, amend or rebase.

**Verdict: APPROVED WITH DOCUMENTED LIMITATIONS.** The in-scope exposure (default 20 ms budget with natural-outcome assertions) is removed and validated under idle and loaded runs at 459/459. Two explicit-budget flakes (§6) remain, with proposed fixes awaiting approval.
