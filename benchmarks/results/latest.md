# SIS Real-World Benchmark Report

Generated: 2026-09-14T18:26:50.753Z  
Corpus Version: `2.0.0`  
SIS Engine: `@aashirzayd/sis@0.1.0` (`52f313a`)

---

## 1. Environment & Configuration

| Parameter | Value |
| :--- | :--- |
| **Node.js Version** | `v24.19.0` |
| **Operating System** | `win32 (x64)` |
| **CPU Architecture** | `12th Gen Intel(R) Core(TM) i5-12450HX` |
| **Base Random Seed** | `42` (Deterministic FNV-1a derivation) |
| **Fuzz Runs Budget** | `10` runs per candidate action |
| **Isolate Timeout** | `20ms` CPU budget |

---

## 2. Evaluation Results by Repository

| Repository | Pinned Commit | Status | Files (Analyzed/Total) | Boundaries | Actions | Sandbox Compatible | Findings (T / S / E / TO) | Errors | Wall Time |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [**dubinc/dub**](https://github.com/dubinc/dub) | [`b8866f4`](https://github.com/dubinc/dub/tree/b8866f413cec065438d6e5faabbd9dac7d1ceea5) | ✓ Completed | 3421/4670 | 1587 | 11 | 0 | 0 (T:0 / S:0 / E:0 / TO:0) | 0 | 14.22s |
| [**leerob/site**](https://github.com/leerob/site) | [`fd03371`](https://github.com/leerob/site/tree/fd03371e3c90481a8447904e1b548e4c0327b7db) | ✓ Completed | 4/21 | 0 | 0 | 0 | 0 (T:0 / S:0 / E:0 / TO:0) | 0 | 2.15s |
| [**mickasmt/next-saas-stripe-starter**](https://github.com/mickasmt/next-saas-stripe-starter) | [`a78d130`](https://github.com/mickasmt/next-saas-stripe-starter/tree/a78d130af7e04d0250d65c67f217976f7eb3adc2) | ✓ Completed | 187/322 | 78 | 4 | 0 | 0 (T:0 / S:0 / E:0 / TO:0) | 0 | 3.17s |
| [**shadcn-ui/taxonomy**](https://github.com/shadcn-ui/taxonomy) | [`298a885`](https://github.com/shadcn-ui/taxonomy/tree/298a8857c7128a0d121e7f699dfd729f23b3966d) | ✓ Completed | 127/248 | 48 | 0 | 0 | 0 (T:0 / S:0 / E:0 / TO:0) | 0 | 2.88s |
| [**vercel/commerce**](https://github.com/vercel/commerce) | [`3761e52`](https://github.com/vercel/commerce/tree/3761e52e60df9c6a316e067dbfd7032e494d3634) | ✓ Completed | 65/101 | 17 | 5 | 0 | 9 (T:0 / S:0 / E:9 / TO:0) | 0 | 2.59s |
| **Total (5 repos)** | — | **5/5 pass** | **3804/5362** | **1730** | **20** | **0** | **9 (T:0 / S:0 / E:9 / TO:0)** | **0** | **25.01s** |

> **Legend**: **T** = Static Taint Violations (`SIS001`), **S** = React Flight Serialization Violations (`SIS002`), **E** = Runtime Exceptions (`SIS003`), **TO** = Execution Timeouts (`SIS004`).

---

## 3. Aggregate Summary & Findings Breakdown

| Finding Category | Diagnostic Code | Verified Occurrences | Verification Mechanism |
| :--- | :---: | :---: | :--- |
| **Secret Taint Leaks** | `SIS001` | 0 | Static Interprocedural Call-Graph Analysis |
| **Serialization Hazards** | `SIS002` | 0 | Static React Flight Serializability Modeling |
| **Runtime Exceptions** | `SIS003` | 9 | Dynamic V8 Isolate Verification + Delta-Debugging Shrink |
| **Isolate Timeouts** | `SIS004` | 0 | Enforced Execution Budget (20ms) |
| **Invariant Violations** | `SIS005` | 0 | Assertion & Contract Verification |
| **Total Findings** | — | **9** | Multi-Phase Integrated Pipeline |

---

## 4. Runtime Compatibility & Boundary Classification

SIS evaluates each discovered Server Action against its **Compatibility Gate**:
- **Sandbox-Compatible Candidates**: 0 actions were pure functions without host dependencies, successfully executed in zero-privilege `isolated-vm` V8 isolates.
- **Static-Only Framework Boundaries**: Actions requiring live Next.js request context (`cookies()`, `headers()`, `redirect()`, `notFound()`) or external database ORM connections were analyzed statically for taint and serializability contracts, while bypassing isolate execution to prevent artificial crashes.

---

## 5. Technical Limitations & Ground-Truth Disclaimer

> [!IMPORTANT]
> **Findings ≠ Confirmed Vulnerabilities**:
> 1. SIS identifies boundary invariants that fail under adversarial or unanticipated inputs (such as `null`, `undefined`, numeric extremes, non-serializable objects, or environment variable flows).
> 2. An unhandled `TypeError` or `RangeError` under an empty object or `NaN` indicates missing defensive validation at the public network boundary. It does not automatically imply a high-severity remote code execution or data breach.
> 3. True-positive and false-positive classifications require human code review of each application's intended business logic and upstream authentication middleware.
> 4. SIS does not emulate a live Next.js server or database connections; framework-dependent operations are classified as static-only.

---

## 6. Reproducibility & Ground-Truth Review

Deterministic seed derivation makes generated inputs reproducible under equivalent SIS, Node.js, and execution environments.

Every finding is assigned a stable 16-hex deterministic fingerprint based on repository, file path, line number, column, rule ID, and failure signature. Individual findings can be independently inspected and reproduced using:
```bash
npm run benchmark -- --reproduce <fingerprint>
```
