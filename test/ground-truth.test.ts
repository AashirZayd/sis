import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  computeFindingFingerprint,
  normalizeRelativePath,
  findingToReviewRecord,
  syncGroundTruthReviews,
  computeGroundTruthStats,
  generateGroundTruthMarkdownReport,
  reproduceFindingByFingerprint,
  RULE_ID_MAP,
} from "../benchmarks/reviews.ts";
import type {
  BenchmarkCorpus,
  FindingClassification,
  GroundTruthReviews,
  ReviewConfidence,
  ReviewRecord,
} from "../benchmarks/types.ts";
import type { Finding } from "../src/core/types.js";

describe("Ground-Truth Finding Validation Infrastructure", () => {
  const sampleCommit = "b8866f413cec065438d6e5faabbd9dac7d1ceea5";
  const sampleRepo = "dubinc/dub";
  const sampleFile = "app/api/cron/route.ts";

  describe("Finding Fingerprint Determinism & Normalization", () => {
    it("produces identical fingerprints for identical inputs across repeated calls", () => {
      const fp1 = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "handleCron",
        "handleCron|failed|TypeError|invalid argument",
        "handleCron threw TypeError: invalid argument",
        1,
        "prototype-sensitive",
        "prototype-sensitive"
      );

      const fp2 = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "handleCron",
        "handleCron|failed|TypeError|invalid argument",
        "handleCron threw TypeError: invalid argument",
        1,
        "prototype-sensitive",
        "prototype-sensitive"
      );

      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[a-f0-9]{16}$/);
    });

    it("ensures fingerprint independence from absolute OS and temporary clone paths", () => {
      const winTempPath =
        "C:\\Users\\Runner\\AppData\\Local\\Temp\\sis-benchmark-8f92ab104e12\\app\\api\\cron\\route.ts";
      const unixTempPath =
        "/tmp/sis-benchmark-deadbeef1234/app/api/cron/route.ts";
      const relativePath = "app/api/cron/route.ts";

      const fpWin = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        winTempPath,
        "SIS003",
        42,
        "handleCron",
        "sig",
        "msg"
      );
      const fpUnix = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        unixTempPath,
        "SIS003",
        42,
        "handleCron",
        "sig",
        "msg"
      );
      const fpRel = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        relativePath,
        "SIS003",
        42,
        "handleCron",
        "sig",
        "msg"
      );

      expect(fpWin).toBe(fpRel);
      expect(fpUnix).toBe(fpRel);
    });

    it("is sensitive to meaningful finding changes", () => {
      const baseFp = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "handleCron",
        "sig",
        "msg",
        1,
        "nullability",
        "nullish"
      );

      // Line change
      const lineDiff = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        43,
        "handleCron",
        "sig",
        "msg",
        1,
        "nullability",
        "nullish"
      );
      expect(lineDiff).not.toBe(baseFp);

      // Rule change
      const ruleDiff = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS002",
        42,
        "handleCron",
        "sig",
        "msg",
        1,
        "nullability",
        "nullish"
      );
      expect(ruleDiff).not.toBe(baseFp);

      // Action change
      const actionDiff = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "otherAction",
        "sig",
        "msg",
        1,
        "nullability",
        "nullish"
      );
      expect(actionDiff).not.toBe(baseFp);

      // Signature change
      const sigDiff = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "handleCron",
        "otherSig",
        "msg",
        1,
        "nullability",
        "nullish"
      );
      expect(sigDiff).not.toBe(baseFp);

      // PayloadId change
      const pIdDiff = computeFindingFingerprint(
        sampleRepo,
        sampleCommit,
        sampleFile,
        "SIS003",
        42,
        "handleCron",
        "sig",
        "msg",
        2,
        "nullability",
        "nullish"
      );
      expect(pIdDiff).not.toBe(baseFp);
    });
  });

  describe("Finding Review Schema & Conversion", () => {
    const mockFinding: Finding = {
      type: "runtime-exception",
      severity: "error",
      message: "updateItem threw TypeError: Cannot read properties of undefined",
      location: {
        file: "components/cart/actions.ts",
        line: 54,
        column: 12,
      },
      action: "updateItem",
      payload: { id: 1 },
      minimizedPayload: {},
      failureSignature: "updateItem|failed|TypeError|cannot read properties of undefined",
      errorName: "TypeError",
      shrinkAttempts: 2,
      shrinkReduction: 85.5,
      minimalReproducerVerified: true,
      strategy: "structural-deletion",
      fuzzTarget: "server-action-argument",
      parameter: "item",
    };

    it("correctly converts an audited Finding into a valid ReviewRecord", () => {
      const record = findingToReviewRecord(sampleRepo, sampleCommit, ".", mockFinding);

      expect(record.repository).toBe(sampleRepo);
      expect(record.commit).toBe(sampleCommit);
      expect(record.file).toBe("components/cart/actions.ts");
      expect(record.line).toBe(54);
      expect(record.column).toBe(12);
      expect(record.ruleId).toBe("SIS003");
      expect(record.fingerprint).toMatch(/^[a-f0-9]{16}$/);
      expect(record.message).toBe(mockFinding.message);
      expect(record.actionName).toBe("updateItem");
      expect(record.generatedInput).toEqual({});
      expect(record.failureSignature).toBe(mockFinding.failureSignature);
      expect(record.classification).toBe("NEEDS_REVIEW");
      expect(record.confidence).toBe("LOW");
      expect(record.reviewer).toBeNull();
      expect(record.reviewNotes).toBeNull();
      expect(record.reviewedAt).toBeNull();

      expect(record.runtimeEvidence).toBeDefined();
      expect(record.runtimeEvidence?.errorName).toBe("TypeError");
      expect(record.runtimeEvidence?.shrinkAttempts).toBe(2);
      expect(record.runtimeEvidence?.shrinkReduction).toBe("85.5%");
    });

    it("handles findings with missing location gracefully", () => {
      const findingNoLoc: Finding = {
        type: "serialization-violation",
        severity: "error",
        message: "Non-serializable class returned",
      };

      const record = findingToReviewRecord(sampleRepo, sampleCommit, ".", findingNoLoc);
      expect(record.file).toBe("");
      expect(record.line).toBe(1);
      expect(record.ruleId).toBe("SIS002");
      expect(record.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("Review Synchronization & Preservation of Classifications", () => {
    it("preserves existing reviewer classifications, notes, and metadata on sync", () => {
      const existingRecord: ReviewRecord = {
        repository: sampleRepo,
        commit: sampleCommit,
        file: "app/actions.ts",
        line: 10,
        ruleId: "SIS003",
        fingerprint: "12345678abcdef90",
        message: "Action threw error",
        classification: "TRUE_POSITIVE",
        confidence: "HIGH",
        reviewer: "aashirzayd",
        reviewNotes: "Confirmed missing null check at network boundary",
        reviewedAt: "2026-09-11T12:00:00.000Z",
      };

      const existingDataset: GroundTruthReviews = {
        version: "1.0.0",
        lastUpdated: "2026-09-10T00:00:00.000Z",
        description: "Benchmark Reviews",
        reviews: [existingRecord],
      };

      // Ingesting a new run with the same finding
      const incomingRecord: ReviewRecord = {
        repository: sampleRepo,
        commit: sampleCommit,
        file: "app/actions.ts",
        line: 10,
        ruleId: "SIS003",
        fingerprint: "12345678abcdef90",
        message: "Action threw error (updated message from re-run)",
        classification: "NEEDS_REVIEW",
        confidence: "LOW",
        reviewer: null,
        reviewNotes: null,
        reviewedAt: null,
      };

      const brandNewRecord: ReviewRecord = {
        repository: sampleRepo,
        commit: sampleCommit,
        file: "app/other.ts",
        line: 25,
        ruleId: "SIS002",
        fingerprint: "99999999abcdef00",
        message: "Serialization error",
        classification: "NEEDS_REVIEW",
        confidence: "LOW",
        reviewer: null,
        reviewNotes: null,
        reviewedAt: null,
      };

      const synced = syncGroundTruthReviews(existingDataset, [incomingRecord, brandNewRecord]);

      expect(synced.reviews).toHaveLength(2);

      const preserved = synced.reviews.find((r) => r.fingerprint === "12345678abcdef90");
      expect(preserved).toBeDefined();
      expect(preserved?.classification).toBe("TRUE_POSITIVE");
      expect(preserved?.confidence).toBe("HIGH");
      expect(preserved?.reviewer).toBe("aashirzayd");
      expect(preserved?.reviewNotes).toBe("Confirmed missing null check at network boundary");
      expect(preserved?.reviewedAt).toBe("2026-09-11T12:00:00.000Z");

      const brandNew = synced.reviews.find((r) => r.fingerprint === "99999999abcdef00");
      expect(brandNew).toBeDefined();
      expect(brandNew?.classification).toBe("NEEDS_REVIEW");
      expect(brandNew?.confidence).toBe("LOW");
    });
  });

  describe("Aggregate Statistics & Precision Calculation (No Recall)", () => {
    it("accurately computes aggregate counts and precision over binary classifications", () => {
      const mockReviews: ReviewRecord[] = [
        {
          repository: "repoA",
          commit: "c1",
          file: "f1.ts",
          line: 1,
          ruleId: "SIS003",
          fingerprint: "fp1",
          message: "msg1",
          classification: "TRUE_POSITIVE",
          confidence: "HIGH",
        },
        {
          repository: "repoA",
          commit: "c1",
          file: "f2.ts",
          line: 2,
          ruleId: "SIS003",
          fingerprint: "fp2",
          message: "msg2",
          classification: "TRUE_POSITIVE",
          confidence: "HIGH",
        },
        {
          repository: "repoA",
          commit: "c1",
          file: "f3.ts",
          line: 3,
          ruleId: "SIS003",
          fingerprint: "fp3",
          message: "msg3",
          classification: "FALSE_POSITIVE",
          confidence: "MEDIUM",
        },
        {
          repository: "repoB",
          commit: "c2",
          file: "f4.ts",
          line: 4,
          ruleId: "SIS002",
          fingerprint: "fp4",
          message: "msg4",
          classification: "EXPECTED_BEHAVIOR",
          confidence: "HIGH",
        },
        {
          repository: "repoB",
          commit: "c2",
          file: "f5.ts",
          line: 5,
          ruleId: "SIS002",
          fingerprint: "fp5",
          message: "msg5",
          classification: "UNREACHABLE",
          confidence: "LOW",
        },
        {
          repository: "repoB",
          commit: "c2",
          file: "f6.ts",
          line: 6,
          ruleId: "SIS002",
          fingerprint: "fp6",
          message: "msg6",
          classification: "FRAMEWORK_ARTIFACT",
          confidence: "LOW",
        },
        {
          repository: "repoB",
          commit: "c2",
          file: "f7.ts",
          line: 7,
          ruleId: "SIS002",
          fingerprint: "fp7",
          message: "msg7",
          classification: "NEEDS_REVIEW",
          confidence: "LOW",
        },
      ];

      const dataset: GroundTruthReviews = {
        version: "1.0.0",
        lastUpdated: "2026-09-11T00:00:00.000Z",
        description: "Test dataset",
        reviews: mockReviews,
      };

      const stats = computeGroundTruthStats(dataset);

      expect(stats.total).toBe(7);
      expect(stats.reviewed).toBe(6);
      expect(stats.pending).toBe(1);
      expect(stats.truePositives).toBe(2);
      expect(stats.falsePositives).toBe(1);
      expect(stats.expectedBehavior).toBe(1);
      expect(stats.unreachable).toBe(1);
      expect(stats.frameworkArtifacts).toBe(1);
      expect(stats.needsReview).toBe(1);

      expect(stats.confidenceDistribution.high).toBe(3);
      expect(stats.confidenceDistribution.medium).toBe(1);
      expect(stats.confidenceDistribution.low).toBe(3);

      // Precision = TP / (TP + FP) = 2 / (2 + 1) = 0.6667
      expect(stats.precision).toBeCloseTo(0.6667, 3);

      // Verify recall is intentionally NOT calculated or exposed
      expect((stats as Record<string, unknown>).recall).toBeUndefined();
    });

    it("returns precision = null when zero binary classifications exist", () => {
      const dataset: GroundTruthReviews = {
        version: "1.0.0",
        lastUpdated: "2026-09-11T00:00:00.000Z",
        description: "Pending dataset",
        reviews: [
          {
            repository: "repoA",
            commit: "c1",
            file: "f1.ts",
            line: 1,
            ruleId: "SIS003",
            fingerprint: "fp1",
            message: "msg1",
            classification: "NEEDS_REVIEW",
            confidence: "LOW",
          },
          {
            repository: "repoA",
            commit: "c1",
            file: "f2.ts",
            line: 2,
            ruleId: "SIS002",
            fingerprint: "fp2",
            message: "msg2",
            classification: "EXPECTED_BEHAVIOR",
            confidence: "MEDIUM",
          },
        ],
      };

      const stats = computeGroundTruthStats(dataset);
      expect(stats.precision).toBeNull();
      expect(stats.byRepository.repoA.precision).toBeNull();
      expect(stats.byRule.SIS003.precision).toBeNull();
    });
  });

  describe("Markdown Report Generation", () => {
    it("generates reviewer-friendly Markdown with required sections and disclaimers", () => {
      const mockRecord: ReviewRecord = {
        repository: "dubinc/dub",
        commit: sampleCommit,
        file: "app/actions.ts",
        line: 15,
        ruleId: "SIS003",
        fingerprint: "abcdef1234567890",
        message: "Action threw ReferenceError: redis is not defined",
        actionName: "forceWithdrawal",
        generatedInput: {},
        failureSignature: "forceWithdrawal|failed|ReferenceError|redis is not defined",
        classification: "NEEDS_REVIEW",
        confidence: "LOW",
      };

      const dataset: GroundTruthReviews = {
        version: "1.0.0",
        lastUpdated: "2026-09-11T12:00:00.000Z",
        description: "Reviews",
        reviews: [mockRecord],
      };

      const stats = computeGroundTruthStats(dataset);
      const markdown = generateGroundTruthMarkdownReport(dataset, stats);

      // Verify structure and required disclosures
      expect(markdown).toContain("# SIS Benchmark Ground-Truth Evaluation Report");
      expect(markdown).toContain("No Recall Calculation");
      expect(markdown).toContain("Findings ≠ CVEs / Vulnerabilities");
      expect(markdown).toContain("Reviewer Classification Guide");
      expect(markdown).toContain("`TRUE_POSITIVE`");
      expect(markdown).toContain("`FALSE_POSITIVE`");
      expect(markdown).toContain("`EXPECTED_BEHAVIOR`");
      expect(markdown).toContain("`UNREACHABLE`");
      expect(markdown).toContain("`FRAMEWORK_ARTIFACT`");
      expect(markdown).toContain("`NEEDS_REVIEW`");

      // Verify finding catalog details
      expect(markdown).toContain("`abcdef1234567890`");
      expect(markdown).toContain("forceWithdrawal");
      expect(markdown).toContain("npm run benchmark -- --reproduce abcdef1234567890");
    });
  });

  describe("Reproduction Argument Validation & Error Handling", () => {
    const mockCorpus: BenchmarkCorpus = {
      version: "1.0.0",
      description: "Test corpus",
      repositories: [
        {
          name: "test/repo",
          url: "https://github.com/test/repo.git",
          commit: "1111222233334444555566667777888899990000",
          description: "Test repo",
        },
      ],
    };

    const mockGroundTruth: GroundTruthReviews = {
      version: "1.0.0",
      lastUpdated: "2026-09-11T00:00:00.000Z",
      description: "Test",
      reviews: [
        {
          repository: "nonexistent/repo",
          commit: "0000000000000000000000000000000000000000",
          file: "app.ts",
          line: 1,
          ruleId: "SIS003",
          fingerprint: "known1234567890a",
          message: "test finding",
          classification: "NEEDS_REVIEW",
          confidence: "LOW",
        },
      ],
    };

    it("throws a clear error when a fingerprint is not found in ground truth", async () => {
      await expect(
        reproduceFindingByFingerprint("unknown_fp", mockCorpus, mockGroundTruth)
      ).rejects.toThrow(/not found in ground-truth reviews/);
    });

    it("throws a clear error when repository entry is missing from corpus.json", async () => {
      await expect(
        reproduceFindingByFingerprint("known1234567890a", mockCorpus, mockGroundTruth)
      ).rejects.toThrow(/not found in corpus\.json/);
    });
  });

  describe("Canonical Ground-Truth Reviews Integrity", () => {
    it("validates that canonical ground-truth.json has 43 unique findings with pilot reviews and pending items", () => {
      const gtPath = path.resolve(process.cwd(), "benchmarks/reviews/ground-truth.json");
      expect(fs.existsSync(gtPath)).toBe(true);

      const gt: GroundTruthReviews = JSON.parse(fs.readFileSync(gtPath, "utf8"));
      expect(gt.reviews.length).toBe(43);

      const fingerprints = new Set<string>();
      let reviewedCount = 0;
      let pendingCount = 0;

      for (const r of gt.reviews) {
        expect(r.fingerprint).toMatch(/^[a-f0-9]{16}$/);
        expect(fingerprints.has(r.fingerprint)).toBe(false);
        fingerprints.add(r.fingerprint);

        if (r.classification === "NEEDS_REVIEW") {
          pendingCount++;
          expect(r.confidence).toBe("LOW");
          expect(r.reviewer).toBeNull();
          expect(r.reviewNotes).toBeNull();
          expect(r.reviewedAt).toBeNull();
        } else {
          reviewedCount++;
          expect([
            "TRUE_POSITIVE",
            "FALSE_POSITIVE",
            "EXPECTED_BEHAVIOR",
            "UNREACHABLE",
            "FRAMEWORK_ARTIFACT",
          ]).toContain(r.classification);
          expect(["HIGH", "MEDIUM", "LOW"]).toContain(r.confidence);
          expect(["ground-truth-pilot", "ground-truth-phase-24"]).toContain(r.reviewer);
          expect(r.reviewNotes).toBeTruthy();
          expect(r.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }

        expect(["SIS001", "SIS002", "SIS003", "SIS004", "SIS005"]).toContain(r.ruleId);
        expect(r.file).not.toMatch(/sis-benchmark/);
        expect(r.file).not.toContain("\\");
      }

      expect(reviewedCount).toBe(43);
      expect(pendingCount).toBe(0);
    });
  });
});