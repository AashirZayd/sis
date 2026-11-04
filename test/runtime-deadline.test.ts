import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runInIsolate,
  resolveWallDeadlineMs,
  WALL_CLOCK_DEADLINE_ERROR,
  DEFAULT_WALL_DEADLINE_FLOOR_MS,
  AuditEngine,
  type CandidateFunctionSource,
} from "../src/index.js";

/**
 * Wall-clock execution deadline (Reliability Reset change S-0, audit V-26).
 *
 * V8's CPU `timeout` does not cover time spent waiting on promises that never
 * settle, so before S-0 such an action blocked the whole audit indefinitely.
 *
 * Timing assertions use generous upper bounds (seconds, not milliseconds) so the
 * tests are robust on slow CI machines; they assert termination and
 * classification, not precise durations.
 */

const candidate = (body: string): CandidateFunctionSource => ({
  actionName: "act",
  code: `async function act(x) { ${body} }`,
  location: { file: "deadline.ts", line: 1, column: 1 },
});

const NEVER_SETTLES = "await new Promise(() => {}); return 1;";

let unhandledRejections = 0;
const onUnhandled = () => {
  unhandledRejections++;
};

beforeAll(() => {
  process.on("unhandledRejection", onUnhandled);
});

afterAll(() => {
  process.off("unhandledRejection", onUnhandled);
});

describe("resolveWallDeadlineMs", () => {
  it("defaults to max(10 × CPU budget, 1000ms)", () => {
    expect(resolveWallDeadlineMs(20)).toBe(DEFAULT_WALL_DEADLINE_FLOOR_MS);
    expect(resolveWallDeadlineMs(500)).toBe(5000);
  });

  it("honours an explicit deadline exactly and rejects invalid values", () => {
    expect(resolveWallDeadlineMs(20, 300)).toBe(300);
    expect(resolveWallDeadlineMs(500, 100)).toBe(100);
    expect(() => resolveWallDeadlineMs(20, 0)).toThrow(RangeError);
    expect(() => resolveWallDeadlineMs(20, Number.NaN)).toThrow(RangeError);
  });
});

describe("Wall-clock execution deadline", () => {
  it("terminates a never-settling promise as an infrastructure outcome, not a finding status", async () => {
    const started = Date.now();
    const result = await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 300 });
    const elapsed = Date.now() - started;

    expect(result.status).toBe("execution-error");
    expect(result.error?.name).toBe(WALL_CLOCK_DEADLINE_ERROR);
    expect(result.error?.message).toContain("300ms wall-clock deadline");
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(10_000);
  });

  it("applies the default deadline when none is requested", async () => {
    const started = Date.now();
    const result = await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20 });
    expect(result.status).toBe("execution-error");
    expect(result.error?.message).toContain(`${DEFAULT_WALL_DEADLINE_FLOOR_MS}ms wall-clock deadline`);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("does not interrupt slow but settling promise chains that finish within budget", async () => {
    const body = `
      const start = Date.now();
      let steps = 0;
      while (Date.now() - start < 150) { await null; steps++; }
      return steps;
    `;
    const result = await runInIsolate(candidate(body), null, { timeoutMs: 3000, wallTimeoutMs: 8000 });
    expect(result.status).toBe("passed");
  });

  it("leaves synchronous infinite loops to the CPU budget (timeout status unchanged)", async () => {
    const result = await runInIsolate(candidate("while (true) {}"), null, { timeoutMs: 50, wallTimeoutMs: 5000 });
    expect(result.status).toBe("timeout");
    expect(result.error?.name).toBe("TimeoutError");
  });

  it("terminates a CPU-bound loop late when the wall deadline expires before the CPU budget", async () => {
    const started = Date.now();
    const result = await runInIsolate(candidate("while (true) {}"), null, { timeoutMs: 60_000, wallTimeoutMs: 300 });
    expect(result.status).toBe("execution-error");
    expect(result.error?.name).toBe(WALL_CLOCK_DEADLINE_ERROR);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("bounds result inspection of a returned Proxy whose trap never returns", async () => {
    // Awaiting the returned value probes `then`, which runs the trap after the
    // action body has returned. Classification of this case is unchanged legacy
    // behavior (CPU timeout); the deadline guarantees termination when the CPU
    // budget is large.
    const body = "return new Proxy({}, { get() { while (true) {} } });";

    const cpuBound = await runInIsolate(candidate(body), null, { timeoutMs: 50, wallTimeoutMs: 5000 });
    expect(cpuBound.status).toBe("timeout");

    const started = Date.now();
    const wallBound = await runInIsolate(candidate(body), null, { timeoutMs: 60_000, wallTimeoutMs: 300 });
    expect(wallBound.status).toBe("execution-error");
    expect(wallBound.error?.name).toBe(WALL_CLOCK_DEADLINE_ERROR);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("returns promptly for a returned Proxy with no traps", async () => {
    const started = Date.now();
    const result = await runInIsolate(candidate("return new Proxy({ a: 1 }, {});"), null, {
      timeoutMs: 50,
      wallTimeoutMs: 5000,
    });
    expect(result.error?.name).not.toBe(WALL_CLOCK_DEADLINE_ERROR);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("cannot be defeated by application code replacing timers or the clock inside the isolate", async () => {
    const body = `
      globalThis.setTimeout = () => 0;
      globalThis.clearTimeout = () => undefined;
      Date.now = () => 0;
      ${NEVER_SETTLES}
    `;
    const result = await runInIsolate(candidate(body), null, { timeoutMs: 20, wallTimeoutMs: 300 });
    expect(result.status).toBe("execution-error");
    expect(result.error?.name).toBe(WALL_CLOCK_DEADLINE_ERROR);
  });

  it("exposes no host timers or privileged globals to the isolate", async () => {
    const body = `
      const names = ["setTimeout", "setInterval", "clearTimeout", "process", "require", "fetch", "Buffer"];
      throw new Error(names.map((n) => n + "=" + typeof globalThis[n]).join(","));
    `;
    const result = await runInIsolate(candidate(body), null, { timeoutMs: 50 });
    expect(result.status).toBe("failed");
    expect(result.error?.message).toBe(
      "setTimeout=undefined,setInterval=undefined,clearTimeout=undefined,process=undefined,require=undefined,fetch=undefined,Buffer=undefined"
    );
  });

  it("keeps the host event loop responsive while an execution is stalled", async () => {
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
    }, 10);
    try {
      await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 400 });
    } finally {
      clearInterval(interval);
    }
    expect(ticks).toBeGreaterThanOrEqual(5);
  });

  it("supports repeated and concurrent executions after deadline terminations", async () => {
    for (let i = 0; i < 3; i++) {
      const stalled = await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 200 });
      expect(stalled.status).toBe("execution-error");
    }

    const concurrent = await Promise.all([
      runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 300 }),
      runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 300 }),
      runInIsolate(candidate("return x + 1;"), 41, { timeoutMs: 50, wallTimeoutMs: 5000 }),
    ]);
    expect(concurrent.map((r) => r.status)).toEqual(["execution-error", "execution-error", "passed"]);

    const healthy = await runInIsolate(candidate("return x * 2;"), 21, { timeoutMs: 50 });
    expect(healthy.status).toBe("passed");
  });

  it("produces no unhandled rejections from late isolate termination", async () => {
    await runInIsolate(candidate(NEVER_SETTLES), null, { timeoutMs: 20, wallTimeoutMs: 200 });
    await runInIsolate(candidate("while (true) {}"), null, { timeoutMs: 60_000, wallTimeoutMs: 200 });
    // Give abandoned lifecycles time to settle after their isolates were disposed.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(unhandledRejections).toBe(0);
  });
});

describe("Wall-clock deadline in a full audit", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-deadline-"));
    fs.writeFileSync(
      path.join(dir, "actions.ts"),
      '"use server";\n\nexport async function waitForever(input: { id: string }) {\n  await new Promise(() => {});\n  return input.id;\n}\n'
    );
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("completes and records stalled executions as unsupported, not as runtime findings", async () => {
    const started = Date.now();
    const result = await new AuditEngine({ silent: true, seed: 42, runs: 2 }).run(dir);

    expect(Date.now() - started).toBeLessThan(60_000);
    expect(result.findings.filter((f) => f.type === "runtime-exception" || f.type === "timeout")).toEqual([]);
    expect(result.statistics.failedExecutions).toBe(0);
    expect(result.statistics.timeoutExecutions).toBe(0);
    expect(result.statistics.unsupportedExecutions).toBeGreaterThanOrEqual(1);
  }, 90_000);
});
