# Phase 24 Baseline: Detector Semantics & Benchmark State

**Document Status**: Baseline Freeze (Phase 24 Start)  
**Baseline SIS Git Commit**: `a805cfdfe8e64e95baa371571867c3bfa74ef284` (working tree includes Phase 23 boundary precision & filter hardening)  
**Node.js Version**: `v24.19.0`  
**Platform**: `win32 (x64)`  
**Timestamp**: `2026-09-11T14:45:01Z`  
**Deterministic Configuration**: Base Seed `42`, Runs `10`, Timeout `20ms`

---

## 1. Corpus Configuration & Pinned Commits

| Repository | Pinned Commit Hash | Target Directory | Description |
| :--- | :---: | :---: | :--- |
| **shadcn-ui/taxonomy** | `298a8857c7128a0d121e7f699dfd729f23b3966d` | `.` | Next.js 13/14 App Router reference app |
| **leerob/site** | `fd03371e3c90481a8447904e1b548e4c0327b7db` | `.` | Lee Robinson's portfolio with App Router & Postgres |
| **vercel/commerce** | `3761e52e60df9c6a316e067dbfd7032e494d3634` | `.` | Next.js Commerce architecture template |
| **dubinc/dub** | `b8866f413cec065438d6e5faabbd9dac7d1ceea5` | `apps/web` | Enterprise link management platform |
| **mickasmt/next-saas-stripe-starter** | `a78d130af7e04d0250d65c67f217976f7eb3adc2` | `.` | Next.js SaaS starter with Stripe billing |

---

## 2. Benchmark Metrics Baseline (Phase 23 Post-Hardening)

| Metric | Baseline Value | Notes |
| :--- | :---: | :--- |
| **Repositories Evaluated** | **5 / 5** | 100% completion rate |
| **Total Files Discovered** | **5,362** | Full multi-repository scan |
| **Total Files Analyzed** | **3,804** | Excludes non-production test/E2E directories |
| **Files Skipped** | **1,558** | Non-TS/JS, ignored assets, or test files |
| **Server Boundaries Discovered** | **1,730** | Granular AST classification |
| **Server Actions Discovered** | **20** | Candidate actions across corpus |
| **Sandbox-Compatible Candidates** | **0** | Host-isolated actions without unmocked globals |
| **Static Taint Leaks (`SIS001`)** | **0** | No secret environment flows |
| **Serialization Hazards (`SIS002`)** | **0** | Route handlers & client props excluded |
| **Runtime Exceptions (`SIS003`)** | **9** | Confirmed in `vercel/commerce` (`updateItemQuantity`) |
| **Isolate Timeouts (`SIS004`)** | **0** | All actions completed within 20ms |
| **Contract Violations (`SIS005`)** | **0** | No assertion invariants failed |
| **Total Verified Findings** | **9** | Clean signal across corpus |
| **Analysis Errors** | **0** | Zero crashes or parser aborts |
| **Total Wall Clock Time** | **30.29s** | Deterministic parallel run |

---

## 3. Current Ground-Truth Review Store State

Prior to Phase 24 expansion, the review store (`benchmarks/reviews/ground-truth.json`) contains **43 recorded findings**:

| Status | Count | Findings Description |
| :--- | :---: | :--- |
| **`TRUE_POSITIVE`** | **2** | `b6bbfce3dbe171b5` & `84e693a7f37f6a9b` (`vercel/commerce` `components/cart/actions.ts#L54`) |
| **`FALSE_POSITIVE`** | **4** | 3 Route Handlers (`Response`/`ImageResponse`), 1 client modal callback prop |
| **`UNREACHABLE`** | **1** | `playwright/api/fixtures.ts#L78` test utility |
| **`FRAMEWORK_ARTIFACT`** | **3** | Isolated-vm unmocked Redis (`@/lib/upstash`) and AI SDK (`@ai-sdk/rsc`) crashes |
| **`PENDING`** | **33** | **7** active benchmark findings in `vercel/commerce` + **26** historical findings |
| **Total in Store** | **43** | All historical records intact |

---

## 4. Phase 24 Review Scope

The Phase 24 ground-truth expansion encompasses:
1. **Active Benchmark Population**: All 7 remaining unreviewed findings emitted by the current engine in `vercel/commerce` (`components/cart/actions.ts#L54`).
2. **Historical Inactive Population**: The 26 historical findings retained in the review store to formally document their ground-truth classifications and reasons for exclusion under hardened filters.
3. **Empirical Quality Assessment**: Calculation of empirical precision over the active benchmark findings and comparison across evaluation phases.
