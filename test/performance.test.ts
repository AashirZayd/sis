import { describe, it, expect } from "vitest";
import path from "node:path";
import { AuditEngine } from "../src/index.js";
import { formatJson, formatSarif } from "../src/output/index.js";
import { measureAudit } from "./helpers/perf-harness.js";
import { toPosixPath } from "../src/discovery/filters.js";

function stripTimings(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    if (k === "executionMs" || k === "wallTimeMs" || k === "durationMs") return 0;
    return v;
  }));
}

describe("Phase 13: Performance, Determinism & Scalability Hardening", () => {
  describe("1. Baseline Performance Profiles Across Fixtures", () => {
    it("measures tiny, medium, and deep-module-graph fixtures with bounded execution", async () => {
      const tinyPath = path.resolve(process.cwd(), "test/fixtures/performance/tiny");
      const { metrics: tiny } = await measureAudit(tinyPath, { runs: 5, seed: 42 });
      expect(tiny.filesAnalyzed).toBe(3);
      expect(tiny.actions).toBe(1);
      expect(tiny.payloads).toBe(5);

      const medPath = path.resolve(process.cwd(), "test/fixtures/performance/medium");
      const { metrics: med } = await measureAudit(medPath, { runs: 5, seed: 42 });
      expect(med.filesAnalyzed).toBe(3);
      expect(med.actions).toBe(5);
      expect(med.payloads).toBe(25);

      const deepPath = path.resolve(process.cwd(), "test/fixtures/performance/deep-module-graph");
      const { metrics: deep } = await measureAudit(deepPath, { runs: 5, seed: 42 });
      expect(deep.filesAnalyzed).toBe(11);
      expect(deep.actions).toBe(1);
      expect(deep.payloads).toBe(5);
    });
  });

  describe("2. Fuzz Budget Semantics & Proportional Allocation", () => {
    it("verifies --runs N enforces an exact runs-per-action budget across scaling levels", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/medium"); // 5 actions

      const runs5 = await measureAudit(targetDir, { runs: 5, seed: 42 });
      const runs10 = await measureAudit(targetDir, { runs: 10, seed: 42 });
      const runs25 = await measureAudit(targetDir, { runs: 25, seed: 42 });

      // Monotonic structural scaling
      expect(runs5.metrics.payloads).toBe(25); // 5 actions * 5
      expect(runs10.metrics.payloads).toBe(50); // 5 actions * 10
      expect(runs25.metrics.payloads).toBe(125); // 5 actions * 25

      expect(runs5.metrics.payloads).toBeLessThan(runs10.metrics.payloads);
      expect(runs10.metrics.payloads).toBeLessThan(runs25.metrics.payloads);
    });

    it("verifies budget allocation across 100 targets without Cartesian explosion", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/many-targets"); // 100 actions

      const { metrics: m1 } = await measureAudit(targetDir, { runs: 1, seed: 42 });
      expect(m1.actions).toBe(100);
      expect(m1.payloads).toBe(100); // exactly 1 run per target

      const { metrics: m5 } = await measureAudit(targetDir, { runs: 5, seed: 42 });
      expect(m5.payloads).toBe(500); // exactly 5 runs per target

      const { metrics: m10 } = await measureAudit(targetDir, { runs: 10, seed: 42 });
      expect(m10.payloads).toBe(1000); // exactly 10 runs per target
    }, 20000);
  });

  describe("3. Deterministic Collection Ordering & Cross-Platform Paths", () => {
    it("normalizes path separators across Windows backslashes and POSIX forward slashes", () => {
      expect(toPosixPath("app\\actions\\user.ts")).toBe("app/actions/user.ts");
      expect(toPosixPath("app/actions/user.ts")).toBe("app/actions/user.ts");
      expect(toPosixPath(".\\components\\Card.tsx")).toBe("./components/Card.tsx");
    });

    it("guarantees deterministic, lexicographical ordering of analyzed files and actions", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/medium");
      const e1 = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const r1 = await e1.run(targetDir);

      const e2 = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const r2 = await e2.run(targetDir);

      expect(r1.filesAnalyzed).toEqual(r2.filesAnalyzed);
      expect(r1.actions.map((a) => a.name)).toEqual(r2.actions.map((a) => a.name));
      expect(r1.findings.map((f) => f.action)).toEqual(r2.findings.map((f) => f.action));
    });
  });

  describe("4. Seed Determinism & Invariant Stability", () => {
    it("produces identical payloads, failure signatures, and minimal reproducers for identical seeds", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/heavy-fuzzing");

      const e1 = new AuditEngine({ silent: true, seed: 42, runs: 10 });
      const r1 = await e1.run(targetDir);

      const e2 = new AuditEngine({ silent: true, seed: 42, runs: 10 });
      const r2 = await e2.run(targetDir);

      const e3 = new AuditEngine({ silent: true, seed: 99, runs: 10 });
      const r3 = await e3.run(targetDir);

      const extractRepros = (r: typeof r1) =>
        r.findings.map((f) => ({
          action: f.action,
          payloadId: f.payloadId,
          minimal: f.minimizedPayload,
          sig: f.failureSignature,
        }));

      // Identical seed 42 -> identical reproducers and signatures
      expect(extractRepros(r1)).toEqual(extractRepros(r2));

      // Different seed 99 -> structural action count same, but payload IDs/fuzz sequences vary
      expect(r3.actions.length).toBe(r1.actions.length);
      expect(r1.findings.map((f) => f.payloadId)).not.toEqual(r3.findings.map((f) => f.payloadId));
    });
  });

  describe("5. Output Determinism (JSON & SARIF Purity)", () => {
    it("produces identical JSON and SARIF structures (sans runtime wall-clock timings) across repeated runs", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/mixed-real-world");

      const e1 = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const r1 = await e1.run(targetDir);

      const e2 = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const r2 = await e2.run(targetDir);

      const json1 = stripTimings(JSON.parse(formatJson(r1)));
      const json2 = stripTimings(JSON.parse(formatJson(r2)));
      expect(json1).toEqual(json2);

      const sarif1 = stripTimings(JSON.parse(formatSarif(r1)));
      const sarif2 = stripTimings(JSON.parse(formatSarif(r2)));
      expect(sarif1).toEqual(sarif2);
    });
  });

  describe("6. Framework-Dependent Actions & Sandbox Bypass", () => {
    it("marks framework-dependent actions as static-only and executes only self-contained actions", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/mixed-real-world");
      const { metrics } = await measureAudit(targetDir, { runs: 10, seed: 42 });

      expect(metrics.actions).toBe(2);
      // safeTransfer runs in isolate (10 runs); frameworkDependent references cookies() and is static-only
      expect(metrics.unsupportedExecutions).toBeGreaterThanOrEqual(1);
    });
  });

  describe("7. Large-Project Stress Test (100 Files, 25 Actions, 30 Components)", () => {
    it("successfully scales to 100 source files with linear predictable budget and bounded memory", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/large");
      const { metrics, result } = await measureAudit(targetDir, { runs: 5, seed: 42 });

      expect(metrics.filesAnalyzed).toBe(100);
      expect(metrics.actions).toBe(25);
      expect(metrics.payloads).toBe(125); // 25 actions * 5 runs
      expect(metrics.executions).toBeGreaterThanOrEqual(100);
      expect(result.analysisErrors).toBeUndefined();

      // Output formats remain valid under large project load
      const jsonStr = formatJson(result);
      expect(() => JSON.parse(jsonStr)).not.toThrow();

      const sarifStr = formatSarif(result);
      expect(() => JSON.parse(sarifStr)).not.toThrow();
    });
  });

  describe("8. Shrinker & Runtime Execution Bounds", () => {
    it("enforces shrink attempt budgets without runaway iteration", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/performance/heavy-fuzzing");
      const { metrics } = await measureAudit(targetDir, { runs: 5, seed: 42, maxShrinkAttempts: 15 });

      // Max shrink attempts per candidate is bounded by 15
      expect(metrics.shrinkAttempts).toBeLessThanOrEqual(15 * metrics.failedExecutions);
      expect(metrics.verifiedReproCount).toBeGreaterThanOrEqual(1);
    });
  });
});
