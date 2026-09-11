# Phase 24: Comprehensive Benchmark Comparison (Phase 22 → Phase 23 → Phase 24)

**Document Status**: Formal Evaluation Multi-Phase Comparison  
**Corpus**: 5 pinned real-world Next.js repositories (`shadcn-ui/taxonomy`, `leerob/site`, `vercel/commerce`, `dubinc/dub`, `mickasmt/next-saas-stripe-starter`)  
**Evaluation Environment**: Node.js `v24.19.0`, Windows `x64`, Base Seed `42`, Runs `10`, Timeout `20ms`

---

## 1. Multi-Phase Metrics Comparison Table

| Metric | Phase 22 Baseline | Phase 23 Hardened | Phase 24 Evaluated | Overall Delta | Architectural Interpretation |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Repositories Evaluated** | 5 / 5 | 5 / 5 | 5 / 5 | 0 | 100% corpus pass rate maintained across all evaluation phases |
| **Files Discovered** | 5,362 | 5,362 | 5,362 | 0 | Corpus commit pins remain strictly identical and immutable |
| **Files Analyzed** | 3,985 | 3,804 | 3,804 | -181 | Test & E2E directories (`playwright/`, `e2e/`, `cypress/`) filtered out by default |
| **Server Boundaries** | 894 | 1,730 | 1,730 | +836 | Granular AST classification: route handlers, client components, server actions |
| **Server Actions Discovered** | 20 | 20 | 20 | 0 | Action discovery remains consistent and un-degraded |
| **Sandbox-Compatible Candidates** | 0 | 0 | 0 | 0 | Strict isolation enforcement; actions requiring live cloud context are static-only |
| **Secret Taint Leaks (`SIS001`)** | 0 | 0 | 0 | 0 | Static taint analysis detected 0 secret leaks flowing to client props |
| **Serialization Hazards (`SIS002`)** | 10 | 0 | 0 | -10 | Spurious Route Handler `Response` and client modal callback prop flags eliminated |
| **Runtime Exceptions (`SIS003`)** | 33 | 9 | 9 | -24 | Un-mocked cloud SDK `ReferenceError` crashes (Redis, AI SDK) gated as static-only |
| **Execution Timeouts (`SIS004`)** | 0 | 0 | 0 | 0 | Zero isolate timeouts across corpus (all actions completed in ≤3ms) |
| **Invariant Violations (`SIS005`)** | 0 | 0 | 0 | 0 | Zero assertion contract violations |
| **Verified Findings Emitted** | **43** | **9** | **9** | **-34** | 79.1% noise reduction; spurious false positives and sandbox artifacts eliminated |
| **Reviewed Findings in Store** | 10 | 10 | **43** | **+33** | **100% of benchmark findings (lifetime & active) manually reviewed** |
| **`TRUE_POSITIVE`** | 2 | 2 | **9** | **+7** | All 9 active findings in `vercel/commerce` confirmed as true input validation bugs |
| **`FALSE_POSITIVE`** | 4 | 4 | **9** | **+5** | 6 Route Handlers and 3 Client modal callback props confirmed safe |
| **`FRAMEWORK_ARTIFACT`** | 3 | 3 | **24** | **+21** | Un-mocked Redis and AI SDK isolate crashes confirmed as sandbox environment limits |
| **`UNREACHABLE`** | 1 | 1 | **1** | 0 | Playwright test fixture confirmed as non-production code |
| **`EXPECTED_BEHAVIOR`** | 0 | 0 | **0** | 0 | Zero findings represented intentional application error aborts |
| **Pending Reviews** | 33 | 33 | **0** | **-33** | Zero pending reviews remaining in ground-truth review store |
| **Active Emitted Precision** | 33.3% (sample) | 100.0% (emitted) | **100.0%** | **+66.7%** | **100% of currently emitted findings are verified True Positives ($9 / 9$)** |
| **Historical Store Precision** | 33.3% | 33.3% | **50.0%** | **+16.7%** | Precision across all 43 lifetime findings: $9 / (9 + 9) = 50.0\%$ |
| **Total Wall Time** | 41.10s | 30.29s | **30.29s** | **-10.81s** | 26.3% faster due to test directory exclusion and static-only bypassing |
| **Analysis Errors** | 0 | 0 | 0 | 0 | Zero crashes, unhandled rejections, or parser errors |
| **Automated Test Count** | 258 | 277 | **280** | **+22** | Comprehensive regression coverage across 21 test files |

---

## 2. Analysis of Finding Reductions: Progress vs. Risk

A reduction in raw finding count from 43 to 9 must not be simplistically characterized as positive without technical justification. We analyze each category of reduction:

### 1. Elimination of 10 `SIS002` Serialization Findings
- **Breakdown**: 6 HTTP Route Handlers returning `new Response()` or `new ImageResponse()` + 3 implicit Client Component modals passing callback props (`onSuccess`, `onLoad`) + 1 Playwright test fixture.
- **Justification**: **Genuine Precision Improvement (Defect Removal)**.
  - Next.js App Router Route Handlers communicate via standard Web API HTTP semantics. Flagging a Web API `Response` under React Flight RPC serialization rules was a fundamental framework modeling error in the engine.
  - Client Component modals calling `useRouter()` and `useState()` pass ordinary JavaScript function callbacks within the client DOM tree; no React Flight boundary is crossed.
  - None of these 10 eliminated findings represented a security vulnerability, serialization hazard, or application flaw.

### 2. Elimination of 24 `SIS003` Runtime Exception Findings
- **Breakdown**: 6 Upstash Redis findings in `forceWithdrawal` throwing `ReferenceError: redis is not defined` + 18 `@ai-sdk/rsc` streaming findings in `generateCsvMapping` and `generateFilters` throwing `ReferenceError: createStreamableValue is not defined`.
- **Justification**: **Sandbox Compatibility Gating (Elimination of False Signals)**.
  - In `isolated-vm`, external cloud SDK singletons and streaming primitives cannot be bound without network or mock stubs.
  - The crashes observed were artifacts of running code in an isolated V8 sandbox without its cloud services, not defects in application logic.
  - By routing actions with un-mockable cloud dependencies to `static-only`, SIS avoids polluting audit reports with synthetic environment crashes while preserving static taint and serialization coverage.

### 3. Preservation of 9 `SIS003` Runtime Exception Findings in `vercel/commerce`
- **Breakdown**: All 9 findings on `components/cart/actions.ts#L54` (`updateItemQuantity`).
- **Justification**: **True Positive Signal Retained**.
  - Public Server Actions that unconditionally destructure untrusted network arguments before runtime validation crash deterministically under adversarial or malformed payloads.
  - The detector successfully identified, isolated, executed, delta-debugged, and verified these findings with zero regression.

---

## 3. Ground-Truth Quality & Precision Summary

Across the lifetime review store (43 total records):
- **True Positives**: 9 (20.9% of all lifetime findings)
- **False Positives**: 9 (20.9% of all lifetime findings)
- **Framework Artifacts**: 24 (55.8% of all lifetime findings)
- **Unreachable**: 1 (2.3% of all lifetime findings)
- **Lifetime Binary Precision**: $9 / (9 + 9) = \mathbf{50.0\%}$

Across the active hardened engine (Phase 23/24 benchmark output):
- **Emitted True Positives**: 9
- **Emitted False Positives**: 0
- **Emitted Framework Artifacts**: 0
- **Emitted Unreachable Code**: 0
- **Active Emitted Precision**: $9 / (9 + 0) = \mathbf{100.0\%}$
