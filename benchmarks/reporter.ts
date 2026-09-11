import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunResult } from "./types.ts";

/**
 * Formats benchmark results as serialized JSON.
 */
export function generateJsonReport(result: BenchmarkRunResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Formats benchmark results as a GitHub-friendly Markdown report.
 */
export function generateMarkdownReport(result: BenchmarkRunResult): string {
  const { metadata, repositories, aggregate } = result;

  const repoRows = repositories
    .map((r) => {
      const statusIcon = r.status === "completed" ? "✓ Completed" : `✖ ${r.error || "Failed"}`;
      const shortCommit = r.commit.slice(0, 7);
      const commitLink = `[\`${shortCommit}\`](${r.url.replace(/\.git$/, "")}/tree/${r.commit})`;
      const findingsSummary = `${r.verifiedFindings} (T:${r.findingBreakdown.taintViolations} / S:${r.findingBreakdown.serializationViolations} / E:${r.findingBreakdown.runtimeExceptions} / TO:${r.findingBreakdown.timeouts})`;

      return `| [**${r.repository}**](${r.url.replace(/\.git$/, "")}) | ${commitLink} | ${statusIcon} | ${r.filesAnalyzed}/${r.filesDiscovered} | ${r.boundariesFound} | ${r.serverActionsFound} | ${r.runtimeCompatibleCandidates} | ${findingsSummary} | ${r.analysisErrors} | ${(r.auditWallTimeMs / 1000).toFixed(2)}s |`;
    })
    .join("\n");

  const totalFindingsBreakdown = repositories.reduce(
    (acc, r) => {
      acc.taint += r.findingBreakdown.taintViolations;
      acc.serialization += r.findingBreakdown.serializationViolations;
      acc.exceptions += r.findingBreakdown.runtimeExceptions;
      acc.timeouts += r.findingBreakdown.timeouts;
      acc.invariants += r.findingBreakdown.invariantViolations;
      return acc;
    },
    { taint: 0, serialization: 0, exceptions: 0, timeouts: 0, invariants: 0 }
  );

  return `# SIS Real-World Benchmark Report

Generated: ${metadata.timestamp}  
Corpus Version: \`${metadata.corpusVersion}\`  
SIS Engine: \`@aashirzayd/sis@${metadata.sisVersion}\` (\`${metadata.sisCommit.slice(0, 7)}\`)

---

## 1. Environment & Configuration

| Parameter | Value |
| :--- | :--- |
| **Node.js Version** | \`${metadata.nodeVersion}\` |
| **Operating System** | \`${metadata.platform} (${metadata.arch})\` |
| **CPU Architecture** | \`${metadata.cpuModel}\` |
| **Base Random Seed** | \`${metadata.baseSeed}\` (Deterministic FNV-1a derivation) |
| **Fuzz Runs Budget** | \`${metadata.runs}\` runs per candidate action |
| **Isolate Timeout** | \`${metadata.timeoutMs}ms\` CPU budget |

---

## 2. Evaluation Results by Repository

| Repository | Pinned Commit | Status | Files (Analyzed/Total) | Boundaries | Actions | Sandbox Compatible | Findings (T / S / E / TO) | Errors | Wall Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${repoRows}
| **Total (${aggregate.totalRepositories} repos)** | — | **${aggregate.successfulRepositories}/${aggregate.totalRepositories} pass** | **${aggregate.totalFilesAnalyzed}/${aggregate.totalFilesScanned}** | **${aggregate.totalBoundariesFound}** | **${aggregate.totalServerActionsFound}** | **${aggregate.totalRuntimeCompatibleCandidates}** | **${aggregate.totalVerifiedFindings} (T:${totalFindingsBreakdown.taint} / S:${totalFindingsBreakdown.serialization} / E:${totalFindingsBreakdown.exceptions} / TO:${totalFindingsBreakdown.timeouts})** | **${aggregate.totalAnalysisErrors}** | **${(aggregate.totalWallTimeMs / 1000).toFixed(2)}s** |

> **Legend**: **T** = Static Taint Violations (\`SIS001\`), **S** = React Flight Serialization Violations (\`SIS002\`), **E** = Runtime Exceptions (\`SIS003\`), **TO** = Execution Timeouts (\`SIS004\`).

---

## 3. Aggregate Summary & Findings Breakdown

| Finding Category | Diagnostic Code | Verified Occurrences | Verification Mechanism |
| :--- | :---: | :---: | :--- |
| **Secret Taint Leaks** | \`SIS001\` | ${totalFindingsBreakdown.taint} | Static Interprocedural Call-Graph Analysis |
| **Serialization Hazards** | \`SIS002\` | ${totalFindingsBreakdown.serialization} | Static React Flight Serializability Modeling |
| **Runtime Exceptions** | \`SIS003\` | ${totalFindingsBreakdown.exceptions} | Dynamic V8 Isolate Verification + Delta-Debugging Shrink |
| **Isolate Timeouts** | \`SIS004\` | ${totalFindingsBreakdown.timeouts} | Enforced Execution Budget (${metadata.timeoutMs}ms) |
| **Invariant Violations** | \`SIS005\` | ${totalFindingsBreakdown.invariants} | Assertion & Contract Verification |
| **Total Findings** | — | **${aggregate.totalVerifiedFindings}** | Multi-Phase Integrated Pipeline |

---

## 4. Runtime Compatibility & Boundary Classification

SIS evaluates each discovered Server Action against its **Compatibility Gate**:
- **Sandbox-Compatible Candidates**: ${aggregate.totalRuntimeCompatibleCandidates} actions were pure functions without host dependencies, successfully executed in zero-privilege \`isolated-vm\` V8 isolates.
- **Static-Only Framework Boundaries**: Actions requiring live Next.js request context (\`cookies()\`, \`headers()\`, \`redirect()\`, \`notFound()\`) or external database ORM connections were analyzed statically for taint and serializability contracts, while bypassing isolate execution to prevent artificial crashes.

---

## 5. Technical Limitations & Ground-Truth Disclaimer

> [!IMPORTANT]
> **Findings ≠ Confirmed Vulnerabilities**:
> 1. SIS identifies boundary invariants that fail under adversarial or unanticipated inputs (such as \`null\`, \`undefined\`, numeric extremes, non-serializable objects, or environment variable flows).
> 2. An unhandled \`TypeError\` or \`RangeError\` under an empty object or \`NaN\` indicates missing defensive validation at the public network boundary. It does not automatically imply a high-severity remote code execution or data breach.
> 3. True-positive and false-positive classifications require human code review of each application's intended business logic and upstream authentication middleware.
> 4. SIS does not emulate a live Next.js server or database connections; framework-dependent operations are classified as static-only.

---

## 6. Reproducibility & Ground-Truth Review

Deterministic seed derivation makes generated inputs reproducible under equivalent SIS, Node.js, and execution environments.

Every finding is assigned a stable 16-hex deterministic fingerprint based on repository, file path, line number, column, rule ID, and failure signature. Individual findings can be independently inspected and reproduced using:
\`\`\`bash
npm run benchmark -- --reproduce <fingerprint>
\`\`\`
`;
}

/**
 * Writes latest.json and latest.md to the output directory.
 */
export async function writeReports(
  result: BenchmarkRunResult,
  outDir = "benchmarks/results"
): Promise<{ jsonPath: string; mdPath: string }> {
  const resolvedOutDir = path.resolve(process.cwd(), outDir);

  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
  }

  const jsonContent = generateJsonReport(result);
  const mdContent = generateMarkdownReport(result);

  const jsonPath = path.join(resolvedOutDir, "latest.json");
  const mdPath = path.join(resolvedOutDir, "latest.md");

  await fs.promises.writeFile(jsonPath, jsonContent, "utf-8");
  await fs.promises.writeFile(mdPath, mdContent, "utf-8");

  return { jsonPath, mdPath };
}
