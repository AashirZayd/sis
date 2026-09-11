# Phase 25 Benchmark Comparison

## Baseline

Phase 24 (commit `14501ad` / `bba5bc7`). In Phase 24, boundary precision and filter hardening prevented false positives on Route Handlers, test utilities, implicit Client Components, and unresolved external cloud SDK dependencies. However, because external module imports and Next.js server primitives were unconditionally treated as unsupported globals, any Server Action referencing `cookies()`, `redirect()`, or cloud APIs fell back to static-only mode without executing any application logic.

## Phase 25

Phase 25 implements **Selective Runtime Verification** — dependency-independent prelude execution for safely verifiable Server Action prefixes. In zero-privilege V8 isolates (`isolated-vm`), SIS injects narrow deterministic runtime preludes (`cookies`, `headers`, `redirect`, `notFound`, `revalidatePath`, `revalidateTag`, `unstable_noStore`) and uses SWC AST slicing to verify input-dependent statement prefixes before unsupported framework, database, or cloud dependencies are reached.

## Corpus

The benchmark evaluates the exact same 5 pinned real-world Next.js open-source repositories:

| Repository | Pinned Commit SHA | Description |
| :--- | :--- | :--- |
| **shadcn-ui/taxonomy** | `298a8857c7128a0d121e7f699dfd729f23b3966d` | Next.js 13/14 App Router reference application |
| **leerob/site** | `fd03371e3c90481a8447904e1b548e4c0327b7db` | Lee Robinson's personal site / portfolio with Server Actions & Postgres |
| **vercel/commerce** | `3761e52e60df9c6a316e067dbfd7032e494d3634` | Next.js Commerce architecture template with App Router & cart actions |
| **dubinc/dub** | `b8866f413cec065438d6e5faabbd9dac7d1ceea5` | Link management platform with multi-tenant App Router & Server Actions |
| **mickasmt/next-saas-stripe-starter** | `a78d130af7e04d0250d65c67f217976f7eb3adc2` | SaaS starter with Next.js 14 App Router, Stripe, and auth |

Execution parameters: Base Seed: `42` | Runs per action: `10` | Sandbox timeout: `20ms`.

---

## Metrics

| Metric | Phase 24 Baseline | Phase 25 | Delta |
| :--- | :---: | :---: | :---: |
| **Repositories Evaluated** | 5 | 5 | 0 |
| **Repositories Succeeded** | 5 | 5 | 0 |
| **Repositories Failed** | 0 | 0 | 0 |
| **Total Files Scanned** | 5,362 | 5,362 | 0 |
| **Total Files Analyzed** | 3,804 | 3,804 | 0 |
| **Server Boundaries** | 1,730 | 1,730 | 0 |
| **Server Actions Discovered** | 20 | 20 | 0 |
| **Prop Boundaries** | 80 | 80 | 0 |
| **SIS001 (Server Secret In Leak)** | 0 | 0 | 0 |
| **SIS002 (Non-Serializable Flight Prop)** | 0 | 0 | 0 |
| **SIS003 (Unhandled Runtime Exception)** | 9 | 9 | 0 |
| **SIS004 (Concurrent Request Collision)** | 0 | 0 | 0 |
| **SIS005 (Unbounded Action Loop)** | 0 | 0 | 0 |
| **Total Verified Findings** | 9 | 9 | 0 |
| **Runtime Failures (in sandbox)** | 9 | 9 | 0 |
| **Analysis Errors** | 0 | 0 | 0 |
| **Total Wall Time** | 29.74s | 38.65s | +8.91s |
| **PREFIX Executions** | 0 | 10 | +10 |
| **STATIC_ONLY Actions** | 20 | 18 | -2 |
| **Emitted Sample Precision** | 100.0% | 100.0% | 0.0% |

---

## Ground Truth

The benchmark findings have been continuously tracked in `benchmarks/reviews/ground-truth.json`:

| Classification | Count | Status | Notes |
| :--- | :---: | :---: | :--- |
| **True Positives (TP)** | **9** | **Preserved** | All 9 confirmed True Positives in `vercel/commerce` (`components/cart/actions.ts` `updateItemQuantity`) remain fully detected. |
| **False Positives (FP)** | **9** | **Suppressed** | Phase 22 Route Handlers and client prop boundary warnings remain correctly filtered. |
| **Framework Artifacts** | **24** | **Suppressed** | Missing cloud SDK/singleton ReferenceErrors (`@upstash/`, `@ai-sdk/rsc`) remain strictly excluded. |
| **Unreachable Endpoints** | **1** | **Suppressed** | Playwright test helper remains excluded from production scan. |
| **Pending Review (NEEDS_REVIEW)** | **0** | **Clean** | Zero pending reviews; 100% of benchmark findings are categorized. |

Emitted benchmark precision on the active sample is **100.0%** (9 TP / 9 emitted findings).

---

## Interpretation

### What additional behavior became runtime-verifiable?
- **Server Action Prefix Slicing**: In `vercel/commerce`, Server Actions like `updateItemQuantity` and `addItem` previously could not be distinguished from monolithic actions that fail when unbundled. In Phase 25, SWC AST slicing isolates the statements preceding external module calls (`getCart`, `addToCart`).
- **Input Validation Defect Provenance**: For `updateItemQuantity`, SIS proved that the unhandled `TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined` occurs exclusively within statement 0 (line 61: `const { merchandiseId, quantity } = payload;`), verified by line-accurate prefix coordinates (`startLine: 61, endLine: 61, startColumn: 3, endColumn: 47`), terminating cleanly before the unsupported Shopify API dependency (`line 64`).
- **Deterministic Preludes**: In-memory `ReadonlyRequestCookies` and `Headers` stubs, along with control-flow-intercepting `redirect()` / `notFound()`, allow Server Actions that read cookies or headers or invoke Next.js navigation primitives to execute deterministically without artificial ReferenceErrors.

### Did precision change?
No. Precision remains **100.0%** over emitted findings on the pinned benchmark corpus.

### Did any previously suppressed artifact return?
No.
- Zero `ReferenceError: redis is not defined` returned.
- Zero `ReferenceError: createStreamableValue is not defined` returned.
- Zero Route Handler false positives returned.
- Zero test infrastructure artifacts returned.

### Did any existing True Positive disappear?
No. All 9 confirmed findings in `vercel/commerce` remain detected and verified.

### What remains unsupported?
- **Host Globals**: `process`, `require`, `fs`, `fetch`, `window`, `document`.
- **Cloud SDKs and Backend Infrastructure**: `@prisma/`, `@upstash/`, `@ai-sdk/`, `stripe`, `supabase`, `openai`, `mongodb`, `redis`, `@octokit/`.
- **Framework-Provided Form Payloads**: Actions accepting `FormData` parameter types require full browser/framework form dispatch and remain static-only.

---

## Limitations

1. **Prefix Boundary Granularity**: Prefix slicing operates at statement boundaries within the top-level block of the candidate function. Expressions containing embedded awaits or callbacks across unsupported boundaries terminate prefix execution before the entire containing statement.
2. **Deterministic Prelude Model**: Preludes provide clean in-memory representations (e.g. cookie key-value stores) rather than full Next.js HTTP request context or session cryptography.
3. **Execution Speed**: Selective prefix verification compiles candidate slices to ES2022 and runs isolated V8 sandboxes, introducing an ~8.9s wall-time delta across 3,804 analyzed files (38.65s vs 29.74s).
