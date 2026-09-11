import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import type { Finding, FindingType } from "../dist/index.js";
import { AuditEngine, deriveFileSeed } from "../dist/index.js";
import { checkoutPinnedRepository } from "./git.ts";
import type {
  BenchmarkCorpus,
  BenchmarkCorpusEntry,
  FindingClassification,
  GroundTruthRepositoryStats,
  GroundTruthReviews,
  GroundTruthRuleStats,
  GroundTruthStats,
  ReviewConfidence,
  ReviewRecord,
} from "./types.ts";

/**
 * Maps SIS FindingType to standard rule identifiers.
 */
export const RULE_ID_MAP: Record<FindingType, string> = {
  "taint-violation": "SIS001",
  "serialization-violation": "SIS002",
  "runtime-exception": "SIS003",
  timeout: "SIS004",
  "invariant-violation": "SIS005",
};

/**
 * Normalizes any file path into a repo-relative Posix path,
 * stripping OS-specific prefixes and ephemeral temporary directories.
 */
export function normalizeRelativePath(filePath: string, repoRoot?: string): string {
  let normalized = filePath.replace(/\\/g, "/");

  if (repoRoot) {
    const normRoot = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized.startsWith(normRoot)) {
      normalized = normalized.slice(normRoot.length);
    }
  }

  // Strip transient tmpdir paths (e.g. /.../sis-benchmark-xxxx/ or temp/...)
  const tmpMatch = normalized.match(/(?:^|\/)(?:sis-benchmark-[a-f0-9]+|test-[a-z0-9-]+)\/(.*)$/i);
  if (tmpMatch) {
    normalized = tmpMatch[1];
  }

  // Strip leading slashes or dots
  normalized = normalized.replace(/^\.?\/+/, "");

  return normalized;
}

/**
 * Computes a deterministic 16-hex-character SHA-256 fingerprint for a benchmark finding.
 *
 * Inputs include:
 * - repository identifier (lowercase)
 * - pinned commit SHA (first 12 characters)
 * - repo-relative file path (posix normalized, no temp dirs)
 * - rule ID (e.g. SIS001, SIS002, SIS003)
 * - source line number
 * - action name (if present)
 * - normalized signature (failureSignature, errorName, or normalized message)
 *
 * Guarantees:
 * - Deterministic across repeated runs and machines
 * - Independent of temporary checkout paths and OS path separators
 * - Sensitive to line number, rule, action, and failure signature changes
 */
export function computeFindingFingerprint(
  repository: string,
  commit: string,
  relativeFilePath: string,
  ruleId: string,
  line: number,
  actionName?: string,
  signature?: string,
  message?: string,
  payloadId?: number | string,
  strategy?: string,
  category?: string
): string {
  const normRepo = repository.toLowerCase().trim();
  const normCommit = commit.trim().slice(0, 12);
  const normFile = normalizeRelativePath(relativeFilePath);
  const normRule = ruleId.trim().toUpperCase();
  const normAction = (actionName || "").trim();
  const rawSig = signature || normAction || message || "";
  const normSig = rawSig.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
  const pId = payloadId !== undefined ? String(payloadId) : "";
  const strat = (strategy || "").trim();
  const cat = (category || "").trim();

  const payload = [
    normRepo,
    normCommit,
    normFile,
    normRule,
    String(line),
    normAction,
    normSig,
    pId,
    strat,
    cat,
  ].join(":");

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

/**
 * Converts an audited Finding into a structured, reviewable ReviewRecord.
 */
export function findingToReviewRecord(
  repository: string,
  commit: string,
  repoRoot: string,
  finding: Finding
): ReviewRecord {
  const ruleId = RULE_ID_MAP[finding.type] || "SIS000";
  const relFile = normalizeRelativePath(finding.location?.file || "", repoRoot);
  const line = finding.location?.line || 1;
  const column = finding.location?.column;
  const actionName = finding.action;
  const failureSig = finding.failureSignature || finding.errorName;

  const fingerprint = computeFindingFingerprint(
    repository,
    commit,
    relFile,
    ruleId,
    line,
    actionName,
    failureSig,
    finding.message,
    finding.payloadId,
    finding.strategy,
    finding.category
  );

  const generatedInput =
    finding.minimizedPayload !== undefined
      ? finding.minimizedPayload
      : finding.payload !== undefined
      ? finding.payload
      : finding.originalPayload;

  let staticEvidence: Record<string, unknown> | undefined;
  if (finding.boundaryKind || finding.direction || finding.invariant || finding.trace) {
    staticEvidence = {};
    if (finding.boundaryKind) staticEvidence.boundaryKind = finding.boundaryKind;
    if (finding.direction) staticEvidence.direction = finding.direction;
    if (finding.invariant) staticEvidence.invariant = finding.invariant;
    if (finding.trace && finding.trace.length > 0) staticEvidence.trace = finding.trace;
  }

  let runtimeEvidence: Record<string, unknown> | undefined;
  if (
    finding.errorName ||
    finding.executionMs !== undefined ||
    finding.durationMs !== undefined ||
    finding.shrinkAttempts !== undefined ||
    finding.shrinkReduction !== undefined ||
    finding.fuzzTarget ||
    finding.strategy ||
    finding.parameter
  ) {
    runtimeEvidence = {};
    if (finding.errorName) runtimeEvidence.errorName = finding.errorName;
    if (finding.fuzzTarget) runtimeEvidence.fuzzTarget = finding.fuzzTarget;
    if (finding.strategy) runtimeEvidence.strategy = finding.strategy;
    if (finding.parameter) runtimeEvidence.parameter = finding.parameter;
    if (finding.shrinkAttempts !== undefined) runtimeEvidence.shrinkAttempts = finding.shrinkAttempts;
    if (finding.shrinkReduction !== undefined) runtimeEvidence.shrinkReduction = `${finding.shrinkReduction}%`;
    if (finding.minimalReproducerVerified !== undefined) {
      runtimeEvidence.minimalReproducerVerified = finding.minimalReproducerVerified;
    }
  }

  return {
    repository,
    commit,
    file: relFile,
    line,
    column,
    ruleId,
    fingerprint,
    message: finding.message,
    actionName,
    generatedInput,
    failureSignature: failureSig,
    staticEvidence,
    runtimeEvidence,
    classification: "NEEDS_REVIEW",
    confidence: "LOW",
    reviewer: null,
    reviewNotes: null,
    reviewedAt: null,
  };
}

/**
 * Synchronizes newly discovered review records into an existing GroundTruthReviews dataset.
 *
 * CRITICAL GUARANTEE:
 * Existing reviewer classifications, confidence levels, reviewer IDs,
 * review notes, and timestamps are strictly preserved.
 */
export function syncGroundTruthReviews(
  existing: GroundTruthReviews | null,
  newRecords: ReviewRecord[]
): GroundTruthReviews {
  const existingMap = new Map<string, ReviewRecord>();

  if (existing && Array.isArray(existing.reviews)) {
    for (const r of existing.reviews) {
      existingMap.set(r.fingerprint, r);
    }
  }

  const merged: ReviewRecord[] = [];

  for (const record of newRecords) {
    const prior = existingMap.get(record.fingerprint);
    if (prior) {
      // Preserve reviewer's manual assessment
      merged.push({
        ...record,
        classification: prior.classification,
        confidence: prior.confidence,
        reviewer: prior.reviewer ?? null,
        reviewNotes: prior.reviewNotes ?? null,
        reviewedAt: prior.reviewedAt ?? null,
      });
      existingMap.delete(record.fingerprint);
    } else {
      // Brand new finding, defaults to NEEDS_REVIEW
      merged.push({
        ...record,
        classification: "NEEDS_REVIEW",
        confidence: "LOW",
        reviewer: null,
        reviewNotes: null,
        reviewedAt: null,
      });
    }
  }

  // Retain any older reviewed records that weren't in the incoming batch
  for (const remaining of existingMap.values()) {
    merged.push(remaining);
  }

  // Sort deterministically: repository asc, file asc, line asc, ruleId asc
  merged.sort((a, b) => {
    if (a.repository !== b.repository) return a.repository.localeCompare(b.repository);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.ruleId.localeCompare(b.ruleId);
  });

  return {
    version: existing?.version || "1.0.0",
    lastUpdated: new Date().toISOString(),
    description: "SIS Ground-Truth Benchmark Finding Reviews",
    reviews: merged,
  };
}

/**
 * Computes comprehensive statistical metrics for GroundTruthReviews.
 *
 * Note: Precision is computed strictly over explicit binary classifications (TP / (TP + FP)).
 * Recall is intentionally NOT computed because the complete ground-truth invariant set is unknown.
 */
export function computeGroundTruthStats(groundTruth: GroundTruthReviews): GroundTruthStats {
  const reviews = groundTruth.reviews || [];

  let truePositives = 0;
  let falsePositives = 0;
  let expectedBehavior = 0;
  let unreachable = 0;
  let frameworkArtifacts = 0;
  let needsReview = 0;

  const confidenceDistribution = { high: 0, medium: 0, low: 0 };
  const byRepository: Record<string, GroundTruthRepositoryStats> = {};
  const byRule: Record<string, GroundTruthRuleStats> = {};

  const initGroupStats = () => ({
    total: 0,
    reviewed: 0,
    pending: 0,
    truePositives: 0,
    falsePositives: 0,
    expectedBehavior: 0,
    unreachable: 0,
    frameworkArtifacts: 0,
    needsReview: 0,
    precision: null as number | null,
  });

  for (const r of reviews) {
    if (!byRepository[r.repository]) {
      byRepository[r.repository] = initGroupStats();
    }
    if (!byRule[r.ruleId]) {
      byRule[r.ruleId] = initGroupStats();
    }

    const repoStats = byRepository[r.repository];
    const ruleStats = byRule[r.ruleId];

    repoStats.total++;
    ruleStats.total++;

    if (r.confidence === "HIGH") confidenceDistribution.high++;
    else if (r.confidence === "MEDIUM") confidenceDistribution.medium++;
    else confidenceDistribution.low++;

    switch (r.classification) {
      case "TRUE_POSITIVE":
        truePositives++;
        repoStats.truePositives++;
        ruleStats.truePositives++;
        repoStats.reviewed++;
        ruleStats.reviewed++;
        break;
      case "FALSE_POSITIVE":
        falsePositives++;
        repoStats.falsePositives++;
        ruleStats.falsePositives++;
        repoStats.reviewed++;
        ruleStats.reviewed++;
        break;
      case "EXPECTED_BEHAVIOR":
        expectedBehavior++;
        repoStats.expectedBehavior++;
        ruleStats.expectedBehavior++;
        repoStats.reviewed++;
        ruleStats.reviewed++;
        break;
      case "UNREACHABLE":
        unreachable++;
        repoStats.unreachable++;
        ruleStats.unreachable++;
        repoStats.reviewed++;
        ruleStats.reviewed++;
        break;
      case "FRAMEWORK_ARTIFACT":
        frameworkArtifacts++;
        repoStats.frameworkArtifacts++;
        ruleStats.frameworkArtifacts++;
        repoStats.reviewed++;
        ruleStats.reviewed++;
        break;
      case "NEEDS_REVIEW":
      default:
        needsReview++;
        repoStats.needsReview++;
        ruleStats.needsReview++;
        repoStats.pending++;
        ruleStats.pending++;
        break;
    }
  }

  // Precision over binary TP / (TP + FP)
  const binaryTotal = truePositives + falsePositives;
  const precision = binaryTotal > 0 ? Number((truePositives / binaryTotal).toFixed(4)) : null;

  for (const key of Object.keys(byRepository)) {
    const s = byRepository[key];
    const repoBinary = s.truePositives + s.falsePositives;
    s.precision = repoBinary > 0 ? Number((s.truePositives / repoBinary).toFixed(4)) : null;
  }

  for (const key of Object.keys(byRule)) {
    const s = byRule[key];
    const ruleBinary = s.truePositives + s.falsePositives;
    s.precision = ruleBinary > 0 ? Number((s.truePositives / ruleBinary).toFixed(4)) : null;
  }

  const reviewed = reviews.length - needsReview;

  return {
    total: reviews.length,
    reviewed,
    pending: needsReview,
    truePositives,
    falsePositives,
    expectedBehavior,
    unreachable,
    frameworkArtifacts,
    needsReview,
    confidenceDistribution,
    precision,
    byRepository,
    byRule,
  };
}

/**
 * Generates benchmarks/results/ground-truth.md.
 */
export function generateGroundTruthMarkdownReport(
  groundTruth: GroundTruthReviews,
  stats: GroundTruthStats
): string {
  const precisionDisplay =
    stats.precision !== null ? `${(stats.precision * 100).toFixed(1)}%` : "N/A (Pending human review)";

  const repoRows = Object.entries(stats.byRepository)
    .map(([repo, s]) => {
      const prec = s.precision !== null ? `${(s.precision * 100).toFixed(1)}%` : "—";
      return `| [**${repo}**](https://github.com/${repo}) | ${s.total} | ${s.reviewed} | ${s.pending} | ${s.truePositives} | ${s.falsePositives} | ${s.expectedBehavior} | ${s.unreachable} | ${s.frameworkArtifacts} | ${prec} |`;
    })
    .join("\n");

  const ruleRows = Object.entries(stats.byRule)
    .map(([rule, s]) => {
      const prec = s.precision !== null ? `${(s.precision * 100).toFixed(1)}%` : "—";
      return `| \`${rule}\` | ${s.total} | ${s.reviewed} | ${s.pending} | ${s.truePositives} | ${s.falsePositives} | ${s.expectedBehavior} | ${s.unreachable} | ${s.frameworkArtifacts} | ${prec} |`;
    })
    .join("\n");

  const pendingFindings = groundTruth.reviews.filter((r) => r.classification === "NEEDS_REVIEW");
  const reviewedFindings = groundTruth.reviews.filter((r) => r.classification !== "NEEDS_REVIEW");

  const formatReviewItem = (r: ReviewRecord) => {
    const inputStr =
      r.generatedInput !== undefined ? JSON.stringify(r.generatedInput) : "*(none)*";
    const sigStr = r.failureSignature ? `\`${r.failureSignature}\`` : "*(none)*";
    const staticEv = r.staticEvidence ? JSON.stringify(r.staticEvidence) : "—";
    const runtimeEv = r.runtimeEvidence ? JSON.stringify(r.runtimeEvidence) : "—";

    return `### \`${r.fingerprint}\` — [${r.repository}] ${r.ruleId}: ${r.file}#L${r.line}

- **Repository**: [${r.repository}](https://github.com/${r.repository}) (Commit: \`${r.commit.slice(0, 7)}\`)
- **Rule**: \`${r.ruleId}\`
- **Location**: \`${r.file}:${r.line}${r.column ? `:${r.column}` : ""}\`
- **Action**: ${r.actionName ? `\`${r.actionName}\`` : "*(module scope)*"}
- **Message**: ${r.message}
- **Generated / Minimized Input**: \`${inputStr}\`
- **Failure Signature**: ${sigStr}
- **Static Evidence**: \`${staticEv}\`
- **Runtime Evidence**: \`${runtimeEv}\`
- **Current Classification**: \`${r.classification}\` (Confidence: \`${r.confidence}\`)
${r.reviewer ? `- **Reviewer**: ${r.reviewer} (${r.reviewedAt || ""})\n- **Notes**: ${r.reviewNotes || ""}` : ""}
- **Reproduction**:
  \`\`\`bash
  npm run benchmark -- --reproduce ${r.fingerprint}
  \`\`\`
`;
  };

  const pendingCatalog =
    pendingFindings.length > 0
      ? pendingFindings.map(formatReviewItem).join("\n---\n\n")
      : "*No pending findings awaiting review.*";

  const reviewedCatalog =
    reviewedFindings.length > 0
      ? reviewedFindings.map(formatReviewItem).join("\n---\n\n")
      : "*No findings manually reviewed yet.*";

  return `# SIS Benchmark Ground-Truth Evaluation Report

Last Updated: ${groundTruth.lastUpdated}  
Review Schema Version: \`${groundTruth.version}\`  
Findings Evaluated: **${stats.total}** | Reviewed: **${stats.reviewed}** | Pending Review: **${stats.pending}**

---

## 1. Ground-Truth Summary & Precision

| Metric | Count / Value | Description |
| :--- | :---: | :--- |
| **Total Findings** | **${stats.total}** | All invariant violations verified in benchmark run |
| **Reviewed Findings** | **${stats.reviewed}** | Evaluated by human code review |
| **Pending Review** | **${stats.pending}** | Awaiting manual classification |
| **True Positives (TP)** | **${stats.truePositives}** | Valid boundary defects / missing validations |
| **False Positives (FP)** | **${stats.falsePositives}** | False alarms or harmless boundary patterns |
| **Expected Behavior** | **${stats.expectedBehavior}** | Intentional error throws or defensive aborts |
| **Unreachable** | **${stats.unreachable}** | Private or client-inaccessible endpoints |
| **Framework Artifacts** | **${stats.frameworkArtifacts}** | Boundary anomalies caused by missing framework server runtime |
| **Empirical Precision** | **${precisionDisplay}** | Calculated as $TP / (TP + FP)$ over binary classifications |

> [!IMPORTANT]
> **Precision Subset Disclaimer**:
> Precision is based only on the manually reviewed subset and should not be generalized to the entire corpus.
>
> **No Recall Calculation**:
> Recall ($TP / (TP + FN)$) is intentionally **not calculated** because the complete ground-truth set of true invariants, boundary hazards, and secret flows across real-world third-party codebases is unknown.
>
> **Findings ≠ CVEs / Vulnerabilities**:
> SIS findings represent boundary invariant violations (e.g. unhandled \`TypeError\` under empty input, React Flight serialization violations, or static secret flows). They must not be conflated with confirmed, exploitable production vulnerabilities or CVEs.

---

## 2. Evaluation by Repository

| Repository | Total | Reviewed | Pending | TP | FP | Expected | Unreachable | Framework | Precision |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${repoRows}

---

## 3. Evaluation by Rule ID

| Rule | Total | Reviewed | Pending | TP | FP | Expected | Unreachable | Framework | Precision |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${ruleRows}

---

## 4. Confidence Distribution

| Confidence Level | Count | Share |
| :--- | :---: | :--- |
| **High** | ${stats.confidenceDistribution.high} | ${(stats.total > 0 ? (stats.confidenceDistribution.high / stats.total) * 100 : 0).toFixed(1)}% |
| **Medium** | ${stats.confidenceDistribution.medium} | ${(stats.total > 0 ? (stats.confidenceDistribution.medium / stats.total) * 100 : 0).toFixed(1)}% |
| **Low** | ${stats.confidenceDistribution.low} | ${(stats.total > 0 ? (stats.confidenceDistribution.low / stats.total) * 100 : 0).toFixed(1)}% |

---

## 5. Reviewer Classification Guide

When manually reviewing findings in \`benchmarks/reviews/ground-truth.json\`, classify each record into one of the following:

| Classification | Meaning | Criteria |
| :--- | :--- | :--- |
| \`TRUE_POSITIVE\` | Genuine Boundary Defect | Missing defensive validation at a public network boundary leading to uncaught runtime failure, or genuine secret leak. |
| \`FALSE_POSITIVE\` | Incorrect Detection | Imprecise static analysis or safe usage incorrectly flagged by SIS. |
| \`EXPECTED_BEHAVIOR\` | Intentional Design | Action intentionally throws an error (e.g. \`throw new Error("unauthorized")\`) to signal failure to client UI. |
| \`UNREACHABLE\` | Private / Dead Code | Endpoint cannot be invoked from client-side network requests in practice. |
| \`FRAMEWORK_ARTIFACT\` | Runtime Emulation Limit | Failure caused by \`isolated-vm\` lacking Next.js server context rather than an application defect. |
| \`NEEDS_REVIEW\` | Unreviewed (Default) | Default initial state awaiting human analysis. |

### How to Submit a Review:
1. Open \`benchmarks/reviews/ground-truth.json\`.
2. Locate the finding record by its \`fingerprint\` (or run \`npm run benchmark -- --reproduce <fingerprint>\`).
3. Set \`classification\` to one of the above values.
4. Set \`confidence\` to \`"HIGH"\`, \`"MEDIUM"\`, or \`"LOW"\`.
5. Set \`reviewer\` to your GitHub username, add \`reviewNotes\`, and record the current ISO \`reviewedAt\`.
6. Run \`npm run benchmark -- --review\` to recompute statistics and update this report.

---

## 6. Catalog: Pending Findings Awaiting Review (${pendingFindings.length})

${pendingCatalog}

---

## 7. Catalog: Reviewed Findings (${reviewedFindings.length})

${reviewedCatalog}
`;
}

/**
 * Loads ground-truth reviews from benchmarks/reviews/ground-truth.json.
 */
export async function loadGroundTruth(
  filePath = "benchmarks/reviews/ground-truth.json"
): Promise<GroundTruthReviews> {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    return {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      description: "SIS Ground-Truth Benchmark Finding Reviews",
      reviews: [],
    };
  }

  const content = await fs.promises.readFile(resolved, "utf8");
  try {
    return JSON.parse(content) as GroundTruthReviews;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ground-truth reviews file at '${resolved}': ${msg}`);
  }
}

/**
 * Saves ground-truth reviews to benchmarks/reviews/ground-truth.json.
 */
export async function saveGroundTruth(
  groundTruth: GroundTruthReviews,
  filePath = "benchmarks/reviews/ground-truth.json"
): Promise<void> {
  const resolved = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await fs.promises.writeFile(resolved, JSON.stringify(groundTruth, null, 2), "utf8");
}

/**
 * Result of attempting to reproduce a finding.
 */
export interface ReproductionResult {
  fingerprint: string;
  repository: string;
  commit: string;
  file: string;
  line: number;
  ruleId: string;
  actionName?: string;
  status: "reproduced" | "failed" | "not_supported";
  message: string;
  generatedInput?: unknown;
  failureSignature?: string;
  executionError?: string;
  wallTimeMs: number;
}

/**
 * Reproduces an individual benchmark finding from its fingerprint.
 */
export async function reproduceFindingByFingerprint(
  fingerprint: string,
  corpus: BenchmarkCorpus,
  groundTruth: GroundTruthReviews
): Promise<ReproductionResult> {
  const startTime = Date.now();
  const record = groundTruth.reviews.find(
    (r) => r.fingerprint.toLowerCase() === fingerprint.toLowerCase()
  );

  if (!record) {
    throw new Error(
      `Finding with fingerprint '${fingerprint}' not found in ground-truth reviews.`
    );
  }

  const entry = corpus.repositories.find(
    (r) => r.name.toLowerCase() === record.repository.toLowerCase()
  );

  if (!entry) {
    throw new Error(
      `Corpus entry for repository '${record.repository}' not found in corpus.json.`
    );
  }

  const tempDir = path.join(
    os.tmpdir(),
    `sis-repro-${crypto.randomBytes(6).toString("hex")}`
  );

  try {
    // 1. Fetch exact pinned commit
    await checkoutPinnedRepository(entry.url, record.commit, tempDir);

    const targetDir = path.resolve(tempDir, entry.targetDir || ".");
    const targetFile = path.resolve(targetDir, record.file);

    if (!fs.existsSync(targetFile)) {
      return {
        fingerprint,
        repository: record.repository,
        commit: record.commit,
        file: record.file,
        line: record.line,
        ruleId: record.ruleId,
        actionName: record.actionName,
        status: "failed",
        message: `File '${record.file}' does not exist in repository at commit ${record.commit.slice(0, 7)}`,
        wallTimeMs: Date.now() - startTime,
      };
    }

    // 2. Reconstruct deterministic seed and audit config
    const baseSeed = 42;
    const repoSeed = deriveFileSeed(baseSeed, entry.name);

    const engine = new AuditEngine({
      runs: 10,
      seed: repoSeed,
      timeoutMs: 20,
      silent: true,
    });

    // 3. Run audit targeted at repository directory
    const auditResult = await engine.run(targetDir);

    // 4. Match the finding
    const matched = auditResult.findings.find((f) => {
      const fRuleId = RULE_ID_MAP[f.type] || "SIS000";
      const fLine = f.location?.line || 1;
      const fFile = normalizeRelativePath(f.location?.file || "", targetDir);
      const fAction = f.action;
      const fileMatch = fFile === record.file;
      const lineMatch = Math.abs(fLine - record.line) <= 3; // tolerance for small line shifts
      return (
        fRuleId === record.ruleId &&
        fileMatch &&
        lineMatch &&
        (!record.actionName || fAction === record.actionName)
      );
    });

    if (matched) {
      const generatedInput =
        matched.minimizedPayload !== undefined
          ? matched.minimizedPayload
          : matched.payload !== undefined
          ? matched.payload
          : matched.originalPayload;

      return {
        fingerprint,
        repository: record.repository,
        commit: record.commit,
        file: record.file,
        line: record.line,
        ruleId: record.ruleId,
        actionName: record.actionName,
        status: "reproduced",
        message: matched.message,
        generatedInput,
        failureSignature: matched.failureSignature || matched.errorName,
        wallTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        fingerprint,
        repository: record.repository,
        commit: record.commit,
        file: record.file,
        line: record.line,
        ruleId: record.ruleId,
        actionName: record.actionName,
        status: "failed",
        message: `Audit completed on ${record.file} but rule ${record.ruleId} did not trigger under deterministic seed ${repoSeed}`,
        wallTimeMs: Date.now() - startTime,
      };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      fingerprint,
      repository: record.repository,
      commit: record.commit,
      file: record.file,
      line: record.line,
      ruleId: record.ruleId,
      actionName: record.actionName,
      status: "failed",
      message: `Failed to execute reproduction: ${errorMsg}`,
      executionError: errorMsg,
      wallTimeMs: Date.now() - startTime,
    };
  } finally {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup error ignored
      }
    }
  }
}