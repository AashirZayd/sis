# SIS — Final Project Status & Architecture Handoff

## 1. Project Identity & Overview

- **Project Name**: SIS — Speculative Invariant Synthesis
- **Package Name**: `@aashirzayd/sis`
- **Version**: `0.1.0`
- **License**: MIT © 2026 Aashir Zayd
- **Repository**: [https://github.com/AashirZayd/sis](https://github.com/AashirZayd/sis)
- **Status**: **FROZEN / PAUSED** (Phase 28 Complete; Benchmark Hardening & Acquisition Sealed)

SIS is an autonomous runtime verification and speculative invariant synthesis engine for Next.js Server Components and Server Actions. It audits boundary contracts by analyzing SWC AST data flows, synthesizing property-based payloads, and selectively verifying input validation prefixes inside zero-privilege V8 isolates (`isolated-vm`).

---

## 2. Core Capabilities

1. **SWC AST Boundary Discovery**: Fast, native AST parsing of `"use client"` and `"use server"` boundaries, identifying exported Server Actions, inline actions, and RSC prop boundaries.
2. **Next.js Boundary Classification**: Discrimination of Server Actions from Route Handlers (`GET`, `POST`, `OPTIONS`), negative control filtering for HTTP streaming and raw webhooks (`ImageResponse`).
3. **Flight Serialization Hazard Detection (`SIS002`)**: Static detection of non-serializable objects (Functions, Promises, Symbols, recursive references) passed across client-server prop boundaries.
4. **Interprocedural Static Taint Analysis (`SIS001`)**: Source-to-sink tracking of sensitive secrets (`process.env.SECRET_*`, database URLs, API tokens) flowing to client-accessible scopes.
5. **Property-Based Speculative Payload Generation**: Deterministic, seed-derived synthesis of boundary payloads via `fast-check` (adversarial strings, prototypes, prototype pollution, deeply nested objects, type mutations).
6. **Zero-Privilege Isolated Runtime Execution (`isolated-vm`)**: Isolated V8 execution without Node.js globals, disk access, or network access, bounded by deterministic microsecond CPU and memory quotas.
7. **Selective Prefix Runtime Verification**: Dependency-independent slicing of pure validation prefixes preceding external database/cloud boundaries, verifying parameter validation without emulating entire cloud SDKs.
8. **Failure Shrinking & Minimization**: Invariant-preserving payload minimization isolating exact root-cause failure signatures.
9. **Deterministic Multi-Threaded Scanning**: File-level FNV-1a seed derivation guaranteeing byte-for-byte reproducibility across runs.
10. **Machine-Readable Outputs**: Comprehensive terminal presenter, machine-readable JSON Schema v1, and OASIS SARIF 2.1.0 for GitHub Security Code Scanning integration.
11. **Hardened Benchmark Infrastructure**: Multi-tier corpus management (`--core`, `--extended`, `--adversarial`, `--all`), fail-fast non-interactive Git acquisition (`GIT_TERMINAL_PROMPT=0`), shallow commit fetch, and exact HEAD verification.

---

## 3. Current Empirical Validation Metrics

### Baseline CORE Benchmark (5 Sacred Repositories)
The established baseline benchmark was verified under deterministic seed `42` with 10 fuzzing runs per action:

- **Target Repositories**: 5 (`shadcn-ui/taxonomy`, `leerob/site`, `vercel/commerce`, `dubinc/dub`, `mickasmt/next-saas-stripe-starter`)
- **Total Files Scanned**: 5,369 files
- **Total Files Analyzed**: 3,804 files
- **Server Boundaries Discovered**: 1,730 boundaries
- **Server Actions Discovered**: 20 actions
- **Verified Findings Emitted**: 9 findings
- **Emitted Analysis Errors**: 0 errors
- **Benchmark Wall Time**: ~35.6s

### Emitted Finding Precision
- **Total Emitted Verified Findings**: 9 findings
- **Confirmed True Positives (TP)**: 9 findings
- **False Positives in Current Emitted Output (FP)**: 0 findings
- **Current Emitted Benchmark Precision**: **100% precision on the currently reviewed emitted benchmark findings**.
  *(Note: This represents precision on emitted findings across the reviewed benchmark corpus, not an absolute claim of zero false positives on all possible software).*

---

## 4. Confirmed Real-World Findings Catalog

All 9 confirmed `TRUE_POSITIVE` findings in the reviewed benchmark originate from `vercel/commerce` (`3761e52`), specifically in `components/cart/actions.ts`:

| Fingerprint | Rule | File & Line | Identifier / Action | Defect Summary | Classification |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `b6bbfce3dbe171b5` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Unchecked input passed directly to property access | `TRUE_POSITIVE` (High) |
| `fd735a22830f3531` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Null/undefined payload generates uncaught TypeError | `TRUE_POSITIVE` (High) |
| `30953a9f0f9c2d1b` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Missing shape validation on cart line item | `TRUE_POSITIVE` (High) |
| `8579e2aa21e4a29a` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Primitive string payload triggers runtime exception | `TRUE_POSITIVE` (High) |
| `c6a0c50f834d5885` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Type confusion on quantity property | `TRUE_POSITIVE` (High) |
| `280b2a74c2fa6212` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Out-of-bounds numerical input handling | `TRUE_POSITIVE` (High) |
| `f0ebc0eb2d854ce6` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Missing payload type validation | `TRUE_POSITIVE` (High) |
| `6fbebe9c1851259e` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Missing argument guard before cart manipulation | `TRUE_POSITIVE` (High) |
| `8a531cf6fa301ec7` | `SIS003` | `components/cart/actions.ts#L44` | `updateItemQuantity` | Prototype pollution/unexpected key crashes handler | `TRUE_POSITIVE` (High) |

Each finding is deterministically reproducible:
```bash
npm run benchmark -- --reproduce b6bbfce3dbe171b5
```

---

## 5. Ground Truth Review Store Status

The historical ground truth catalog (`benchmarks/reviews/ground-truth.json`) tracks 43 reviewed historical findings across the evolutionary history of SIS:

- **Total Historical Records Reviewed**: 43 (100% review coverage)
- **True Positives (TP)**: 9 (20.9%)
- **False Positives (FP)**: 9 (20.9%) — Eliminated in Phase 23
- **Framework Artifacts**: 24 (55.8%) — Eliminated in Phase 23
- **Unreachable Test Utilities**: 1 (2.3%) — Eliminated in Phase 23
- **Expected Behavior**: 0
- **Pending Review**: 0
- **Historical Reviewed Precision**: 50.0% (9 TP / 18 actionable across lifetime)
- **Current Engine Precision**: **100%** (9 TP / 9 Emitted Findings)

---

## 6. Expanded Corpus Status (Phase 28)

The benchmark corpus is organized into three tiers:

```text
Corpus (20 Candidates)
├── CORE (5 Baseline Repositories) -> 100% Active & Verified
├── EXTENDED (12 Real-World Apps) -> 8 Active & Verified, 4 Transparently Excluded
└── ADVERSARIAL (3 Stress Targets) -> 100% Active & Verified
```

- **Active & Acquirable Targets**: 16 repositories
- **Excluded Targets**: 4 repositories
  - `charlie-tango/next-starter`: `repository-unreachable` (HTTP 404 upstream)
  - `typebot/typebot`: `repository-unreachable` (HTTP 404 upstream)
  - `infisical/infisical`: `clone-timeout` (Snapshot exceeds 880MB binary assets)
  - `openstatusHQ/openstatus`: `clone-timeout` (Transfer exceeds bounded budget)

---

## 7. Test Suite & Package Integrity

- **Test Suite Status**: **340 tests passing across 24 test suites** (`npm test`)
- **TypeScript Compilation**: **Clean 0 errors** (`npm run build`)
- **Package Distribution**: **Clean 0 warnings** (`npm pack --dry-run`)
- **Git Working Tree**: Clean, all changes committed and pushed to `origin/main`.

---

## 8. Security Posture & Architecture Philosophy

1. **Fail-Closed by Design**: SIS enforces a strict fail-closed security posture. If a Server Action depends on unresolvable external state, complex module-scope closures, or unsupported runtime globals, SIS classifies the action as `STATIC_ONLY`. It will **never** guess or execute speculative code that could produce synthetic, false positives.
2. **Selective Prefix Verification**: Rather than mocking entire third-party SDKs (Prisma, Stripe, Shopify, Supabase), SIS slices and verifies only the self-contained validation prefix preceding external boundary calls.
3. **Zero-Privilege Isolation**: All runtime execution occurs inside zero-privilege V8 isolates without access to filesystem, network, child processes, or ambient environment secrets.

---

## 9. Known Limitations

To maintain technical precision and credibility, SIS explicitly documents its architectural boundaries:

1. **Not a Full Next.js Runtime**: SIS uses `isolated-vm` to execute JavaScript in a clean V8 isolate. It does not run a mock Next.js server, emulate the React reconciler, or provide Next.js routing infrastructure.
2. **Static-Only for Framework Globals**: Actions requiring live Next.js request context (`cookies()`, `headers()`, `redirect()`, `notFound()`) or external database connections without self-contained validation logic are classified as `static-only` and safely skipped from isolate execution.
3. **Flight Modeling vs Bundler Emulation**: React Flight serializability is modeled against published protocol specifications; it does not invoke React's internal webpack flight client/server plugin.
4. **Targeted Fuzzing vs Formal Proof**: Speculative invariant synthesis generates targeted boundary payloads. Passing an audit verifies that tested invariants held against synthesized inputs; it is not a mathematical proof of absolute security.
5. **Static Taint Reach**: Static analysis operates over discoverable local module graphs. Dynamic evaluation (`eval()`, dynamically constructed `import()`, or obfuscated property access) cannot be tracked.
6. **No Universal Recall Claim**: Conservative filtering guarantees high precision on emitted findings, but actions with complex dependencies are skipped, leaving potential recall blind spots.
7. **Acquisition Constraints**: Monorepos containing large binary assets or private forks cannot be verified under lightweight CI budgets.

---

## 10. Recommended Future Work (When Resumed)

If and when development on SIS is resumed, the most justified engineering priorities are:

1. **Blind Ground-Truth Evaluation on EXTENDED Corpus**: Execute blind ground-truth labeling on findings across the 8 verified EXTENDED repositories.
2. **Standardized Synthetic Benchmark Suite**: Develop a dedicated, self-contained Next.js test fixture corpus to complement open-source repositories with known ground-truth vulnerabilities.
3. **Selective Local Helper Inlining**: Revisit dependency-aware local helper recovery only if supported by clear empirical yield on the expanded corpus.
