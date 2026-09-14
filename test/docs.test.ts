import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseModule } from "../src/parser/index.js";

describe("Documentation & Repository Integrity", () => {
  const root = path.resolve(__dirname, "..");

  it("README.md exists and contains primary sections", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    expect(readme).toContain("# SIS");
    expect(readme).toContain("Speculative Invariant Synthesis");
    expect(readme).toContain("The Problem");
    expect(readme).toContain("What SIS Actually Does");
    expect(readme).toContain("Why SIS Is Different");
    expect(readme).toContain("See It in Action");
    expect(readme).toContain("Boundary Awareness");
    expect(readme).toContain("React Flight Serialization");
    expect(readme).toContain("Static Taint Analysis");
    expect(readme).toContain("Isolated Runtime Verification");
    expect(readme).toContain("Failure Shrinking");
    expect(readme).toContain("Determinism & Reproducibility");
    expect(readme).toContain("Performance & Scaling");
    expect(readme).toContain("CLI Reference");
    expect(readme).toContain("Findings Catalog");
    expect(readme).toContain("Limitations");
    expect(readme).toContain("License");
  });

  it("docs/architecture.md exists and contains pipeline specs", () => {
    const archPath = path.join(root, "docs", "architecture.md");
    expect(fs.existsSync(archPath)).toBe(true);
    const arch = fs.readFileSync(archPath, "utf-8");
    expect(arch).toContain("High-Level Pipeline");
    expect(arch).toContain("Component Directory Map");
  });

  it("LICENSE file exists and matches MIT attribution", () => {
    const licensePath = path.join(root, "LICENSE");
    expect(fs.existsSync(licensePath)).toBe(true);
    const license = fs.readFileSync(licensePath, "utf-8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Aashir Zayd");
  });

  it("curated examples exist and parse cleanly", async () => {
    const exampleDirs = ["basic-action", "serialization", "taint", "client-boundary"];
    for (const dir of exampleDirs) {
      const readmePath = path.join(root, "examples", dir, "README.md");
      expect(fs.existsSync(readmePath)).toBe(true);
    }

    // Verify basic-action parses
    const basicAction = fs.readFileSync(path.join(root, "examples", "basic-action", "actions.ts"), "utf-8");
    const parsedBasic = await parseModule(basicAction, { filename: "examples/basic-action/actions.ts" });
    expect(parsedBasic.actions.length).toBe(1);

    // Verify serialization parses
    const clientCard = fs.readFileSync(path.join(root, "examples", "serialization", "ClientCard.tsx"), "utf-8");
    const parsedCard = await parseModule(clientCard, { filename: "examples/serialization/ClientCard.tsx" });
    expect(parsedCard.boundaries.length).toBe(1);

    // Verify taint parses
    const session = fs.readFileSync(path.join(root, "examples", "taint", "session.ts"), "utf-8");
    const parsedSession = await parseModule(session, { filename: "examples/taint/session.ts" });
    expect(parsedSession).toBeDefined();

    // Verify client-boundary parses
    const actions = fs.readFileSync(path.join(root, "examples", "client-boundary", "actions.ts"), "utf-8");
    const parsedAction = await parseModule(actions, { filename: "examples/client-boundary/actions.ts" });
    expect(parsedAction.actions.length).toBe(1);
  });

  it("prohibits unsupported absolute claims in README", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    // Check for forbidden overclaims
    expect(readme).not.toMatch(/\b100%\s+secure\b/i);
    expect(readme).not.toMatch(/\bguaranteed\s+to\s+find\s+all\b/i);
    expect(readme).not.toMatch(/\bzero\s+false\s+positives\b/i);
    expect(readme).not.toMatch(/\bfully\s+compatible\s+with\s+all\b/i);
    expect(readme).not.toMatch(/\bprovides\s+a\s+mathematical\s+proof\b/i);
  });

  it("docs/benchmark.md exists and contains empirical evaluation sections", () => {
    const benchPath = path.join(root, "docs", "benchmark.md");
    expect(fs.existsSync(benchPath)).toBe(true);
    const bench = fs.readFileSync(benchPath, "utf-8");
    expect(bench).toContain("SIS Real-World Benchmark & Empirical Evaluation");
    expect(bench).toContain("Purpose & Philosophy");
    expect(bench).toContain("Evaluation Corpus");
    expect(bench).toContain("Benchmark Methodology");
    expect(bench).toContain("Multi-Phase Evolution");
    expect(bench).toContain("Current Benchmark Results");
    expect(bench).toContain("Ground-Truth Review Classification");
    expect(bench).toContain("Precision & Recall Calculations");
    expect(bench).toContain("Reproducing the Benchmark");
    expect(bench).toContain("Evaluation Disclaimer");
  });

  it("README.md links to docs/benchmark.md and contains canonical trust callouts", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    expect(readme).toContain("docs/benchmark.md");
    expect(readme).toContain("43 findings reviewed. 9 confirmed true positives. 9 false positives. 24 framework artifacts. 1 unreachable test utility.");
    expect(readme).toContain("We publish the misses, not just the hits.");
    expect(readme).toContain("Current Pinned Benchmark Results");
    expect(readme).toContain("Ground-Truth Evaluation & Review Store");
  });

  it("corpus repositories in benchmarks/corpus.json are present in docs", () => {
    const corpusPath = path.join(root, "benchmarks", "corpus.json");
    expect(fs.existsSync(corpusPath)).toBe(true);
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf-8"));
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    const bench = fs.readFileSync(path.join(root, "docs", "benchmark.md"), "utf-8");

    const coreRepos = corpus.repositories.filter((r: { tier?: string }) => !r.tier || r.tier === "CORE");
    expect(coreRepos.length).toBe(5);
    for (const repo of coreRepos) {
      expect(readme).toContain(repo.name);
      expect(bench).toContain(repo.name);
      expect(bench).toContain(repo.commit.slice(0, 7));
    }
  });

  it("canonical current benchmark metrics match latest.json", () => {
    const latestPath = path.join(root, "benchmarks", "results", "latest.json");
    expect(fs.existsSync(latestPath)).toBe(true);
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    const bench = fs.readFileSync(path.join(root, "docs", "benchmark.md"), "utf-8");

    expect(readme).toContain(latest.aggregate.totalFilesAnalyzed.toLocaleString());
    expect(readme).toContain(latest.aggregate.totalBoundariesFound.toLocaleString());
    expect(readme).toContain(latest.aggregate.totalServerActionsFound.toString());
    expect(readme).toContain(latest.aggregate.totalVerifiedFindings.toString());

    expect(bench).toContain(latest.aggregate.totalFilesAnalyzed.toLocaleString());
    expect(bench).toContain(latest.aggregate.totalBoundariesFound.toLocaleString());
  });
});
