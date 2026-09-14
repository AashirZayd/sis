import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  selectAndSortCorpusEntries,
  validateRepositoryEntry,
} from "../benchmarks/validator.ts";
import { classifyGitError } from "../benchmarks/git.ts";
import type { BenchmarkCorpus, BenchmarkCorpusEntry } from "../benchmarks/types.ts";

describe("Phase 28 — Tiered Corpus & Git Hardening", () => {
  const corpusPath = path.resolve(__dirname, "..", "benchmarks", "corpus.json");
  const corpus: BenchmarkCorpus = JSON.parse(fs.readFileSync(corpusPath, "utf-8"));

  describe("Corpus Structure & Tier Partitioning", () => {
    it("contains exactly 20 total candidate repositories", () => {
      expect(corpus.repositories.length).toBe(20);
    });

    it("partitions repositories into CORE (5), EXTENDED (12), and ADVERSARIAL (3)", () => {
      const core = corpus.repositories.filter((r) => (r.tier || "CORE") === "CORE");
      const extended = corpus.repositories.filter((r) => r.tier === "EXTENDED");
      const adversarial = corpus.repositories.filter((r) => r.tier === "ADVERSARIAL");

      expect(core.length).toBe(5);
      expect(extended.length).toBe(12);
      expect(adversarial.length).toBe(3);
    });

    it("has exactly 4 explicitly excluded repositories due to verified upstream constraints", () => {
      const excluded = corpus.repositories.filter((r) => r.status === "excluded");
      expect(excluded.length).toBe(4);

      const names = excluded.map((r) => r.name);
      expect(names).toContain("charlie-tango/next-starter");
      expect(names).toContain("typebot/typebot");
      expect(names).toContain("infisical/infisical");
      expect(names).toContain("openstatusHQ/openstatus");

      for (const ex of excluded) {
        expect(ex.exclusionReason).toBeDefined();
        expect(ex.exclusionReason?.length).toBeGreaterThan(10);
      }
    });

    it("calcom/cal.com is pinned to verified immutable release tag commit 6a75ef8", () => {
      const calcom = corpus.repositories.find((r) => r.name === "calcom/cal.com");
      expect(calcom).toBeDefined();
      expect(calcom?.commit).toBe("6a75ef86b011665081706ba7f905b05559ac474b");
      expect(calcom?.status).toBe("active");
    });
  });

  describe("Tier Selection & Deterministic Sorting (selectAndSortCorpusEntries)", () => {
    it("defaults to CORE tier (5 repositories) when no flags are given", () => {
      const entries = selectAndSortCorpusEntries(corpus, {});
      expect(entries.length).toBe(5);
      for (const e of entries) {
        expect(e.tier || "CORE").toBe("CORE");
      }
    });

    it("selects only CORE tier when --core flag is active", () => {
      const entries = selectAndSortCorpusEntries(corpus, { core: true });
      expect(entries.length).toBe(5);
      for (const e of entries) {
        expect(e.tier).toBe("CORE");
      }
    });

    it("selects only EXTENDED tier when --extended flag is active", () => {
      const entries = selectAndSortCorpusEntries(corpus, { extended: true });
      expect(entries.length).toBe(12);
      for (const e of entries) {
        expect(e.tier).toBe("EXTENDED");
      }
    });

    it("selects only ADVERSARIAL tier when --adversarial flag is active", () => {
      const entries = selectAndSortCorpusEntries(corpus, { adversarial: true });
      expect(entries.length).toBe(3);
      for (const e of entries) {
        expect(e.tier).toBe("ADVERSARIAL");
      }
    });

    it("selects all 20 repositories when --all flag is active", () => {
      const entries = selectAndSortCorpusEntries(corpus, { all: true });
      expect(entries.length).toBe(20);
    });

    it("combines multiple tier flags deterministically (e.g. core + adversarial = 8)", () => {
      const entries = selectAndSortCorpusEntries(corpus, { core: true, adversarial: true });
      expect(entries.length).toBe(8);
      const tiers = new Set(entries.map((e) => e.tier || "CORE"));
      expect(tiers.has("CORE")).toBe(true);
      expect(tiers.has("ADVERSARIAL")).toBe(true);
      expect(tiers.has("EXTENDED")).toBe(false);
    });

    it("sorts entries deterministically by Tier priority (CORE -> EXTENDED -> ADVERSARIAL) then name", () => {
      const entries = selectAndSortCorpusEntries(corpus, { all: true });
      expect(entries.length).toBe(20);

      // Verify tier ordering
      let currentTierWeight = 0;
      const tierWeight = { CORE: 0, EXTENDED: 1, ADVERSARIAL: 2 };

      for (let i = 0; i < entries.length; i++) {
        const weight = tierWeight[entries[i].tier || "CORE"];
        expect(weight).toBeGreaterThanOrEqual(currentTierWeight);
        currentTierWeight = weight;

        // If adjacent entries are in the same tier, verify alphabetical name order
        if (i > 0 && entries[i - 1].tier === entries[i].tier) {
          expect(entries[i - 1].name.localeCompare(entries[i].name)).toBeLessThan(0);
        }
      }
    });

    it("allows filtering a specific repo across tiers via --repo", () => {
      const calcomEntries = selectAndSortCorpusEntries(corpus, { repo: "calcom/cal.com" });
      expect(calcomEntries.length).toBe(1);
      expect(calcomEntries[0].name).toBe("calcom/cal.com");

      const taxonomyEntries = selectAndSortCorpusEntries(corpus, { repo: "taxonomy" });
      expect(taxonomyEntries.length).toBe(1);
      expect(taxonomyEntries[0].name).toBe("shadcn-ui/taxonomy");
    });
  });

  describe("Git Error Classification (classifyGitError)", () => {
    it("classifies timeout errors to clone-timeout", () => {
      expect(classifyGitError({ code: "ETIMEDOUT", message: "timed out after 45000ms" })).toBe("clone-timeout");
      expect(classifyGitError({ message: "Command timed out" })).toBe("clone-timeout");
    });

    it("classifies unresolvable commit ref errors to commit-unresolvable", () => {
      expect(classifyGitError({ stderr: "fatal: remote error: upload-pack: not our ref 696c21e" })).toBe("commit-unresolvable");
      expect(classifyGitError({ stderr: "fatal: couldn't find remote ref abcdef1" })).toBe("commit-unresolvable");
    });

    it("classifies 404 / connection errors to repository-unreachable", () => {
      expect(classifyGitError({ stderr: "fatal: repository 'https://github.com/fake/repo.git' not found" })).toBe("repository-unreachable");
      expect(classifyGitError({ stderr: "fatal: unable to access: Could not resolve host" })).toBe("repository-unreachable");
    });

    it("classifies non-interactive credential errors to authentication-required", () => {
      expect(classifyGitError({ stderr: "fatal: terminal prompts disabled" })).toBe("authentication-required");
      expect(classifyGitError({ stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" })).toBe("authentication-required");
    });

    it("classifies checkout tree failures to checkout-failed", () => {
      expect(classifyGitError({ stderr: "fatal: reference is not a tree" })).toBe("checkout-failed");
      expect(classifyGitError({ stderr: "error: checkout failed" })).toBe("checkout-failed");
    });
  });

  describe("Validation Isolation & Fast Failures (validateRepositoryEntry)", () => {
    it("instantly returns EXCLUDED status without invoking git for excluded repositories", async () => {
      const excludedEntry: BenchmarkCorpusEntry = {
        name: "typebot/typebot",
        url: "https://github.com/typebot/typebot.git",
        commit: "1081b9cf3a5fa2b79e708c4e402eb06a928e08d5",
        tier: "EXTENDED",
        status: "excluded",
        exclusionReason: "repository-unreachable: Repository not found on GitHub (HTTP 404)",
      };

      const result = await validateRepositoryEntry(excludedEntry);
      expect(result.status).toBe("EXCLUDED");
      expect(result.reason).toContain("repository-unreachable");
      expect(result.wallTimeMs).toBe(0);
    });

    it("fails fast in metadata stage if commit SHA is not 40-char hex", async () => {
      const invalidEntry: BenchmarkCorpusEntry = {
        name: "test/bad-sha",
        url: "https://github.com/test/repo.git",
        commit: "invalid-sha",
        tier: "CORE",
      };

      const result = await validateRepositoryEntry(invalidEntry);
      expect(result.status).toBe("FAIL");
      expect(result.failureStage).toBe("metadata");
      expect(result.failureReason).toBe("commit-unresolvable");
    });

    it("fails fast in metadata stage if repository URL or name is missing", async () => {
      const invalidEntry: BenchmarkCorpusEntry = {
        name: "",
        url: "",
        commit: "298a8857c7128a0d121e7f699dfd729f23b3966d",
        tier: "CORE",
      };

      const result = await validateRepositoryEntry(invalidEntry);
      expect(result.status).toBe("FAIL");
      expect(result.failureStage).toBe("metadata");
    });
  });
});
