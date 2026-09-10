import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  discoverFiles,
  deriveFileSeed,
  toPosixPath,
  shouldIgnoreDirectory,
  isSupportedSourceFile,
} from "../src/discovery/index.js";
import { AuditEngine, audit } from "../src/index.js";

describe("Discovery Subsystem (Phase 7)", () => {
  describe("Path Normalization & Filters (filters.ts)", () => {
    it("normalizes path separators to POSIX forward slashes", () => {
      expect(toPosixPath("app\\actions\\user.ts")).toBe("app/actions/user.ts");
      expect(toPosixPath("C:\\project\\app\\page.tsx")).toBe("C:/project/app/page.tsx");
      expect(toPosixPath("src/components/button.jsx")).toBe("src/components/button.jsx");
    });

    it("correctly identifies supported and unsupported extensions", () => {
      expect(isSupportedSourceFile("action.ts")).toBe(true);
      expect(isSupportedSourceFile("component.tsx")).toBe(true);
      expect(isSupportedSourceFile("server.js")).toBe(true);
      expect(isSupportedSourceFile("client.jsx")).toBe(true);

      // Unsupported
      expect(isSupportedSourceFile("styles.css")).toBe(false);
      expect(isSupportedSourceFile("data.json")).toBe(false);
      expect(isSupportedSourceFile("README.md")).toBe(false);
      expect(isSupportedSourceFile("image.png")).toBe(false);
      expect(isSupportedSourceFile("package-lock.json")).toBe(false);

      // TypeScript declaration files must be excluded
      expect(isSupportedSourceFile("types.d.ts")).toBe(false);
      expect(isSupportedSourceFile("globals.d.tsx")).toBe(false);
    });

    it("identifies default ignored directories", () => {
      expect(shouldIgnoreDirectory("node_modules")).toBe(true);
      expect(shouldIgnoreDirectory(".git")).toBe(true);
      expect(shouldIgnoreDirectory(".next")).toBe(true);
      expect(shouldIgnoreDirectory("dist")).toBe(true);
      expect(shouldIgnoreDirectory("build")).toBe(true);
      expect(shouldIgnoreDirectory("coverage")).toBe(true);
      expect(shouldIgnoreDirectory(".sis")).toBe(true);
      expect(shouldIgnoreDirectory(".hidden_folder")).toBe(true);

      expect(shouldIgnoreDirectory("app")).toBe(false);
      expect(shouldIgnoreDirectory("components")).toBe(false);
      expect(shouldIgnoreDirectory("src")).toBe(false);
    });
  });

  describe("Deterministic Per-File Seed Derivation (seeds.ts)", () => {
    it("produces identical seeds for the same base seed and file path", () => {
      const seed1 = deriveFileSeed(42, "app/actions/transfer.ts");
      const seed2 = deriveFileSeed(42, "app/actions/transfer.ts");
      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThanOrEqual(0);
    });

    it("produces different seeds for different relative paths", () => {
      const seedA = deriveFileSeed(42, "app/actions/transfer.ts");
      const seedB = deriveFileSeed(42, "app/actions/user.ts");
      expect(seedA).not.toBe(seedB);
    });

    it("normalizes path separators when hashing seeds", () => {
      const seedWin = deriveFileSeed(42, "app\\nested\\action.ts");
      const seedPosix = deriveFileSeed(42, "app/nested/action.ts");
      expect(seedWin).toBe(seedPosix);
    });

    it("guarantees file seed independence when new files are added", () => {
      const fileA = "app/a.ts";
      const fileB = "app/b.ts";
      const fileC = "app/c.ts";

      const seedA1 = deriveFileSeed(1234, fileA);
      const seedB1 = deriveFileSeed(1234, fileB);

      // Adding fileC does not change fileA or fileB's seeds
      const seedC = deriveFileSeed(1234, fileC);
      const seedA2 = deriveFileSeed(1234, fileA);
      const seedB2 = deriveFileSeed(1234, fileB);

      expect(seedA1).toBe(seedA2);
      expect(seedB1).toBe(seedB2);
      expect(seedC).toBeDefined();
    });
  });

  describe("Directory Scanner (scanner.ts)", () => {
    it("recursively discovers source files and ignores default exclusions", async () => {
      const result = await discoverFiles("./test/fixtures/project");

      const relativePaths = result.files.map((f) => f.relativePath);

      // Discovered valid source files
      expect(relativePaths).toContain("app/actions.ts");
      expect(relativePaths).toContain("app/safe-action.ts");
      expect(relativePaths).toContain("app/nested/fragile-action.ts");
      expect(relativePaths).toContain("components/client.tsx");

      // Ignored default exclusions
      expect(relativePaths.some((p) => p.includes("node_modules"))).toBe(false);
      expect(relativePaths.some((p) => p.includes(".next"))).toBe(false);
      expect(relativePaths.some((p) => p.includes("dist"))).toBe(false);
    });

    it("returns deterministically sorted file paths", async () => {
      const run1 = await discoverFiles("./test/fixtures/project");
      const run2 = await discoverFiles("./test/fixtures/project");

      expect(run1.files.map((f) => f.relativePath)).toEqual(
        run2.files.map((f) => f.relativePath)
      );

      // Check strictly ascending order
      const paths = run1.files.map((f) => f.relativePath);
      const sorted = [...paths].sort((a, b) => a.localeCompare(b, "en"));
      expect(paths).toEqual(sorted);
    });

    it("handles a single file target seamlessly", async () => {
      const result = await discoverFiles("./test/fixtures/payload-fragile-action.ts");
      expect(result.files).toHaveLength(1);
      expect(result.files[0].extension).toBe(".ts");
    });
  });

  describe("Directory Audit Aggregation (AuditEngine)", () => {
    it("audits fixture project and aggregates boundaries, actions, executions, and shrinks", async () => {
      const result = await audit("./test/fixtures/project", {
        runs: 5,
        seed: 42,
        silent: true,
      });

      expect(result.filesAnalyzed).toBeDefined();
      expect(result.filesAnalyzed?.length).toBeGreaterThanOrEqual(4);

      // Boundaries discovered
      expect(result.boundaries.length).toBeGreaterThanOrEqual(4);
      expect(result.boundaries.some((b) => b.type === "server")).toBe(true);
      expect(result.boundaries.some((b) => b.type === "client")).toBe(true);

      // Candidate Actions discovered
      expect(result.actions.length).toBe(3);
      const actionNames = result.actions.map((a) => a.name);
      expect(actionNames).toContain("processOrder");
      expect(actionNames).toContain("validateToken");
      expect(actionNames).toContain("riskyCompute");

      // Statistics aggregated
      expect(result.statistics.filesAnalyzed).toBeGreaterThanOrEqual(4);
      expect(result.statistics.boundariesFound).toBe(result.boundaries.length);
      expect(result.statistics.actionsFound).toBe(3);
      expect(result.statistics.executions).toBeGreaterThan(0);

      // Findings contain source attribution with relative path
      expect(result.findings.length).toBeGreaterThan(0);
      const fragileFinding = result.findings.find((f) => f.action === "riskyCompute");
      expect(fragileFinding).toBeDefined();
      expect(fragileFinding?.location?.file).toContain("fragile-action.ts");

      // Shrinking ran on fragile action failure
      expect(fragileFinding?.minimizedPayload).toBeDefined();
      expect(fragileFinding?.minimalReproducerVerified).toBe(true);
    });

    it("handles an empty project directory gracefully without throwing", async () => {
      const result = await audit("./test/fixtures/empty-project", { silent: true });

      expect(result.filesAnalyzed).toEqual([]);
      expect(result.boundaries).toEqual([]);
      expect(result.actions).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.statistics.filesAnalyzed).toBe(0);
      expect(result.statistics.actionsFound).toBe(0);
    });

    it("handles client-only directory without false Server Action findings", async () => {
      const result = await audit("./test/fixtures/client-project", { silent: true });

      expect(result.filesAnalyzed).toHaveLength(1);
      expect(result.boundaries).toHaveLength(1);
      expect(result.boundaries[0].type).toBe("client");
      expect(result.actions).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
      expect(result.statistics.actionsFound).toBe(0);
      expect(result.statistics.executions).toBe(0);
    });

    it("isolates syntax errors in one file without aborting audit of valid files", async () => {
      const result = await audit("./test/fixtures/broken-project", {
        runs: 5,
        seed: 42,
        silent: true,
      });

      // Valid file must have been analyzed
      expect(result.filesAnalyzed).toContain("valid.ts");
      expect(result.actions.some((a) => a.name === "validEcho")).toBe(true);

      // Syntax error file recorded in analysisErrors without crashing
      expect(result.analysisErrors).toBeDefined();
      expect(result.analysisErrors?.length).toBe(1);
      expect(result.analysisErrors![0].file).toBe("syntax-error.ts");
      expect(result.analysisErrors![0].type).toBe("parse-error");
      expect(result.statistics.analysisErrors).toBe(1);
    });
  });
});
