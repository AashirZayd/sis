/**
 * Execution budgets for tests whose intended outcome is a natural (non-timeout) result:
 * an action that passes, throws an application error, or produces deterministic findings.
 *
 * Why these tests need an explicit budget: isolated-vm's `timeout` is measured in
 * wall-clock time while the isolate is executing, not in CPU time. Under a loaded test
 * run (parallel Vitest workers, CI runners), a trivial action can be descheduled long
 * enough to exceed the production default of 20 ms and be reported as `timeout`, which
 * flips the asserted outcome. Phase 5.7 measured a 69 ms worst case for such stalls;
 * 500 ms leaves a wide margin while staying far below any test's own timeout.
 *
 * Only use these where a timeout is *not* the behaviour under test. Dedicated timeout,
 * deadline and never-settling tests keep their short explicit budgets, and fixtures with
 * deliberate infinite loops must not be given this budget (each looping execution would
 * then take 500 ms). The production default (20 ms) is unchanged.
 */
export const SUCCESS_PATH_BUDGET_MS = 500;

/** Options for direct `runInIsolate` calls. */
export const SUCCESS_PATH_RUNTIME_OPTIONS = { timeoutMs: SUCCESS_PATH_BUDGET_MS } as const;

/** CLI arguments for `sis audit` invocations. */
export const SUCCESS_PATH_CLI_ARGS: readonly string[] = ["--timeout", String(SUCCESS_PATH_BUDGET_MS)];
