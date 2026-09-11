import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deriveFileSeed } from "../src/discovery/seeds.js";
import {
  normalizeAuditResult,
  computeAggregate,
  runBenchmarkForRepository,
  runBenchmark,
} from "../benchmarks/orchestrator.ts";
import {
  generateJsonReport,
  generateMarkdownReport,
} from "../benchmarks/reporter.ts";
import type {
  BenchmarkCorpus,
  BenchmarkCorpusEntry,
  RepositoryBenchmarkResult,
  BenchmarkRunResult,
} from "../benchmarks/types.ts";
import type { AuditResult } from "../src/core/types.js";

describe("Benchmark Corpus Manifest Validation", () => {
  const corpusPath = path.resolve(__dirname, "../benchmarks/corpus.json");

  it("corpus.json exists and is valid JSON", () => {
    expect(fs.existsSync(corpusPath)).toBe(true);
    const content = fs.readFileSync(corpusPath, "utf-8");
    const corpus = JSON.parse(content) as BenchmarkCorpus;
    expect(corpus.version).toBeDefined();
    expect(typeof corpus.version).toBe("string");
    expect(corpus.description).toBeDefined();
    expect(Array.isArray(corpus.repositories)).toBe(true);
  });

  it("corpus contains at least 5 pinned real-world Next.js repositories", () => {
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf-8")) as BenchmarkCorpus;
    expect(corpus.repositories.length).toBeGreaterThanOrEqual(5);

    const names = new Set<string>();

    for (const repo of corpus.repositories) {
      // Unique name
      expect(repo.name).toBeDefined();
      expect(typeof repo.name).toBe("string");
      expect(repo.name.length).toBeGreaterThan(0);
      expect(names.has(repo.name)).toBe(false);
      names.add(repo.name);

      // Valid GitHub HTTPS URL
      expect(repo.url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/);

      // Pinned 40-character hexadecimal commit SHA
      expect(repo.commit).toMatch(/^[0-9a-f]{40}$/);

      // Selection rationale / description
      expect(repo.description).toBeDefined();
      expect(repo.description.length).toBeGreaterThan(10);

      // Framework metadata
      expect(repo.framework).toBeDefined();
      expect(repo.framework?.appRouter).toBe(true);
    }
  });

  it("detects malformed corpus entries", () => {
    const malformedEntries = [
      { name: "", url: "https://github.com/foo/bar.git", commit: "abc" },
      { name: "test/repo", url: "invalid-url", commit: "298a8857c7128a0d121e7f699dfd729f23b3966d" },
      { name: "test/repo", url: "https://github.com/foo/bar.git", commit: "not-a-sha" },
    ];

    for (const entry of malformedEntries) {
      const isValidCommit = /^[0-9a-f]{40}$/.test(entry.commit);
      const isValidUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(entry.url);
      const isValidName = entry.name.length > 0;
      expect(isValidCommit && isValidUrl && isValidName).toBe(false);
    }
  });
});

describe("Deterministic Seed Derivation for Benchmarks", () => {
  it("derives consistent seeds given identical base seeds and repo names", () => {
    const seed1 = deriveFileSeed(42, "shadcn-ui/taxonomy");
    const seed2 = deriveFileSeed(42, "shadcn-ui/taxonomy");
    expect(seed1).toBe(seed2);
  });

  it("derives distinct seeds for distinct repository names", () => {
    const seedA = deriveFileSeed(42, "shadcn-ui/taxonomy");
    const seedB = deriveFileSeed(42, "leerob/site");
    const seedC = deriveFileSeed(42, "vercel/commerce");
    expect(seedA).not.toBe(seedB);
    expect(seedB).not.toBe(seedC);
    expect(seedA).not.toBe(seedC);
  });
});

describe("Audit Result Normalization", () => {
  const mockEntry: BenchmarkCorpusEntry = {
    name: "test/repo",
    url: "https://github.com/test/repo.git",
    commit: "298a8857c7128a0d121e7f699dfd729f23b3966d",
    description: "Mock repository for testing normalization",
    targetDir: ".",
  };

  const mockAuditResult: AuditResult = {
    target: "E:/temp/test-repo",
    filesAnalyzed: ["app/actions.ts", "app/page.tsx"],
    boundaries: [
      { type: "server", kind: "server-action", location: { file: "app/actions.ts", line: 1, column: 1 } },
      { type: "client", kind: "client-module", location: { file: "app/page.tsx", line: 1, column: 1 } },
    ],
    actions: [
      {
        name: "updateUser",
        location: { file: "app/actions.ts", line: 1, column: 1 },
        executionCompatibility: "sandbox-compatible",
      },
      {
        name: "getCookieAction",
        location: { file: "app/actions.ts", line: 10, column: 1 },
        executionCompatibility: "static-only",
      },
    ],
    findings: [
      {
        type: "taint-violation",
        severity: "error",
        message: "Secret leaked to client",
        location: { file: "app/page.tsx", line: 5, column: 1 },
      },
      {
        type: "serialization-violation",
        severity: "warning",
        message: "Closure passed across RSC boundary",
        location: { file: "app/page.tsx", line: 12, column: 1 },
      },
      {
        type: "runtime-exception",
        severity: "error",
        message: "updateUser threw TypeError",
        action: "updateUser",
        location: { file: "app/actions.ts", line: 3, column: 1 },
      },
      {
        type: "timeout",
        severity: "error",
        message: "updateUser timed out",
        action: "updateUser",
      },
    ],
    statistics: {
      filesScanned: 10,
      filesAnalyzed: 2,
      filesSkipped: 8,
      boundariesFound: 2,
      actionsFound: 2,
      taintSourcesFound: 1,
      taintViolations: 1,
      propBoundariesFound: 3,
      serializabilityViolations: 1,
      payloadsGenerated: 20,
      executions: 10,
      passedExecutions: 8,
      failedExecutions: 1,
      timeoutExecutions: 1,
      unsupportedExecutions: 1,
      analysisErrors: 0,
    },
  };

  it("accurately normalizes AuditResult into RepositoryBenchmarkResult", () => {
    const normalized = normalizeAuditResult(mockEntry, mockAuditResult, 1500, 42);

    expect(normalized.repository).toBe("test/repo");
    expect(normalized.commit).toBe("298a8857c7128a0d121e7f699dfd729f23b3966d");
    expect(normalized.status).toBe("completed");
    expect(normalized.filesDiscovered).toBe(10);
    expect(normalized.filesAnalyzed).toBe(2);
    expect(normalized.filesSkipped).toBe(8);
    expect(normalized.boundariesFound).toBe(2);
    expect(normalized.serverActionsFound).toBe(2);
    expect(normalized.propBoundariesFound).toBe(3);
    expect(normalized.serializabilityLeaks).toBe(1);
    expect(normalized.runtimeFailures).toBe(1);
    expect(normalized.taintViolations).toBe(1);
    expect(normalized.analysisErrors).toBe(0);
    expect(normalized.verifiedFindings).toBe(4);
    expect(normalized.runtimeCompatibleCandidates).toBe(1);
    expect(normalized.auditWallTimeMs).toBe(1500);
    expect(normalized.seed).toBe(42);

    expect(normalized.findingBreakdown.taintViolations).toBe(1);
    expect(normalized.findingBreakdown.serializationViolations).toBe(1);
    expect(normalized.findingBreakdown.runtimeExceptions).toBe(1);
    expect(normalized.findingBreakdown.timeouts).toBe(1);
    expect(normalized.findingBreakdown.invariantViolations).toBe(0);
  });
});

describe("Benchmark Aggregation Logic", () => {
  const repo1: RepositoryBenchmarkResult = {
    repository: "repo1",
    url: "https://github.com/org/repo1",
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "completed",
    filesDiscovered: 20,
    filesAnalyzed: 15,
    filesSkipped: 5,
    boundariesFound: 6,
    serverActionsFound: 4,
    propBoundariesFound: 2,
    serializabilityLeaks: 1,
    runtimeFailures: 2,
    taintViolations: 1,
    analysisErrors: 0,
    verifiedFindings: 4,
    runtimeCompatibleCandidates: 3,
    auditWallTimeMs: 1200,
    seed: 100,
    findingBreakdown: {
      taintViolations: 1,
      serializationViolations: 1,
      runtimeExceptions: 2,
      timeouts: 0,
      invariantViolations: 0,
    },
  };

  const repo2: RepositoryBenchmarkResult = {
    repository: "repo2",
    url: "https://github.com/org/repo2",
    commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    status: "failed",
    error: "Simulated clone error",
    filesDiscovered: 0,
    filesAnalyzed: 0,
    filesSkipped: 0,
    boundariesFound: 0,
    serverActionsFound: 0,
    propBoundariesFound: 0,
    serializabilityLeaks: 0,
    runtimeFailures: 0,
    taintViolations: 0,
    analysisErrors: 1,
    verifiedFindings: 0,
    runtimeCompatibleCandidates: 0,
    auditWallTimeMs: 300,
    seed: 200,
    findingBreakdown: {
      taintViolations: 0,
      serializationViolations: 0,
      runtimeExceptions: 0,
      timeouts: 0,
      invariantViolations: 0,
    },
  };

  it("accurately sums aggregate statistics across completed and failed repos", () => {
    const aggregate = computeAggregate([repo1, repo2]);

    expect(aggregate.totalRepositories).toBe(2);
    expect(aggregate.successfulRepositories).toBe(1);
    expect(aggregate.failedRepositories).toBe(1);
    expect(aggregate.totalFilesScanned).toBe(20);
    expect(aggregate.totalFilesAnalyzed).toBe(15);
    expect(aggregate.totalBoundariesFound).toBe(6);
    expect(aggregate.totalServerActionsFound).toBe(4);
    expect(aggregate.totalPropBoundariesFound).toBe(2);
    expect(aggregate.totalSerializabilityLeaks).toBe(1);
    expect(aggregate.totalRuntimeFailures).toBe(2);
    expect(aggregate.totalTaintViolations).toBe(1);
    expect(aggregate.totalAnalysisErrors).toBe(1);
    expect(aggregate.totalVerifiedFindings).toBe(4);
    expect(aggregate.totalRuntimeCompatibleCandidates).toBe(3);
    expect(aggregate.totalWallTimeMs).toBe(1500);
  });
});

describe("Report Generation (Markdown & JSON)", () => {
  const mockResult: BenchmarkRunResult = {
    metadata: {
      sisVersion: "0.1.0",
      sisCommit: "3b9ae5a1234567890abcdef1234567890abcdef1",
      nodeVersion: "v24.19.0",
      platform: "linux",
      arch: "x64",
      cpuModel: "Mock CPU",
      corpusVersion: "1.0.0",
      timestamp: "2026-09-11T12:00:00.000Z",
      baseSeed: 42,
      runs: 10,
      timeoutMs: 20,
    },
    repositories: [
      {
        repository: "shadcn-ui/taxonomy",
        url: "https://github.com/shadcn-ui/taxonomy.git",
        commit: "298a8857c7128a0d121e7f699dfd729f23b3966d",
        status: "completed",
        filesDiscovered: 45,
        filesAnalyzed: 38,
        filesSkipped: 7,
        boundariesFound: 12,
        serverActionsFound: 8,
        propBoundariesFound: 5,
        serializabilityLeaks: 0,
        runtimeFailures: 3,
        taintViolations: 0,
        analysisErrors: 0,
        verifiedFindings: 3,
        runtimeCompatibleCandidates: 6,
        auditWallTimeMs: 2150,
        seed: 847291,
        findingBreakdown: {
          taintViolations: 0,
          serializationViolations: 0,
          runtimeExceptions: 3,
          timeouts: 0,
          invariantViolations: 0,
        },
      },
    ],
    aggregate: {
      totalRepositories: 1,
      successfulRepositories: 1,
      failedRepositories: 0,
      totalFilesScanned: 45,
      totalFilesAnalyzed: 38,
      totalBoundariesFound: 12,
      totalServerActionsFound: 8,
      totalPropBoundariesFound: 5,
      totalSerializabilityLeaks: 0,
      totalRuntimeFailures: 3,
      totalTaintViolations: 0,
      totalAnalysisErrors: 0,
      totalVerifiedFindings: 3,
      totalRuntimeCompatibleCandidates: 6,
      totalWallTimeMs: 2150,
    },
  };

  it("generateJsonReport produces valid parseable JSON matching original schema", () => {
    const jsonStr = generateJsonReport(mockResult);
    const parsed = JSON.parse(jsonStr) as BenchmarkRunResult;

    expect(parsed.metadata.sisVersion).toBe("0.1.0");
    expect(parsed.metadata.corpusVersion).toBe("1.0.0");
    expect(parsed.repositories.length).toBe(1);
    expect(parsed.repositories[0].repository).toBe("shadcn-ui/taxonomy");
    expect(parsed.aggregate.totalVerifiedFindings).toBe(3);
  });

  it("generateMarkdownReport produces GitHub-flavored markdown with table and limitations", () => {
    const md = generateMarkdownReport(mockResult);

    expect(md).toContain("# SIS Real-World Benchmark Report");
    expect(md).toContain("shadcn-ui/taxonomy");
    expect(md).toContain("298a885");
    expect(md).toContain("v24.19.0");
    expect(md).toContain("Base Random Seed");
    expect(md).toContain("42");
    expect(md).toContain("Runtime Compatibility & Boundary Classification");
    expect(md).toContain("Technical Limitations & Ground-Truth Disclaimer");
    expect(md).toContain("Findings ≠ Confirmed Vulnerabilities");
  });
});

describe("Dry-Run & Failure Isolation Execution (Offline)", () => {
  it("dryRun executes without network access and produces valid results", async () => {
    const mockCorpus: BenchmarkCorpus = {
      version: "1.0.0",
      description: "Test Corpus",
      repositories: [
        {
          name: "test/repo-a",
          url: "https://github.com/test/repo-a.git",
          commit: "1111111111111111111111111111111111111111",
          description: "Repo A",
        },
        {
          name: "test/repo-b",
          url: "https://github.com/test/repo-b.git",
          commit: "2222222222222222222222222222222222222222",
          description: "Repo B",
        },
      ],
    };

    const runResult = await runBenchmark(mockCorpus, { dryRun: true, silent: true });

    expect(runResult.metadata.corpusVersion).toBe("1.0.0");
    expect(runResult.repositories.length).toBe(2);
    expect(runResult.repositories[0].repository).toBe("test/repo-a");
    expect(runResult.repositories[1].repository).toBe("test/repo-b");
    expect(runResult.aggregate.totalRepositories).toBe(2);
    expect(runResult.aggregate.successfulRepositories).toBe(2);
  });

  it("filters single repository via repo option", async () => {
    const mockCorpus: BenchmarkCorpus = {
      version: "1.0.0",
      description: "Test Corpus",
      repositories: [
        {
          name: "shadcn-ui/taxonomy",
          url: "https://github.com/shadcn-ui/taxonomy.git",
          commit: "298a8857c7128a0d121e7f699dfd729f23b3966d",
          description: "Taxonomy",
        },
        {
          name: "leerob/site",
          url: "https://github.com/leerob/site.git",
          commit: "fd03371e3c90481a8447904e1b548e4c0327b7db",
          description: "LeeRob site",
        },
      ],
    };

    const runResult = await runBenchmark(mockCorpus, {
      repo: "taxonomy",
      dryRun: true,
      silent: true,
    });

    expect(runResult.repositories.length).toBe(1);
    expect(runResult.repositories[0].repository).toBe("shadcn-ui/taxonomy");
  });

  it("throws clear error when specified repository is not found in corpus", async () => {
    const mockCorpus: BenchmarkCorpus = {
      version: "1.0.0",
      description: "Test Corpus",
      repositories: [
        {
          name: "shadcn-ui/taxonomy",
          url: "https://github.com/shadcn-ui/taxonomy.git",
          commit: "298a8857c7128a0d121e7f699dfd729f23b3966d",
          description: "Taxonomy",
        },
      ],
    };

    await expect(
      runBenchmark(mockCorpus, { repo: "non-existent-repo", dryRun: true, silent: true })
    ).rejects.toThrow(/Repository 'non-existent-repo' not found in corpus/);
  });

  it("isolates repository checkout failure without crashing the process", async () => {
    const brokenEntry: BenchmarkCorpusEntry = {
      name: "broken/repo",
      url: "https://invalid-domain-does-not-exist.example/fake/repo.git",
      commit: "0000000000000000000000000000000000000000",
      description: "Broken repo for testing error isolation",
    };

    // runBenchmarkForRepository should catch the checkout error and return status: 'failed'
    const result = await runBenchmarkForRepository(brokenEntry, { silent: true }, 42);

    expect(result.repository).toBe("broken/repo");
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.analysisErrors).toBe(1);
    expect(result.verifiedFindings).toBe(0);
  });
});
