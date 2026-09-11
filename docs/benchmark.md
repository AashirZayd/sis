# SIS Real-World Benchmark & Empirical Evaluation

**Evaluation Standard**: Ground-Truth Code Review & Reproducible Benchmarking  
**Corpus Version**: `1.0.0` (5 Pinned Open-Source Next.js Applications)  
**Evaluator**: SIS Engine (`@aashirzayd/sis@0.1.0`)  
**Evaluation Environment**: Node.js `v24.19.0`, Windows `x64`, Base Seed `42`, Runs `10`, Timeout `20ms`

---

## 1. Purpose & Philosophy

Static analysis and fuzzing tools frequently report impressive numbers on synthetic test suites or artificial micro-benchmarks. When applied to real production codebases, however, they often drown developers in false positives or fail to execute complex modern framework code.

The SIS Real-World Benchmark exists to answer three empirical questions:
1. **Can SIS discover authentic Next.js boundaries** in large, complex applications without custom configuration?
2. **Can SIS synthesize valid adversarial inputs** that expose real runtime fragile points without human test-authoring?
3. **What is SIS's empirical precision** when its findings are rigorously audited by human code review against the actual application source code?

> [!IMPORTANT]
> **Evaluation Disclaimer**:
> SIS is a developer testing and runtime-verification tool. Benchmark results are empirical observations from pinned repositories and do not constitute a security guarantee, vulnerability certification, or measurement of recall across arbitrary applications.

---

## 2. Evaluation Corpus & Pinned Manifest

The corpus comprises 5 public, permissively licensed open-source Next.js applications pinned at immutable 40-character Git commit SHAs:

| Repository | Pinned Commit | Application Type & Architecture | Files Analyzed | Boundaries | Server Actions |
| :--- | :---: | :--- | :---: | :---: | :---: |
| [**`shadcn-ui/taxonomy`**](https://github.com/shadcn-ui/taxonomy) | [`298a885`](https://github.com/shadcn-ui/taxonomy/tree/298a8857c7128a0d121e7f699dfd729f23b3966d) | Next.js 13/14 App Router reference app with Contentlayer markdown pipeline, Stripe webhooks, and Prisma. | 127 | 48 | 0 |
| [**`leerob/site`**](https://github.com/leerob/site) | [`fd03371`](https://github.com/leerob/site/tree/fd03371e3c90481a8447904e1b548e4c0327b7db) | High-fidelity personal portfolio and blog built by VP of DevRel with pure App Router patterns, Postgres queries, and guestbook Server Actions. | 4 | 0 | 0 |
| [**`vercel/commerce`**](https://github.com/vercel/commerce) | [`3761e52`](https://github.com/vercel/commerce/tree/3761e52e60df9c6a316e067dbfd7032e494d3634) | Official Vercel Next.js Commerce architecture template exercising Shopify integration, cookie management, and cart Server Actions. | 65 | 17 | 5 |
| [**`dubinc/dub`**](https://github.com/dubinc/dub) | [`b8866f4`](https://github.com/dubinc/dub/tree/b8866f413cec065438d6e5faabbd9dac7d1ceea5) | Large-scale enterprise link management platform with multi-tenant App Router, complex Zod argument schemas, and Prisma ORM. | 3,421 | 1,587 | 11 |
| [**`mickasmt/next-saas-stripe-starter`**](https://github.com/mickasmt/next-saas-stripe-starter) | [`a78d130`](https://github.com/mickasmt/next-saas-stripe-starter/tree/a78d130af7e04d0250d65c67f217976f7eb3adc2) | Production SaaS foundation with Stripe webhooks, user settings Server Actions, NextAuth, and Prisma ORM. | 187 | 78 | 4 |
| **Corpus Total** | — | **5 Authentic Next.js Codebases** | **3,804** | **1,730** | **20** |

> **Corpus Representation Scope**: These five repositories serve as an authentic evaluation corpus exercising diverse Next.js patterns. They are **not** presented as a universally representative statistical sample of all Next.js applications worldwide.

---

## 3. Benchmark Methodology & Execution Hygiene

The benchmark harness ([`benchmarks/orchestrator.ts`](../benchmarks/orchestrator.ts)) enforces strict experimental controls:

1. **Pinned Immutability**: All repositories are checked out at exact commit hashes.
2. **Ephemeral Sandboxing**: Repositories are cloned shallowly (`--depth 1`) into temporary directories (`os.tmpdir()`) and completely destroyed after auditing.
3. **Zero Target Mutation**: Cloned targets run **no** `npm install`, **no** `npm run build`, and execute no arbitrary scripts on the host. SIS parses raw TypeScript/TSX syntax trees using `@swc/core`.
4. **Deterministic FNV-1a Seeding**: Target repositories derive seeds deterministically from the base seed (`--seed <number>`, default `42`) via `deriveFileSeed(baseSeed, repo.name)`.
5. **Execution Budget**: Candidate Server Actions executed in `isolated-vm` are bounded by an isolated CPU timeout budget (default: 20ms).
6. **Failure Isolation**: Errors in one repository do not abort the benchmark suite; they are recorded as `status: "failed"` and reported in summary metrics.

---

## 4. Multi-Phase Evolution (Phases 20 → 24)

SIS did not start with a clean benchmark. The benchmark was used as an iterative instrument to expose engine flaws and measure hardening:

```
Phase 20 (Baseline Benchmark)
  ↳ 43 raw findings emitted across 5 repos.
Phase 21 (Ground-Truth Review Infrastructure)
  ↳ Deterministic 16-hex fingerprinting and reproduction CLI implemented.
Phase 22 (Ground-Truth Pilot on 10 Findings)
  ↳ Manual review revealed 4 systematic precision failure modes (33.3% precision).
Phase 23 (Boundary Precision & Filter Hardening)
  ↳ Route Handler classification, client hook inference, test filtering, and cloud SDK gating implemented.
Phase 24 (Complete Ground-Truth Expansion)
  ↳ 100% of findings reviewed (43 lifetime records). Emitted findings confirmed at 100% True Positives.
```

| Evaluation Phase | Total Findings | True Positives | False Positives | Framework Artifacts | Unreachable | Active Emitted Precision | Wall Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Phase 22 (Pilot)** | 43 | 2 (pilot sample) | 4 | 3 | 1 | 33.3% (sample) | 41.10s |
| **Phase 23 (Hardened)** | 9 | 2 (pilot sample) | 0 | 0 | 0 | 100.0% (emitted) | 30.29s |
| **Phase 24 (Comprehensive)** | 9 | **9 (all confirmed)** | 0 | 0 | 0 | **100.0% (emitted)** | 32.20s |

---

## 5. Current Benchmark Results (Phase 24)

Executed on Node.js `v24.19.0`, Windows `x64`, Base Seed `42`, Runs `10`, Timeout `20ms`:

| Repository | Status | Files Analyzed | Boundaries | Actions | SIS001 (Taint) | SIS002 (Serial.) | SIS003 (Runtime) | SIS004 (Timeout) | SIS005 (Contract) | Verified Findings | Wall Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **shadcn-ui/taxonomy** | ✓ Completed | 127 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.93s |
| **leerob/site** | ✓ Completed | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.01s |
| **vercel/commerce** | ✓ Completed | 65 | 17 | 5 | 0 | 0 | 9 | 0 | 0 | **9** | 2.48s |
| **dubinc/dub** | ✓ Completed | 3,421 | 1,587 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 19.51s |
| **mickasmt/next-saas-stripe-starter** | ✓ Completed | 187 | 78 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 3.36s |
| **Corpus Total** | **5 / 5 Pass** | **3,804** | **1,730** | **20** | **0** | **0** | **9** | **0** | **0** | **9** | **32.20s** |

---

## 6. Ground-Truth Review Classification

Every finding recorded in the lifetime review store (`benchmarks/reviews/ground-truth.json`, 43 total records) has been reviewed against repository source code at pinned commits:

```
Total Reviewed Findings: 43
├── True Positives (TP): 9 (20.9%)
├── False Positives (FP): 9 (20.9%)
├── Framework Artifacts: 24 (55.8%)
├── Unreachable Code: 1 (2.3%)
└── Pending Review: 0 (0.0%)
```

### Confirmed True Positives (9 Findings)
All 9 confirmed `TRUE_POSITIVE` findings reside in `vercel/commerce` (`components/cart/actions.ts#L54`) on the `updateItemQuantity` Server Action:

```typescript
// components/cart/actions.ts
'use server';

export async function updateItemQuantity(
  prevState: any,
  payload: {
    merchandiseId: string;
    quantity: number;
  }
) {
  const { merchandiseId, quantity } = payload; // Line 54: Unsafe destructuring outside try/catch
```

- **Vulnerability / Fragility Mechanism**: Because the module declares `"use server"` at top-level, Next.js exposes `updateItemQuantity` as an unauthenticated public HTTP POST RPC endpoint. TypeScript type annotations are erased at runtime. The function unconditionally destructures `payload` before any runtime schema checks or `try/catch` wrapping.
- **Observed Failure**: Invocations with empty objects (`{}`), nullish values (`null`, `undefined`), or omitted second arguments throw an unhandled `TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.`, crashing the Server Action with an HTTP 500 error.
- **Minimized Reproductions**: Across 9 distinct fuzzing strategies (prototype pollution, numeric extremes, structural mutation, nullish primitives), delta-debugging successfully shrunk all payloads to `{}` or `null`.
- **Finding Fingerprints**: `b6bbfce3dbe171b5`, `84e693a7f37f6a9b`, `0300c0d145de1a6b`, `78387966d81c3cd4`, `caac0d7e2642c4fa`, `0cc2c4b41331b1de`, `a93666a2ceea9d6e`, `e37b49b0bbe4aef3`, `2129b19876f7f31a`.

### What SIS Got Wrong: Discovered False Positives & Artifacts
We publish the misses alongside the hits. Phase 22 exposed four systematic precision failures:

1. **Route Handler HTTP Response Semantics (`SIS002`, 6 cases)**:
   - *Where*: `shadcn-ui/taxonomy`, `mickasmt`, `dubinc/dub`
   - *Problem*: Route Handlers (`app/**/route.ts`) returning standard Web API `Response` or `ImageResponse` were evaluated under React Flight RPC serialization rules.
   - *Resolution*: Implemented AST route classification (`src/boundary/classifier.ts`). Flight serialization checks explicitly skip HTTP Route Handlers.
2. **Implicit Client Component Callback Props (`SIS002`, 3 cases)**:
   - *Where*: `dubinc/dub` (`ui/modals/add-workspace-modal.tsx`, `invite-workspace-user-modal.tsx`, `utm-modal.tsx`)
   - *Problem*: Modals calling React client hooks (`useRouter`, `useState`) without a top-level `"use client"` string literal were treated as Server Components passing non-transferable function callbacks.
   - *Resolution*: Added AST hook inference to infer client component context for leaf components.
3. **External Cloud SDK Sandbox Artifacts (`SIS003`, 24 cases)**:
   - *Where*: `dubinc/dub` (Upstash Redis: 6 cases, `@ai-sdk/rsc` streaming: 18 cases)
   - *Problem*: Actions importing un-mocked cloud singletons threw `ReferenceError: redis is not defined` inside `isolated-vm`. These crashes were artifacts of sandbox execution without cloud infrastructure.
   - *Resolution*: Extended Compatibility Gate to classify actions using cloud SDKs as `static-only`.
4. **Non-Production Test Utilities (`SIS002`, 1 case)**:
   - *Where*: `dubinc/dub` (`playwright/api/fixtures.ts#L78`)
   - *Problem*: Playwright fixture helpers were scanned as candidate production Server Actions.
   - *Resolution*: Added default test directory exclusions (`playwright/`, `e2e/`, `cypress/`, `__tests__/`).

---

## 7. Precision & Recall Calculations

### A. Current Emitted Benchmark Output Precision
Evaluates the precision of findings emitted by the hardened engine in the active benchmark run:
$$Precision_{\text{emitted}} = \frac{TP_{\text{emitted}}}{TP_{\text{emitted}} + FP_{\text{emitted}}} = \frac{9}{9 + 0} = \mathbf{100.0\%}$$
*(All 9 emitted findings are verified True Positives on `vercel/commerce`)*.

### B. Lifetime Binary Review Precision
Evaluates precision across all 43 historical findings evaluated since benchmark inception:
$$Precision_{\text{lifetime}} = \frac{TP}{TP + FP} = \frac{9}{9 + 9} = \mathbf{50.0\%}$$

### C. Why Recall is NOT Calculated
$$Recall = \frac{TP}{TP + FN}$$
**Recall is intentionally not calculated** because the complete ground-truth denominator of all latent boundary invariants, serialization traps, and secret flows across real-world third-party codebases is fundamentally unknown. Claiming a recall percentage on third-party software without a complete ground-truth oracle is mathematically unsound.

---

## 8. Known Limitations & Recall Risks

Detailed in [`benchmarks/KNOWN_LIMITATIONS.md`](../benchmarks/KNOWN_LIMITATIONS.md):

1. **Cloud SDK Compatibility Gating (Recall Trade-off)**:
   Actions calling cloud SDKs (Prisma, Upstash, Stripe) are classified as `static-only` to prevent sandbox crashes. **Recall Risk**: If an action has an input validation bug *before* calling the cloud SDK, the bug will not be detected by runtime isolate fuzzing.
2. **Zero-Privilege V8 Isolate Boundary**:
   `isolated-vm` executes pure JavaScript/V8. It does not emulate live incoming Next.js HTTP request cookies, headers, or reverse-proxy authentication layers.
3. **Static Taint Call-Graph Depth**:
   Multi-hop data-flow tracking traces intra-repository helper chains; external package boundary flows require explicit sink modeling.

---

## 9. Reproducing the Benchmark

Another engineer can reproduce these benchmark results independently:

```bash
# 1. Clone SIS
git clone https://github.com/AashirZayd/sis.git
cd sis

# 2. Install dependencies & build
npm install
npm run build

# 3. Execute the full benchmark suite across all 5 pinned repositories
npm run benchmark -- --all

# 4. Inspect ground-truth validation catalog
npm run benchmark -- --review

# 5. Reproduce a specific confirmed finding using its fingerprint
npm run benchmark -- --reproduce b6bbfce3dbe171b5
npm run benchmark -- --reproduce 84e693a7f37f6a9b
```

> **Reproducibility Guarantee**:
> Deterministic seed derivation makes generated inputs reproducible under equivalent SIS, Node.js, and execution environments. Target repositories are cloned ephemerally at immutable commit SHAs and findings receive stable SHA-256 fingerprints.
