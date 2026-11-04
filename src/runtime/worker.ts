import ivm from "isolated-vm";
import type { CandidateFunctionSource, RuntimeExecutionOptions, RuntimeStatus } from "./types.js";
import { getPreludesCode } from "./preludes/index.js";

export interface WorkerExecutionResult {
  status: RuntimeStatus;
  executionMs: number;
  wallTimeMs: number;
  timeoutMs: number;
  durationMs: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Error name recorded when the host-side wall-clock deadline terminates an execution.
 */
export const WALL_CLOCK_DEADLINE_ERROR = "WallClockDeadlineError";

/**
 * Minimum wall-clock deadline in milliseconds when none is requested explicitly.
 */
export const DEFAULT_WALL_DEADLINE_FLOOR_MS = 1000;

/**
 * Resolves the host-side wall-clock deadline for one execution.
 *
 * The default, max(10 × CPU budget, 1000ms), leaves V8's CPU `timeout` to report
 * genuine CPU-bound timeouts first. An explicitly requested deadline is honoured
 * as given; if it is shorter than the CPU budget, CPU-bound loops are terminated
 * by the wall clock and recorded as infrastructure outcomes instead of timeouts.
 */
export function resolveWallDeadlineMs(timeoutMs: number, requestedMs?: number): number {
  if (requestedMs === undefined) {
    return Math.max(timeoutMs * 10, DEFAULT_WALL_DEADLINE_FLOOR_MS);
  }
  if (!Number.isFinite(requestedMs) || requestedMs <= 0) {
    throw new RangeError(`wallTimeoutMs must be a positive number of milliseconds, received ${requestedMs}`);
  }
  return requestedMs;
}

interface IsolateResources {
  isolate?: ivm.Isolate;
  context?: ivm.Context;
  script?: ivm.Script;
  execStart?: number;
}

interface LifecycleOutcome {
  status: RuntimeStatus;
  executionMs: number;
  error?: WorkerExecutionResult["error"];
}

/**
 * Executes a candidate Server Action function against a transferred payload
 * inside a secure, zero-privilege isolated-vm V8 isolate.
 *
 * Security & Isolation Guarantees:
 * 1. Zero host globals: `process`, `require`, `import`, `fs`, `fetch`, `net`, etc. are NOT exposed.
 * 2. Dedicated execution budget: Hard deadline enforced by V8 (default 20ms).
 *    Timeout applies strictly to candidate code execution inside the isolate,
 *    excluding host-side setup, isolate bootstrap, payload transfer, and teardown.
 * 3. Wall-clock deadline: a host-side timer bounds the whole lifecycle (setup,
 *    execution, promise settlement and result transfer). V8's CPU budget does not
 *    cover time spent waiting on promises that never settle, so without this an
 *    execution could block the audit forever. On expiry the isolate is disposed and
 *    the execution is recorded as an infrastructure outcome (`execution-error`),
 *    never as an application finding. The timer runs only on the host; nothing is
 *    exposed to the isolate.
 * 4. Fresh context: Created per execution, preventing state contamination between runs.
 * 5. Safe failure isolation: Target exceptions and infinite loops are trapped and recorded.
 */
export async function runInIsolate(
  candidate: CandidateFunctionSource,
  payload: unknown,
  options: RuntimeExecutionOptions = {}
): Promise<WorkerExecutionResult> {
  const timeout = options.timeoutMs ?? 20;
  const memoryLimit = options.memoryLimitMb ?? 128;
  const wallDeadline = resolveWallDeadlineMs(timeout, options.wallTimeoutMs);

  const overallStart = Date.now();
  const resources: IsolateResources = {};

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<LifecycleOutcome>((resolve) => {
    deadlineTimer = setTimeout(() => {
      // Terminate first: disposing the isolate aborts running or pending work.
      disposeIsolate(resources.isolate);
      resolve({
        status: "execution-error",
        executionMs: resources.execStart !== undefined ? Date.now() - resources.execStart : 0,
        error: {
          name: WALL_CLOCK_DEADLINE_ERROR,
          message: `Sandbox execution exceeded the ${wallDeadline}ms wall-clock deadline; the isolate was terminated`,
        },
      });
    }, wallDeadline);
  });

  const lifecycle = executeLifecycle(candidate, payload, timeout, memoryLimit, resources);
  // A lifecycle that settles after the deadline won is intentionally ignored.
  lifecycle.catch(() => undefined);

  let outcome: LifecycleOutcome;
  try {
    outcome = await Promise.race([lifecycle, deadline]);
  } finally {
    clearTimeout(deadlineTimer);
    releaseResources(resources);
  }

  const wallTimeMs = Math.max(outcome.executionMs, Date.now() - overallStart);

  return {
    status: outcome.status,
    executionMs: outcome.executionMs,
    wallTimeMs,
    timeoutMs: timeout,
    durationMs: outcome.executionMs,
    error: outcome.error,
  };
}

/**
 * Sandbox setup, candidate execution and result transfer. Never rejects: every
 * failure is mapped to a LifecycleOutcome. Resources are recorded in `resources`
 * so the caller can release them regardless of which side of the race finishes.
 */
async function executeLifecycle(
  candidate: CandidateFunctionSource,
  payload: unknown,
  timeout: number,
  memoryLimit: number,
  resources: IsolateResources
): Promise<LifecycleOutcome> {
  let executionMs = 0;

  try {
    // Phase 1: Sandbox setup & payload transfer (outside candidate execution budget)
    const isolate = new ivm.Isolate({ memoryLimit });
    resources.isolate = isolate;
    const context = await isolate.createContext();
    resources.context = context;
    const jail = context.global;

    const copy = new ivm.ExternalCopy(payload);
    await jail.set("__sisPayload", copy.copyInto());

    const preludesCode = getPreludesCode(candidate.preludesUsed);

    const harnessCode = `
      (async function() {
        ${preludesCode}
        ${candidate.code}
        return await ${candidate.actionName}(__sisPayload);
      })()
    `;

    const script = await isolate.compileScript(harnessCode);
    resources.script = script;

    // Phase 2: Candidate execution (strictly governed by timeout budget)
    const execStart = Date.now();
    resources.execStart = execStart;
    try {
      await script.run(context, {
        timeout,
        promise: true,
        copy: true,
      });
      executionMs = Math.max(1, Date.now() - execStart);
      return { status: "passed", executionMs };
    } catch (err: unknown) {
      executionMs = Math.max(1, Date.now() - execStart);
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (errorObj.message.includes("Script execution timed out")) {
        return {
          status: "timeout",
          executionMs,
          error: {
            name: "TimeoutError",
            message: `Script execution timed out after ${timeout}ms execution budget`,
            stack: errorObj.stack,
          },
        };
      }
      if (
        errorObj.message.includes("NEXT_REDIRECT") ||
        errorObj.message.includes("NEXT_NOT_FOUND")
      ) {
        return { status: "passed", executionMs };
      }
      if (errorObj.name === "ReferenceError") {
        // Isolate sandbox limitation: missing host global or unbundled module binding
        // Must never be reported as an application runtime exception finding (SIS003)
        return {
          status: "unsupported",
          executionMs,
          error: {
            name: "ReferenceError",
            message: errorObj.message,
            stack: errorObj.stack,
          },
        };
      }
      return {
        status: "failed",
        executionMs,
        error: {
          name: errorObj.name || "Error",
          message: errorObj.message || "Unknown execution error",
          stack: errorObj.stack,
        },
      };
    }
  } catch (setupErr: unknown) {
    const errorObj = setupErr instanceof Error ? setupErr : new Error(String(setupErr));
    return {
      status: "execution-error",
      executionMs,
      error: {
        name: errorObj.name || "SetupError",
        message: errorObj.message || "Failed to initialize sandbox environment",
        stack: errorObj.stack,
      },
    };
  }
}

function disposeIsolate(isolate: ivm.Isolate | undefined): void {
  if (isolate && !isolate.isDisposed) {
    try {
      isolate.dispose();
    } catch {
      // Ignore disposal errors
    }
  }
}

/**
 * Phase 3: Teardown & resource release (outside candidate execution budget).
 */
function releaseResources(resources: IsolateResources): void {
  if (resources.script) {
    try {
      resources.script.release();
    } catch {
      // Ignore release errors
    }
  }
  if (resources.context) {
    try {
      resources.context.release();
    } catch {
      // Ignore release errors
    }
  }
  disposeIsolate(resources.isolate);
}
