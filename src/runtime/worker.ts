import ivm from "isolated-vm";
import type { CandidateFunctionSource, RuntimeExecutionOptions, RuntimeStatus } from "./types.js";

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
 * Executes a candidate Server Action function against a transferred payload
 * inside a secure, zero-privilege isolated-vm V8 isolate.
 *
 * Security & Isolation Guarantees:
 * 1. Zero host globals: `process`, `require`, `import`, `fs`, `fetch`, `net`, etc. are NOT exposed.
 * 2. Dedicated execution budget: Hard deadline enforced by V8 (default 20ms).
 *    Timeout applies strictly to candidate code execution inside the isolate,
 *    excluding host-side setup, isolate bootstrap, payload transfer, and teardown.
 * 3. Fresh context: Created per execution, preventing state contamination between runs.
 * 4. Safe failure isolation: Target exceptions and infinite loops are trapped and recorded.
 */
export async function runInIsolate(
  candidate: CandidateFunctionSource,
  payload: unknown,
  options: RuntimeExecutionOptions = {}
): Promise<WorkerExecutionResult> {
  const timeout = options.timeoutMs ?? 20;
  const memoryLimit = options.memoryLimitMb ?? 128;

  let isolate: ivm.Isolate | undefined;
  let context: ivm.Context | undefined;
  let script: ivm.Script | undefined;

  const overallStart = Date.now();
  let executionMs = 0;
  let status: RuntimeStatus = "passed";
  let error: WorkerExecutionResult["error"] | undefined;

  try {
    // Phase 1: Sandbox setup & payload transfer (outside candidate execution budget)
    isolate = new ivm.Isolate({ memoryLimit });
    context = await isolate.createContext();
    const jail = context.global;

    const copy = new ivm.ExternalCopy(payload);
    await jail.set("__sisPayload", copy.copyInto());

    const harnessCode = `
      (async function() {
        ${candidate.code}
        return await ${candidate.actionName}(__sisPayload);
      })()
    `;

    script = await isolate.compileScript(harnessCode);

    // Phase 2: Candidate execution (strictly governed by timeout budget)
    const execStart = Date.now();
    try {
      await script.run(context, {
        timeout,
        promise: true,
        copy: true,
      });
      executionMs = Math.max(1, Date.now() - execStart);
      status = "passed";
    } catch (err: unknown) {
      executionMs = Math.max(1, Date.now() - execStart);
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (errorObj.message.includes("Script execution timed out")) {
        status = "timeout";
        error = {
          name: "TimeoutError",
          message: `Script execution timed out after ${timeout}ms execution budget`,
          stack: errorObj.stack,
        };
      } else {
        status = "failed";
        error = {
          name: errorObj.name || "Error",
          message: errorObj.message || "Unknown execution error",
          stack: errorObj.stack,
        };
      }
    }
  } catch (setupErr: unknown) {
    status = "execution-error";
    const errorObj = setupErr instanceof Error ? setupErr : new Error(String(setupErr));
    error = {
      name: errorObj.name || "SetupError",
      message: errorObj.message || "Failed to initialize sandbox environment",
      stack: errorObj.stack,
    };
  } finally {
    // Phase 3: Teardown & resource release (outside candidate execution budget)
    if (script) {
      try {
        script.release();
      } catch {
        // Ignore release errors
      }
    }
    if (context) {
      try {
        context.release();
      } catch {
        // Ignore release errors
      }
    }
    if (isolate && !isolate.isDisposed) {
      try {
        isolate.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
  }

  const wallTimeMs = Math.max(executionMs, Date.now() - overallStart);

  return {
    status,
    executionMs,
    wallTimeMs,
    timeoutMs: timeout,
    durationMs: executionMs,
    error,
  };
}
