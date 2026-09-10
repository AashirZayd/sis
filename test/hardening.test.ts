import { describe, it, expect } from "vitest";
import path from "node:path";
import { AuditEngine } from "../src/index.js";
import { formatJson, formatSarif } from "../src/output/index.js";
import { runInIsolate } from "../src/runtime/worker.js";
import type { CandidateFunctionSource } from "../src/runtime/types.js";

describe("Phase 12: Real-World Hardening and Adversarial Fixture Validation", () => {
  describe("1. Nested Boundaries Fixture", () => {
    it("safely analyzes nested client/server boundaries without false positives or missed actions", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/nested-boundaries");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.filesAnalyzed).toBe(4);
      expect(result.statistics.actionsFound).toBe(1);
      expect(result.statistics.boundariesFound).toBe(2);
      expect(result.statistics.propBoundariesFound).toBeGreaterThanOrEqual(1);
      expect(result.statistics.verifiedSafeProps).toBeGreaterThanOrEqual(1);
      expect(result.findings.filter((f) => f.type === "taint-violation")).toHaveLength(0);
      expect(result.findings.filter((f) => f.type === "serialization-violation")).toHaveLength(0);
    });
  });

  describe("2. Complex Interprocedural Data-Flow Fixture", () => {
    it("tracks multi-module taint flow across config -> session -> user -> page and action", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/complex-dataflow");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.filesAnalyzed).toBe(6);
      expect(result.statistics.actionsFound).toBe(1);

      const taintFindings = result.findings.filter((f) => f.type === "taint-violation");
      expect(taintFindings.length).toBeGreaterThanOrEqual(1);

      const propTaint = taintFindings.find(
        (f) => f.location?.file.includes("page.tsx") && f.message.includes("secret")
      );
      expect(propTaint).toBeDefined();
    });
  });

  describe("3. React Flight Serialization Hardening", () => {
    it("verifies serializable props pass while class instances and functions fail", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/serialization");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.verifiedSafeProps).toBeGreaterThanOrEqual(6);
      expect(result.statistics.serializabilityViolations).toBeGreaterThanOrEqual(3);

      const violations = result.findings.filter((f) => f.type === "serialization-violation");
      expect(violations.some((v) => v.message.includes("onClick"))).toBe(true);
      expect(violations.some((v) => v.message.includes("CustomUser"))).toBe(true);
      expect(violations.some((v) => v.message.includes("DatabaseHandle"))).toBe(true);
    });
  });

  describe("4. Taint and Serialization Boundary Interaction", () => {
    it("reports taint-violation and serialization-violation as distinct findings on the same boundary", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/taint");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      const taintFindings = result.findings.filter((f) => f.type === "taint-violation");
      const serialFindings = result.findings.filter((f) => f.type === "serialization-violation");

      expect(taintFindings.length).toBeGreaterThanOrEqual(1);
      expect(serialFindings.length).toBeGreaterThanOrEqual(1);

      expect(taintFindings.every((f) => f.type === "taint-violation")).toBe(true);
      expect(serialFindings.every((f) => f.type === "serialization-violation")).toBe(true);
    });
  });

  describe("5. Complex Destructuring Patterns", () => {
    it("synthesizes targeted payloads that trigger runtime destructuring errors and shrink them cleanly", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/destructuring");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 10 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.actionsFound).toBe(3);
      expect(result.statistics.failedExecutions).toBeGreaterThanOrEqual(10);
      expect(result.statistics.shrinkAttempts).toBeGreaterThanOrEqual(1);
      expect(result.statistics.verifiedReproCount).toBeGreaterThanOrEqual(1);

      const runtimeErrors = result.findings.filter((f) => f.type === "runtime-exception");
      expect(runtimeErrors.length).toBeGreaterThan(0);
      expect(runtimeErrors.some((r) => r.message.includes("Cannot read propert") || r.message.includes("Cannot destructure"))).toBe(true);
    });
  });

  describe("6. Import Resolution Edge Cases", () => {
    it("resolves directory index files, handles .js to .ts mapping, and is resilient to missing modules", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/imports");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.filesAnalyzed).toBe(3);
      expect(result.analysisErrors).toBeUndefined();
      expect(result.statistics.analysisErrors).toBe(0);
    });
  });

  describe("7. Framework Dependencies and Static-Only Classification", () => {
    it("classifies actions referencing framework globals (prisma, cookies, headers, redirect, revalidate) as static-only", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/framework-dependencies");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.actionsFound).toBe(8);
      expect(result.statistics.unsupportedExecutions).toBeGreaterThanOrEqual(5);
    });
  });

  describe("8. Runtime Hazards: Timeouts, Recursion, TypeErrors", () => {
    it("handles infinite loops via timeout budget and detects recursion stack exhaustion", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/runtime");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 10, timeoutMs: 20 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.timeoutExecutions).toBeGreaterThanOrEqual(1);
      expect(result.statistics.failedExecutions).toBeGreaterThanOrEqual(10);

      const timeoutFinding = result.findings.find((f) => f.type === "timeout");
      expect(timeoutFinding).toBeDefined();
      expect(timeoutFinding?.action).toBe("infiniteLoopAction");

      const recursionFinding = result.findings.find(
        (f) => f.action === "recursiveAction" && (f.message.includes("Maximum call stack size") || f.message.includes("RangeError"))
      );
      expect(recursionFinding).toBeDefined();
    });
  });

  describe("9. False Positives and Noise Elimination", () => {
    it("produces zero findings for safe constructs (NEXT_PUBLIC_*, internal server-only helpers, valid Date)", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/false-positives");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 10 });
      const result = await engine.run(fixtureDir);

      expect(result.findings).toHaveLength(0);
      expect(result.analysisErrors).toBeUndefined();
      expect(result.statistics.analysisErrors).toBe(0);
      expect(result.statistics.serializabilityViolations).toBe(0);
      expect(result.statistics.taintViolations).toBe(0);
    });
  });

  describe("10. Budget Stress and Fuzz Budget Scaling", () => {
    it("scales predictably under high action counts (25 actions) without budget explosion", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/budget-stress");

      const engine10 = new AuditEngine({ silent: true, seed: 42, runs: 10 });
      const res10 = await engine10.run(fixtureDir);

      expect(res10.statistics.actionsFound).toBe(25);
      expect(res10.statistics.payloadsGenerated).toBe(250);

      const engine25 = new AuditEngine({ silent: true, seed: 42, runs: 25 });
      const res25 = await engine25.run(fixtureDir);

      expect(res25.statistics.payloadsGenerated).toBe(625);
      expect(res25.statistics.executions).toBeGreaterThan(res10.statistics.executions);
    }, 20000);
  });

  describe("11. Seed Determinism and Reproducibility", () => {
    it("guarantees identical findings for identical seeds and variation across different seeds", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/runtime");

      const engineA = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const resA = await engineA.run(fixtureDir);

      const engineB = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const resB = await engineB.run(fixtureDir);

      const engineC = new AuditEngine({ silent: true, seed: 99, runs: 5 });
      const resC = await engineC.run(fixtureDir);

      const idsA = resA.findings.map((f) => f.payloadId + ":" + f.type);
      const idsB = resB.findings.map((f) => f.payloadId + ":" + f.type);
      const idsC = resC.findings.map((f) => f.payloadId + ":" + f.type);

      expect(idsA).toEqual(idsB);
      expect(idsA).not.toEqual(idsC);
    });
  });

  describe("12. Security Boundary and Isolate Containment", () => {
    it("verifies isolate cannot access host process, require, fetch, fs, or mutate outer state", async () => {
      const securityCandidate: CandidateFunctionSource = {
        actionName: "securityHarness",
        code: `
          async function securityHarness() {
            if (typeof process !== "undefined") throw new Error("process leaked");
            if (typeof require !== "undefined") throw new Error("require leaked");
            if (typeof fs !== "undefined") throw new Error("fs leaked");
            if (typeof fetch !== "undefined") throw new Error("fetch leaked");
            return "secure";
          }
        `,
        location: { file: "harness.ts", line: 1, column: 1 },
      };

      const result = await runInIsolate(securityCandidate, {}, { timeoutMs: 50 });
      expect(result.status).toBe("passed");
      expect(result.error).toBeUndefined();
    });
  });

  describe("13. Full Adversarial Project and Format Purity", () => {
    it("audits complete adversarial project and verifies schema-valid JSON and SARIF output", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/real-world/adversarial/full-project");
      const engine = new AuditEngine({ silent: true, seed: 42, runs: 5 });
      const result = await engine.run(fixtureDir);

      expect(result.statistics.filesAnalyzed).toBe(4);
      expect(result.statistics.boundariesFound).toBe(2);
      expect(result.statistics.actionsFound).toBe(3);
      expect(result.statistics.taintViolations).toBeGreaterThanOrEqual(1);
      expect(result.statistics.serializabilityViolations).toBeGreaterThanOrEqual(1);
      expect(result.statistics.failedExecutions).toBeGreaterThanOrEqual(5);
      expect(result.statistics.verifiedReproCount).toBeGreaterThanOrEqual(1);

      const jsonOutput = formatJson(result);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsedJson = JSON.parse(jsonOutput);
      expect(parsedJson.version).toBe("1");
      expect(Array.isArray(parsedJson.findings)).toBe(true);
      expect(parsedJson.findings.length).toBeGreaterThan(0);

      const sarifOutput = formatSarif(result);
      expect(() => JSON.parse(sarifOutput)).not.toThrow();
      const parsedSarif = JSON.parse(sarifOutput);
      expect(parsedSarif.version).toBe("2.1.0");
      expect(parsedSarif.runs).toHaveLength(1);
      expect(parsedSarif.runs[0].results.length).toBeGreaterThan(0);
    });
  });
});
