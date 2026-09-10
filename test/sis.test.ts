import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  AuditEngine,
  audit,
  TargetNotFoundError,
  SisError,
  formatLocation,
  formatFinding,
  type Boundary,
  type Finding,
  type ServerAction,
} from "../src/index.js";

describe("Core Contracts & Types", () => {
  it("should compile and preserve foundational boundary types", () => {
    const boundary: Boundary = {
      type: "server",
      location: { file: "app/actions.ts", line: 10, column: 1 },
    };
    expect(boundary.type).toBe("server");
    expect(boundary.location.line).toBe(10);
  });

  it("should compile and preserve candidate server action types", () => {
    const action: ServerAction = {
      name: "executeTransfer",
      location: { file: "app/actions.ts", line: 15, column: 14 },
    };
    expect(action.name).toBe("executeTransfer");
  });

  it("should format source locations correctly", () => {
    const loc = { file: "src/app/page.tsx", line: 42, column: 7 };
    expect(formatLocation(loc)).toBe("src/app/page.tsx:42:7");
  });

  it("should format findings with severity and message", () => {
    const finding: Finding = {
      type: "invariant-violation",
      severity: "error",
      message: "Uncaught exception with null payload",
      location: { file: "app/actions.ts", line: 5, column: 1 },
      action: "executeTransfer",
    };
    const formatted = formatFinding(finding);
    expect(formatted).toContain("ERROR");
    expect(formatted).toContain("executeTransfer");
    expect(formatted).toContain("Uncaught exception with null payload");
  });
});

describe("AuditEngine Contract & Phase 2 Integration", () => {
  it("should successfully audit an empty directory target", async () => {
    const engine = new AuditEngine({ silent: true });
    const result = await engine.run("./test/fixtures/empty-project");

    expect(result).toBeDefined();
    expect(result.target).toBe(path.resolve(process.cwd(), "./test/fixtures/empty-project"));
    expect(result.boundaries).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.statistics.filesAnalyzed).toBe(0);
  });

  it("should parse fragile-action.ts with accurate boundary and candidate action", async () => {
    const engine = new AuditEngine({ silent: true });
    const result = await engine.run("./test/fixtures/fragile-action.ts");

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("server");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].name).toBe("executeTransfer");

    expect(result.statistics.filesScanned).toBe(1);
    expect(result.statistics.boundariesFound).toBe(1);
    expect(result.statistics.actionsFound).toBe(1);
  });

  it("should parse valid-action.ts with accurate boundary and candidate action", async () => {
    const result = await audit("./test/fixtures/valid-action.ts", { silent: true });

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("server");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].name).toBe("safeLookup");
    expect(result.statistics.actionsFound).toBe(1);
  });

  it("should parse leaky-component.tsx as client boundary and detect taint violation", async () => {
    const result = await audit("./test/fixtures/leaky-component.tsx", { silent: true });

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("client");
    expect(result.actions).toHaveLength(0);
    expect(result.statistics.boundariesFound).toBe(1);
    expect(result.statistics.actionsFound).toBe(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("taint-violation");
    expect(result.findings[0].severity).toBe("error");
    expect(result.statistics.taintViolations).toBe(1);
  });

  it("should detect direct client taint leak in taint-direct-client.tsx", async () => {
    const result = await audit("./test/fixtures/taint-direct-client.tsx", { silent: true });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("taint-violation");
    expect(result.statistics.taintViolations).toBe(1);
  });

  it("should detect propagated client taint in taint-propagated-client.tsx", async () => {
    const result = await audit("./test/fixtures/taint-propagated-client.tsx", { silent: true });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].trace).toEqual([
      "process.env.PRIVATE_API_KEY",
      "secret",
      "value",
      "JSX expression",
    ]);
  });

  it("should not flag safe server secret usage in taint-safe-server.ts", async () => {
    const result = await audit("./test/fixtures/taint-safe-server.ts", { silent: true });
    expect(result.findings).toHaveLength(0);
    expect(result.statistics.taintViolations).toBe(0);
  });

  it("should not flag public environment variables in taint-public-env-client.tsx", async () => {
    const result = await audit("./test/fixtures/taint-public-env-client.tsx", { silent: true });
    expect(result.findings).toHaveLength(0);
    expect(result.statistics.taintViolations).toBe(0);
    expect(result.statistics.payloadsGenerated).toBe(0);
    expect(result.payloadSynthesis).toBeUndefined();
  });

  it("should synthesize payloads and execute runtime verification for payload-fragile-action.ts", async () => {
    const result = await audit("./test/fixtures/payload-fragile-action.ts", {
      runs: 25,
      seed: 123,
      silent: true,
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].name).toBe("executeTransfer");
    expect(result.statistics.payloadsGenerated).toBe(25);
    expect(result.statistics.executions).toBeGreaterThan(0);

    expect(result.payloadSynthesis).toBeDefined();
    expect(result.payloadSynthesis?.requestedRuns).toBe(25);
    expect(result.payloadSynthesis?.generatedRuns).toBe(25);
    expect(result.payloadSynthesis?.seed).toBe(123);
    expect(result.payloadSynthesis?.payloads).toHaveLength(25);

    expect(result.runtime).toBeDefined();
    expect(result.runtime?.executed).toBeGreaterThan(0);
    expect(result.runtime?.failed).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.type === "runtime-exception")).toBe(true);
  });

  it("should verify runtime-safe-action.ts with 0 runtime failures", async () => {
    const result = await audit("./test/fixtures/runtime-safe-action.ts", {
      runs: 25,
      seed: 42,
      silent: true,
    });

    expect(result.runtime).toBeDefined();
    expect(result.runtime?.failed).toBe(0);
    expect(result.runtime?.timedOut).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("should detect timeout in runtime-timeout-action.ts within execution budget", async () => {
    const result = await audit("./test/fixtures/runtime-timeout-action.ts", {
      runs: 1,
      seed: 42,
      timeoutMs: 20,
      silent: true,
    });

    expect(result.runtime).toBeDefined();
    expect(result.runtime?.timedOut).toBe(1);
    expect(result.findings.some((f) => f.type === "timeout")).toBe(true);
  });

  it("should shrink failing payloads and populate shrinkResults for payload-fragile-action.ts", async () => {
    const result = await audit("./test/fixtures/payload-fragile-action.ts", {
      runs: 10,
      seed: 42,
      silent: true,
    });

    expect(result.shrinkResults).toBeDefined();
    expect(result.shrinkResults?.length).toBeGreaterThan(0);

    const firstShrink = result.shrinkResults![0];
    expect(firstShrink.actionName).toBe("executeTransfer");
    expect(firstShrink.verified).toBe(true);
    expect(firstShrink.statistics.attempts).toBeGreaterThan(0);

    // Finding must be enriched with minimal reproducer
    const failingFinding = result.findings.find(
      (f) => f.type === "runtime-exception" && f.minimizedPayload !== undefined
    );
    expect(failingFinding).toBeDefined();
    expect(failingFinding?.minimalReproducerVerified).toBe(true);
    expect(failingFinding?.failureSignature).toBeDefined();
  });

  it("should shrink complex nested payload in shrink-complex-action.ts", async () => {
    const result = await audit("./test/fixtures/shrink-complex-action.ts", {
      runs: 10,
      seed: 42,
      silent: true,
    });

    expect(result.shrinkResults).toBeDefined();
    expect(result.shrinkResults?.length).toBeGreaterThan(0);

    const shrink = result.shrinkResults![0];
    expect(shrink.actionName).toBe("processNestedConfig");
    expect(shrink.verified).toBe(true);
    expect(shrink.minimalPayload).toBeDefined();
  });

  it("should bypass shrinking when shrink: false is specified", async () => {
    const result = await audit("./test/fixtures/payload-fragile-action.ts", {
      runs: 10,
      seed: 42,
      shrink: false,
      silent: true,
    });

    expect(result.shrinkResults).toBeUndefined();
    const findingsWithShrink = result.findings.filter(
      (f) => f.minimizedPayload !== undefined
    );
    expect(findingsWithShrink).toHaveLength(0);
  });

  it("should throw TargetNotFoundError when target path does not exist", async () => {
    const engine = new AuditEngine({ silent: true });
    await expect(engine.run("./path/to/nowhere")).rejects.toThrow(
      TargetNotFoundError
    );
  });

  it("should inherit TargetNotFoundError from SisError", () => {
    const err = new TargetNotFoundError("./missing");
    expect(err).toBeInstanceOf(SisError);
    expect(err).toBeInstanceOf(Error);
    expect(err.target).toBe("./missing");
  });
});
