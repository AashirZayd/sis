# Phase 27 — Benchmark Expansion & Blind Ground-Truth Evaluation
## Evaluation Architecture & Corpus Design Specification

> **Status**: Corpus Design & Evaluation Architecture ONLY  
> **Target Version**: SIS 0.2.0 (Phase 27 Design)  
> **Prerequisites**: Phase 24.5 (Benchmark Transparency), Phase 25 (Selective Verification), Phase 25.5 (Adversarial Hardening)  
> **Author**: SIS Core Architecture Group  
> **Date**: September 2026  

---

## 1. Executive Summary & Motivation

In Phase 25 and Phase 25.5, SIS established a high empirical quality baseline on its curated 5-repository benchmark:
- **5/5 repositories** analyzed cleanly without analysis errors.
- **3,804 files** analyzed across **1,730 server boundaries**.
- **20 Server Actions** discovered.
- **9 verified findings** emitted (all 9 verified as `TRUE_POSITIVE` in `vercel/commerce`).
- **0 false positives** and **0 framework artifacts** in current emitted benchmark output.
- **100% emitted precision** on the reviewed benchmark sample.

However, an evaluation limited to five repositories cannot provide scientific confidence that SIS's boundary classification, prefix slicer, and static taint analyzers generalize to the broader Next.js ecosystem. 

**Phase 27 establishes the architecture for expanding the benchmark from 5 to 20 pinned repositories** and defines a rigorous **Blind Ground-Truth Review Protocol** to ensure that reported metrics remain transparent, reproducible, and impervious to developer bias.

---

## 2. Current Benchmark Limitations

1. **Narrow Action Surface**: Across 5 repositories, only 20 Server Actions are discovered. 18 of these immediately call cloud or database SDKs (`stripe`, `prisma`, `upstash`), leaving only 2 actions executing under runtime verification.
2. **Homogeneous Application Architectures**: The current corpus is dominated by e-commerce (`commerce`) and developer tools (`taxonomy`, `dub`, `site`). It under-represents enterprise SaaS workflows, survey systems, document management, and healthcare/finance tooling.
3. **ORM Skew**: Prisma is used in 4 out of 5 current repositories. Modern Drizzle, Supabase, and Turso patterns are under-tested.
4. **Cognitive Confirmation Bias**: Because the developers who built the engine also authored the initial reviews, there is an inherent risk of interpretative bias when classifying ambiguous application crashes.

---

## 3. Corpus Selection Methodology & Anti-Bias Guarantees

To prevent benchmark cherry-picking:
1. **Zero Finding-Driven Selection**: Candidate repositories are **never** selected by searching for known vulnerabilities, bugs, or SIS findings.
2. **Prominence & Activity Thresholds**: Selected repositories must be publicly starred, actively maintained open-source projects or official vendor reference templates.
3. **Strict Next.js App Router Architecture**: Targets must use the modern App Router (`app/` directory), React Server Components (RSC), and Server Actions.
4. **Immutable Pinning**: Every target is locked to an exact Git commit SHA. No moving branches (`main`, `master`) are permitted in the benchmark.

---

## 4. Corpus Partitioning (Split Architecture)

The expanded corpus of 20 repositories is structured into three distinct tiers:

```text
                                 EXPANDED BENCHMARK CORPUS
                                     (20 Repositories)
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      ▼                                      ▼                                      ▼
    CORE (5)                             EXTENDED (12)                       ADVERSARIAL (3)
  Existing baseline;                  Diverse production apps;             Stress-testing filters,
  historical regression anchor.       broad architectural coverage.        OG images, webhooks, auth.
```

- **`CORE` (5 repositories)**: The historical baseline (`taxonomy`, `site`, `commerce`, `dub`, `next-saas-stripe-starter`). Ensures backwards compatibility and guarantees that known true positives remain detected while eliminated false positives do not regress.
- **`EXTENDED` (12 repositories)**: Production-grade web applications across survey engines (`formbricks`), document signing (`documenso`), financial systems (`midday`), monitoring (`openstatus`), enterprise templates (`cal.com`, `platforms`, `precedent`, `charlie-tango`), secrets management (`infisical`), and CMS integrations (`payload`, `shadcn-ui/ui`, `typebot`).
- **`ADVERSARIAL` (3 repositories / slices)**: Stress targets specifically chosen for complex boundary semantics (`create-t3-app` for tRPC vs Action boundaries, `clerk` for auth header preludes, and `dub/api` for HTTP route handlers returning non-Flight streams).

---

## 5. Candidate Metadata Model

Corpus configuration is formalized in a versioned machine-readable schema (`benchmarks/corpus.json`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BenchmarkCorpusEntry",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "owner": { "type": "string" },
    "url": { "type": "string" },
    "commit": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "commitPrefix": { "type": "string", "maxLength": 7 },
    "tier": { "type": "string", "enum": ["CORE", "EXTENDED", "ADVERSARIAL"] },
    "status": { "type": "string", "enum": ["active", "candidate", "excluded"] },
    "license": { "type": "string" },
    "language": { "type": "string", "enum": ["typescript", "javascript", "mixed"] },
    "sizeClass": { "type": "string", "enum": ["small", "medium", "large", "very-large"] },
    "framework": {
      "type": "object",
      "properties": {
        "nextVersion": { "type": "string" },
        "appRouter": { "type": "boolean" },
        "serverActions": { "type": "boolean" },
        "rsc": { "type": "boolean" },
        "orm": { "type": "string" },
        "auth": { "type": "string" }
      },
      "required": ["nextVersion", "appRouter"]
    },
    "selectionReason": { "type": "string" },
    "selectionDate": { "type": "string", "format": "date" }
  },
  "required": ["name", "url", "commit", "tier", "status", "framework"]
}
```

---

## 6. Ground-Truth Architecture & Blind Review

The benchmark separates **Detection Engine Output** from **Ground-Truth Adjudication**:

```text
 ┌────────────────────────────────────────────────────────┐
 │                     SIS ENGINE                         │
 │  Input: Pinned Repository Source Code                  │
 │  Output: Raw Diagnostic Findings (latest.json)         │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │               BLIND REVIEW INTERFACE                   │
 │  Stage 1: Strip Rule IDs, Rationale, and Engine Traces │
 │  Reviewer: Evaluates code location & raw crash output  │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │             SECONDARY EVIDENCE DISCLOSURE              │
 │  Stage 2: Reveal SIS Taint Traces, Prefix Boundaries   │
 │  Reviewer: Finalizes classification & confidence       │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │              GROUND-TRUTH REPOSITORY                   │
 │  Stored in: benchmarks/reviews/ground-truth.json       │
 │  Published in: benchmarks/results/ground-truth.md      │
 └────────────────────────────────────────────────────────┘
```

Detailed reviewer instructions and classification rules are codified in [`benchmarks/BLIND_REVIEW_PROTOCOL.md`](file:///E:/development/sis/benchmarks/BLIND_REVIEW_PROTOCOL.md).

---

## 7. Metrics & Statistical Integrity

### Mathematical Metric Definitions

1. **Emitted Precision (Conservative Binary Definition)**:
   $$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$$
   *Rule*: Evaluated exclusively across reviewed findings classified as `TRUE_POSITIVE` or `FALSE_POSITIVE`. Findings classified as `FRAMEWORK_ARTIFACT`, `UNREACHABLE`, or `EXPECTED_BEHAVIOR` are tracked in separate dedicated error rate metrics.

2. **Framework-Artifact Rate**:
   $$\text{Artifact Rate} = \frac{\text{FRAMEWORK\_ARTIFACT}}{\text{Total Reviewed Findings}}$$

3. **Unreachable Finding Rate**:
   $$\text{Unreachable Rate} = \frac{\text{UNREACHABLE}}{\text{Total Reviewed Findings}}$$

4. **Review Coverage**:
   $$\text{Review Coverage} = \frac{\text{Reviewed Findings}}{\text{Total Emitted Findings}}$$

5. **Action Verification Rate**:
   $$\text{Verification Rate} = \frac{\text{Actions in FULL or PREFIX Mode}}{\text{Total Server Actions Discovered}}$$

### Recall Policy
> [!IMPORTANT]
> **SIS Explicitly Disclaims Unsubstantiated Recall Claims**. In real-world, uninstrumented open-source software, the true denominator of all latent security vulnerabilities and runtime edge-case exceptions cannot be known with mathematical certainty. SIS benchmark reports must state:  
> *"Recall is not estimated because the complete set of latent defects is unknown."*

---

## 8. Negative Sampling Strategy (Detecting Blind Spots)

To assess what SIS might be missing without claiming artificial recall:
1. **Audit Population**: A deterministic pseudo-random 10% sample of all boundaries where SIS emitted **zero** findings.
2. **Stratification Categories**:
   - Actions classified as `STATIC_ONLY` due to unhandled dependencies.
   - Server Component prop boundaries passing complex objects or functions.
   - Route Handlers excluded by framework filters.
3. **Manual Audit Objective**: Determine whether any negative sample harbored an unhandled crash or serializability violation that SIS failed to report.

---

## 9. Benchmark Reproducibility Model

The benchmark distinguishes two levels of reproducibility:

| Level | Definition | Guarantee |
| :--- | :--- | :--- |
| **Source Reproducibility** | The exact AST evaluated by SIS. | **Absolute**: Guaranteed by immutable 40-character Git commit SHAs and pinned corpus manifests. |
| **Execution Reproducibility** | The runtime verdict and generated counterexample payloads. | **Environment-Bounded**: Guaranteed under equivalent Node.js major version, SIS version, V8 isolate memory limits, and identical base pseudo-random seed (`seed: 42`). Hardware execution timing is non-deterministic and not guaranteed. |

---

## 10. Performance Scaling & Measurement Plan

With 20 repositories, the corpus will scan over 25,000 files and analyze approximately 15,000 files.

### Instrumentation Metrics
Every benchmark run records:
- Total wall-clock duration.
- Per-repository wall time and memory high-water mark.
- Breakdown of time spent in:
  - Repository shallow cloning / checkout.
  - SWC AST parsing & symbol indexing.
  - Static taint analysis & boundary classification.
  - V8 isolate pool initialization & prefix execution.

### Baseline Expectation
- Target median repository analysis time: $< 8.0\text{s}$.
- Maximum single repository timeout: $180\text{s}$.
- Target total benchmark execution duration: $< 150\text{s}$ on standard developer workstations.

---

## 11. Reporting Format Design

The expanded benchmark reporter will generate a consolidated Markdown dashboard (`benchmarks/results/latest.md`):

```text
================================================================================
 SIS BENCHMARK EVALUATION DASHBOARD (CORPUS V2.0)
 Repositories: 20 (5 CORE | 12 EXTENDED | 3 ADVERSARIAL)
 Node: v24.19.0 | SIS: 0.2.0 | Base Seed: 42 | Runs/Action: 10
================================================================================

1. Corpus Summary
   - Files Scanned: 28,410 | Files Analyzed: 16,840
   - Server Boundaries: 6,420 | Server Actions: 84
   - Execution Breakdown: FULL: 12 | PREFIX: 28 | STATIC_ONLY: 44

2. Rule Diagnostics
   - SIS001 (Taint / Secret Leak): 0
   - SIS002 (Non-Serializable Prop): 0
   - SIS003 (Runtime Exception): 14
   - SIS004 (Timeout): 0
   - SIS005 (Unbounded Loop): 0

3. Ground-Truth Review Metrics
   - Total Reviewed: 14 / 14 (100% Review Coverage)
   - TRUE_POSITIVE: 14 | FALSE_POSITIVE: 0
   - FRAMEWORK_ARTIFACT: 0 | UNREACHABLE: 0
   - Emitted Precision: 100.0% (14 / 14)
   - Inter-Rater Agreement (Cohen's Kappa): 0.94 (Sample: 6 findings)

4. Performance
   - Total Wall Time: 114.2s | Median Repo Time: 4.8s
   - Largest Target: calcom/cal.com (38.2s)
================================================================================
```

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Monorepo Scale** (e.g. `cal.com`, `dub`) | Exhausts Node.js memory or causes AST parse timeouts. | Target specific Next.js workspace subdirectories (`targetDir: "apps/web"`) to exclude unrelated build tooling and native packages. |
| **Flaky Network Clones** | Benchmark fails due to GitHub shallow clone connection drops. | Implement retry logic with exponential backoff; support pre-cached local repository mirrors via `--cache-dir`. |
| **Subjective TP/FP Classifications** | Ambiguity over whether malformed inputs reaching unvalidated actions are "bugs" or "client error". | Strict adherence to [`benchmarks/BLIND_REVIEW_PROTOCOL.md`](file:///E:/development/sis/benchmarks/BLIND_REVIEW_PROTOCOL.md) requiring proof of unhandled server exception or state corruption. |

---

## 13. Explicit Non-Goals

The following activities are explicitly outside the scope of Phase 27:
- Implementing automatic cloning or running the 20-repository benchmark.
- Altering the engine's core analysis rules (`src/taint/`, `src/runtime/`).
- Expanding runtime preludes or adding compatibility shims for external cloud SDKs.
- Modifying the existing pinned 5-repository ground truth.
- Claiming arbitrary recall metrics.

---

## 14. Future Implementation Roadmap

1. **Phase 28**: Implement CLI flags for corpus tiers (`--core`, `--extended`, `--all`).
2. **Phase 28.5**: Pilot clone and dry-run metadata validation across the 15 new candidates without executing heavy fuzzing.
3. **Phase 29**: Execute full expanded benchmark run; generate blind review packets for emitted findings.
4. **Phase 29.5**: Complete blind reviews, record ground-truth adjudication, and publish expanded generalization results.
