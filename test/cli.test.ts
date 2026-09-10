import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve(process.cwd(), "dist/cli.js");

describe("CLI Executable End-to-End", () => {
  it("should output version with --version", async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "--version"]);
    expect(stdout.trim()).toBe("0.1.0");
  });

  it("should output help with --help", async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "--help"]);
    expect(stdout).toContain("Autonomous runtime verification for Next.js boundaries");
    expect(stdout).toContain("audit");
  });

  it("should audit a directory target and output full directory audit summary", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/project",
        "--runs",
        "5",
        "--seed",
        "42",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failure in fixture project");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("Scanning ");
      expect(execError.stdout).toContain("DISCOVERY");
      expect(execError.stdout).toContain("TAINT ANALYSIS");
      expect(execError.stdout).toContain("PAYLOAD SYNTHESIS");
      expect(execError.stdout).toContain("RUNTIME VERIFICATION");
      expect(execError.stdout).toContain("FAILURE SHRINKING");
      expect(execError.stdout).toContain("AUDIT COMPLETE");
      expect(execError.stdout).toContain("Files analyzed:");
    }
  });

  it("should audit fragile-action.ts, execute payloads, and report runtime exceptions with exit code 1", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/fragile-action.ts",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("AST ANALYSIS");
      expect(execError.stdout).toContain("1 server boundary");
      expect(execError.stdout).toContain("1 candidate Server Action");
      expect(execError.stdout).toContain("executeTransfer");
      expect(execError.stdout).toContain("PAYLOAD SYNTHESIS");
      expect(execError.stdout).toContain("RUNTIME VERIFICATION");
      expect(execError.stdout).toContain("Executed ");
      expect(execError.stdout).toContain("TypeError");
      expect(execError.stdout).toContain("FAILURE SHRINKING");
      expect(execError.stdout).toContain("Minimal reproducer:");
    }
  });

  it("should audit payload-fragile-action.ts with custom --runs and --seed and report runtime failures", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/payload-fragile-action.ts",
        "--runs",
        "25",
        "--seed",
        "1234",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("PAYLOAD SYNTHESIS");
      expect(execError.stdout).toContain("25 payloads generated");
      expect(execError.stdout).toContain("Seed: 1234");
      expect(execError.stdout).toContain("RUNTIME VERIFICATION");
      expect(execError.stdout).toContain("Executed ");
      expect(execError.stdout).toContain("TypeError");
      expect(execError.stdout).toContain("FAILURE SHRINKING");
      expect(execError.stdout).toContain("Minimal reproducer:");
    }
  });

  it("should audit payload-fragile-action.ts with --no-shrink and suppress failure shrinking", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/payload-fragile-action.ts",
        "--runs",
        "10",
        "--seed",
        "42",
        "--no-shrink",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("RUNTIME VERIFICATION");
      expect(execError.stdout).not.toContain("FAILURE SHRINKING");
    }
  });

  it("should audit shrink-complex-action.ts and output minimal reproducer under FAILURE SHRINKING", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/shrink-complex-action.ts",
        "--runs",
        "10",
        "--seed",
        "42",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("FAILURE SHRINKING");
      expect(execError.stdout).toContain("processNestedConfig");
      expect(execError.stdout).toContain("Minimal reproducer:");
      expect(execError.stdout).toContain("failure preserved");
    }
  });

  it("should audit runtime-safe-action.ts and exit with code 0", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/runtime-safe-action.ts",
      "--runs",
      "25",
      "--seed",
      "42",
    ]);
    expect(stdout).toContain("RUNTIME VERIFICATION");
    expect(stdout).toContain("No runtime failures detected");
  });

  it("should audit runtime-timeout-action.ts with --timeout and report timeout with exit code 1", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/runtime-timeout-action.ts",
        "--runs",
        "1",
        "--seed",
        "42",
        "--timeout",
        "20",
      ]);
      expect.fail("Should have exited with code 1 due to timeout");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("RUNTIME VERIFICATION");
      expect(execError.stdout).toContain("TimeoutError");
      expect(execError.stdout).toContain("Script execution timed out");
    }
  });

  it("should audit taint-direct-client.tsx and report taint violation with exit code 1", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/taint-direct-client.tsx",
      ]);
      expect.fail("Should have exited with code 1 due to taint violation");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("TAINT ANALYSIS");
      expect(execError.stdout).toContain("1 sensitive value reaches client boundary");
      expect(execError.stdout).toContain("process.env.PRIVATE_API_KEY");
      expect(execError.stdout).toContain("JSX expression");
    }
  });

  it("should audit taint-safe-server.ts and exit with code 0 without false positives", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/taint-safe-server.ts",
    ]);
    expect(stdout).toContain("TAINT ANALYSIS");
    expect(stdout).toContain("No high-confidence secret flows detected");
  });

  it("should audit taint-public-env-client.tsx and exit with code 0", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/taint-public-env-client.tsx",
    ]);
    expect(stdout).toContain("TAINT ANALYSIS");
    expect(stdout).toContain("No high-confidence secret flows detected");
  });

  it("should audit client-project and exit with code 0 without false findings", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/client-project",
    ]);
    expect(stdout).toContain("AUDIT COMPLETE");
    expect(stdout).toContain("SIS found 0 verified findings");
  });

  it("should audit empty-project and exit with code 0", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/empty-project",
    ]);
    expect(stdout).toContain("Scanning 0 source files...");
    expect(stdout).toContain("AUDIT COMPLETE");
    expect(stdout).toContain("SIS found 0 verified findings");
  });

  it("should reject a non-existent target with exit code 2 and formatted diagnostic", async () => {
    try {
      await execFileAsync(process.execPath, [cliPath, "audit", "./does-not-exist"]);
      expect.fail("Command should have exited with code 2");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string; stderr: string };
      expect(execError.code).toBe(2);
      expect(execError.stdout).toContain("Audit target does not exist");
      expect(execError.stdout).toContain("./does-not-exist");
    }
  });

  it("should audit with --format json, output pure JSON to stdout, and exit with code 1 when findings exist", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/fragile-action.ts",
        "--format",
        "json",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);

      // Stdout must be strictly valid JSON with no terminal banners or escape codes
      expect(execError.stdout).not.toContain("Speculative Invariant Synthesis");
      expect(execError.stdout).not.toContain("AUDIT COMPLETE");

      const parsed = JSON.parse(execError.stdout);
      expect(parsed.version).toBe("1");
      expect(parsed.tool.name).toBe("sis");
      expect(parsed.tool.version).toBe("0.1.0");
      expect(parsed.summary.verifiedFindings).toBeGreaterThanOrEqual(1);
      expect(parsed.findings.length).toBeGreaterThanOrEqual(1);
      expect(parsed.findings[0].ruleId).toBe("SIS003");
      expect(parsed.findings[0].actionName).toBe("executeTransfer");
    }
  });

  it("should audit clean target with --format json and exit with code 0", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "audit",
      "./test/fixtures/runtime-safe-action.ts",
      "--format",
      "json",
    ]);

    expect(stdout).not.toContain("Speculative Invariant Synthesis");
    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBe("1");
    expect(parsed.summary.verifiedFindings).toBe(0);
    expect(parsed.findings).toEqual([]);
  });

  it("should audit with --format sarif, output pure SARIF 2.1.0 to stdout, and exit with code 1 when findings exist", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/fragile-action.ts",
        "--format",
        "sarif",
      ]);
      expect.fail("Should have exited with code 1 due to runtime failures");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);

      expect(execError.stdout).not.toContain("Speculative Invariant Synthesis");
      expect(execError.stdout).not.toContain("AUDIT COMPLETE");

      const sarif = JSON.parse(execError.stdout);
      expect(sarif.$schema).toContain("sarif-schema-2.1.0.json");
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe("SIS");
      expect(sarif.runs[0].results.length).toBeGreaterThanOrEqual(1);
      expect(sarif.runs[0].results[0].ruleId).toBe("SIS003");
      expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toContain("fragile-action.ts");
    }
  });

  it("should reject unknown format with exit code 2 and error on stderr", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/runtime-safe-action.ts",
        "--format",
        "xml",
      ]);
      expect.fail("Should have exited with code 2 on unknown format");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string; stderr: string };
      expect(execError.code).toBe(2);
      expect(execError.stderr).toContain('Unknown output format: "xml"');
    }
  });

  it("should audit dataflow-project and display interprocedural taint flow trace in terminal output", async () => {
    try {
      await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/dataflow-project",
        "--runs",
        "5",
        "--seed",
        "42",
        "--max-analysis-depth",
        "6",
      ]);
      expect.fail("Should have exited with code 1 due to taint violations");
    } catch (err: unknown) {
      const execError = err as { code: number; stdout: string };
      expect(execError.code).toBe(1);
      expect(execError.stdout).toContain("TAINT ANALYSIS");
      expect(execError.stdout).toContain("process.env.AUTH_SECRET");
      expect(execError.stdout).toContain("lib/auth.ts:getSecret()");
      expect(execError.stdout).toContain("lib/session.ts:createSession()");
      expect(execError.stdout).toContain("components/profile.tsx:JSX expression");
    }
  });

  describe("Phase 14 — CLI Input Validation & Options Hardening", () => {
    it("should reject negative or zero --runs with exit code 2 and actionable diagnostic", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--runs",
          "-5",
        ]);
        expect.fail("Should have exited with code 2 on negative --runs");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --runs value");
        expect(execError.stdout).toContain("Must be a positive integer");
      }

      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--runs",
          "0",
        ]);
        expect.fail("Should have exited with code 2 on zero --runs");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --runs value");
      }
    });

    it("should reject non-numeric --runs with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--runs",
          "invalid",
        ]);
        expect.fail("Should have exited with code 2 on non-numeric --runs");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --runs value");
      }
    });

    it("should reject negative or zero --timeout with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--timeout",
          "-10",
        ]);
        expect.fail("Should have exited with code 2 on negative --timeout");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --timeout value");
      }
    });

    it("should reject negative --max-shrink-attempts with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--max-shrink-attempts",
          "-1",
        ]);
        expect.fail("Should have exited with code 2 on negative --max-shrink-attempts");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --max-shrink-attempts value");
      }
    });

    it("should reject negative or zero --max-analysis-depth with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--max-analysis-depth",
          "0",
        ]);
        expect.fail("Should have exited with code 2 on zero --max-analysis-depth");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --max-analysis-depth value");
      }
    });

    it("should reject non-numeric --seed with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--seed",
          "not-a-number",
        ]);
        expect.fail("Should have exited with code 2 on invalid --seed");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toContain("SIS ERROR");
        expect(execError.stdout).toContain("Invalid --seed value");
      }
    });

    it("should reject conflicting --json and --sarif flags with exit code 2", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/runtime-safe-action.ts",
          "--json",
          "--sarif",
        ]);
        expect.fail("Should have exited with code 2 on conflicting flags");
      } catch (err: unknown) {
        const execError = err as { code: number; stderr: string };
        expect(execError.code).toBe(2);
        expect(execError.stderr).toContain("SIS ERROR");
        expect(execError.stderr).toContain("Cannot specify both --json and --sarif simultaneously");
      }
    });

    it("should support direct --json flag alias emitting pure parseable JSON", async () => {
      const { stdout } = await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/runtime-safe-action.ts",
        "--json",
      ]);

      const parsed = JSON.parse(stdout);
      expect(parsed.version).toBe("1");
      expect(parsed.tool.name).toBe("sis");
      expect(parsed.summary.verifiedFindings).toBe(0);
    });

    it("should support direct --sarif flag alias emitting pure parseable SARIF", async () => {
      const { stdout } = await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/runtime-safe-action.ts",
        "--sarif",
      ]);

      const sarif = JSON.parse(stdout);
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs[0].tool.driver.name).toBe("SIS");
    });

    it("should support --silent mode suppressing terminal output while returning exit code 0", async () => {
      const { stdout } = await execFileAsync(process.execPath, [
        cliPath,
        "audit",
        "./test/fixtures/runtime-safe-action.ts",
        "--silent",
      ]);

      expect(stdout.trim()).toBe("");
    });

    it("should support --silent mode with findings returning exit code 1 and no stdout", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./test/fixtures/fragile-action.ts",
          "--silent",
        ]);
        expect.fail("Should have exited with code 1 due to findings");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string };
        expect(execError.code).toBe(1);
        expect(execError.stdout.trim()).toBe("");
      }
    });

    it("should direct machine-readable errors to stderr and keep stdout empty", async () => {
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "audit",
          "./does-not-exist-dir",
          "--json",
        ]);
        expect.fail("Should have exited with code 2 on non-existent path");
      } catch (err: unknown) {
        const execError = err as { code: number; stdout: string; stderr: string };
        expect(execError.code).toBe(2);
        expect(execError.stdout).toBe("");
        expect(execError.stderr).toContain("Audit target does not exist");
      }
    });
  });
});
