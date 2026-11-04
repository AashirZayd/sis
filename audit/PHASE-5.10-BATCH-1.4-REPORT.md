# SIS — Phase 5.10: Batch 1.4 Dedicated Timeout Test Stability

| | |
| :--- | :--- |
| **Base** | `69a2a47` on `reliability-reset/batch-1` |
| **Date** | 2026-11-04 |
| **Environment** | Windows 11, 12 logical CPUs, Node v24.19.0, isolated-vm 7.0.1 |
| **Input** | Phase 5.9 report §6 (two explicit-budget flakes, proposed fixes) |
| **Scope** | Two test files. **No `src/` change**; production default `--timeout` remains 20 ms; no snapshot, fixture, benchmark ground-truth or unrelated test change |
| **Outcome** | Both approved fixes applied. 20/20 runs of each affected test, 3/3 runs of the timeout-test files, 10/10 full-suite runs and 3/3 loaded full-suite runs passed (459/459) |

---

## 1. Changes

### 1.1 `test/runtime-deadline.test.ts`: never-settling deadline test

| | Before | After |
| :--- | :--- | :--- |
| Isolate execution budget (`timeoutMs`) | 20 ms | **200 ms** |
| Overall wall-clock deadline under test (`wallTimeoutMs`) | 300 ms | 300 ms (unchanged) |
| Assertions | `status` is `execution-error`; error name is `WALL_CLOCK_DEADLINE_ERROR`; message contains `300ms wall-clock deadline`; 250 ms ≤ elapsed < 10 s | **unchanged** |

**Rationale.** isolated-vm's `timeout` counts wall-clock time while the isolate runs. With 20 ms, a scheduler stall in the synchronous prologue could end the run as `timeout` before the deadline fired (Phase 5.9 §2, run 6). The isolate budget is incidental to this test, and 200 ms is still below the 300 ms deadline. An inline comment records this.

### 1.2 `test/runtime.test.ts`: `executionMs` measurement test

| | Before | After |
| :--- | :--- | :--- |
| Budget | `timeoutMs: 20` | `timeoutMs: 20` (unchanged) |
| Assertion | `executionMs ≤ 20` | `executionMs ≤ 20 + MEASUREMENT_TOLERANCE_MS`, with `MEASUREMENT_TOLERANCE_MS = 5` |
| Other assertions | `status` is `passed`; `timeoutMs` is 20; `wallTimeMs ≥ executionMs` | unchanged |

**Rationale (documented inline).** `executionMs` is measured on the host with `Date.now()`, which has 1 ms resolution, around `await script.run(...)`. It therefore also includes the hand-off back to the host event loop after the isolate has finished. isolated-vm enforces the budget separately, so a run that passed within budget can be reported slightly over it. The observed failure was 21 ms for a 20 ms budget.

5 ms is the top of the approved 1–5 ms range. It was chosen because event-loop resumption, not only clock resolution, contributes to the overage. The test still asserts that the measurement is close to the isolate budget and below `wallTimeMs`.

### 1.3 `test/hardening.test.ts:173–179`

**Not modified**, as instructed. The short timeout, the infinite-loop fixture and the termination assertions are preserved. `git diff HEAD -- test/hardening.test.ts` is empty.

---

## 2. Does the deadline test still detect the intended behaviour?

The test file was temporarily mutated (`sed` on the call site only), run, and then restored. The restored file was byte-identical (`cmp`).

| Mutation | Expectation if the test discriminates | Result |
| :--- | :--- | :--- |
| **M1**: `wallTimeoutMs: 5000` | must fail: the deadline is the only thing that ends a never-settling promise | **Failed**: `Test timed out in 5000ms` |
| **M1b**: `wallTimeoutMs: 1000` | must fail: the assertions pin the 300 ms deadline | **Failed**: `expected 'Sandbox execution exceeded the 1000ms…' to contain '300ms wall-clock deadline'` |
| **M2**: `timeoutMs: 100` (deadline 300) | must pass: a pending promise consumes no isolate time, so the budget never fires | **Passed** (`execution-error` from the deadline) |
| **M3**: `timeoutMs: 400` (deadline 300) | must pass: the deadline fires first | **Passed** |

Conclusions:
- **M1 and M1b:** the test still fails whenever the 300 ms deadline is not the mechanism that terminated the run.
- **M2 and M3:** the outcome is insensitive to the isolate budget for this candidate. The budget only ever mattered through scheduler stalls in the synchronous prologue, which is the flake removed here.

---

## 3. Validation

| Check | Command | Result |
| :--- | :--- | :--- |
| Deadline test, repeated | `npx vitest run test/runtime-deadline.test.ts -t "terminates a never-settling promise"` ×20 | **20/20 passed** |
| Measurement test, repeated | `npx vitest run test/runtime.test.ts -t "measures executionMs strictly inside isolate"` ×20 | **20/20 passed** |
| Dedicated timeout tests | `npx vitest run` on `runtime-deadline`, `runtime`, `cli`, `sis`, `hardening` and `golden` (contains every dedicated timeout and deadline test: `runtime.test.ts:119, 237`; `cli.test.ts:158`; `sis.test.ts:174`; `hardening.test.ts:120, 173–179`; `runtime-deadline.test.ts`; golden `never-settling`) ×3 | **3/3 passed** (141/141 each) |
| Full suite, repeated | `npx vitest run` ×10 | **10/10 passed (459/459)**; 22.7–23.4 s |
| Full suite under moderate CPU load | 6 busy-loop Node processes (half of 12 logical CPUs) + `npx vitest run` ×3 | **3/3 passed (459/459)**; 26.1–27.3 s; burners stopped afterwards |
| Type-check | `npx tsc --noEmit -p .` | exit 0 |
| Test-file type-check comparison | temporary config including `test/**/*.ts`, before vs after the change | 23 errors before and 23 after; **identical error set** (ignoring positions). All pre-existing; none in the changed lines (the 3 in `runtime.test.ts` are at lines 201–203, `GeneratedPayload.id`) |
| Build | `npm run build` | exit 0 |
| CLI smoke | `node scripts/ci/check-native.mjs`; `node scripts/ci/smoke.mjs` | `isolated-vm 7.0.1 OK on win32-x64, Node v24.19.0 (ABI 137)`; `smoke OK: version 0.1.0; 15 executions (7 passed, 7 failed); never-settling audit finished in 2197ms` |
| Whitespace | `git diff --check`; `--no-index --check` on this report | clean |
| Untouched | `git diff HEAD -- src test/__golden__ benchmarks test/hardening.test.ts` | empty |

---

## 4. Remaining limitations

- **The measurement tolerance is bounded.** A host event-loop stall longer than 5 ms between the isolate finishing and `await script.run` resuming would still exceed the tolerance. It was not observed in 20 targeted runs and 13 full runs (3 loaded), but it cannot be ruled out on a heavily saturated runner.
- `hardening.test.ts:173–179` (seed determinism on the loop fixture) remains theoretically exposed. It was not observed in any run, and is left unchanged by instruction.
- The intermittent Vitest "failed to find the runner" load failure is unresolved; it was not observed in this phase.
- Saturation-only per-test timeouts in the fuzzing, hardening and performance tests remain.
- Linux and macOS are untested; CI has not run, because that needs a push.
- The orphan CLI process from Phase 5.6 (PID 29632) is still running.

---

## 5. Commit

One new commit on top of `69a2a47`. Identity `AashirZayd <aashirzayd@gmail.com>`, set via per-command `git -c` overrides. Explicit `git add` of:
- `test/runtime-deadline.test.ts`
- `test/runtime.test.ts`
- this report

`audit/PHASE-5.8-BATCH-1-COMMIT-REPORT.md` remains untracked and unmodified (SHA-256 `1f1c5676af25e5b4…`). No push, tag, publish, merge, amend or rebase.

**Verdict: APPROVED WITH DOCUMENTED LIMITATIONS.** Both Phase 5.9 explicit-budget flakes are addressed without weakening what the tests verify, and all validation passed. The limitations in §4 are environmental (untested platforms, CI not run) or theoretical; none was observed.
