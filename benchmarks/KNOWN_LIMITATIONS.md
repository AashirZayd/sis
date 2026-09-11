# Known Limitations & Evaluation Boundaries

This document formalizes the architectural boundaries, evaluation limitations, and interpretation rules for the SIS real-world benchmark suite.

---

## 1. Benchmark Metrics Are Not Vulnerability Counts

> [!CAUTION]
> **Do not cite SIS benchmark findings as "vulnerabilities discovered" or "security flaws".**

SIS measures **boundary invariant violations**, specifically:
- **`SIS001` (Secret Taint Leak)**: A sensitive environment variable (`*_SECRET`, `*_KEY`) statically flows across a Client Component boundary or into a JSX prop sink.
- **`SIS002` (Serialization Violation)**: An un-serializable value (e.g. closure, class instance, unregistered symbol) is passed across a React Flight boundary.
- **`SIS003` (Runtime Exception)**: A candidate Server Action threw an unhandled runtime error (e.g., `TypeError`, `RangeError`) when supplied with an unanticipated boundary input (`null`, `undefined`, numeric hazard, prototype pollution key).
- **`SIS004` (Timeout)**: An action exceeded its isolate CPU execution budget (default: 20ms).
- **`SIS005` (Invariant Violation)**: A boundary assertion was violated during execution.

### Why an Invariant Violation is Not Automatically a CVE
1. **Defensive Programming vs Exploitation**: A Server Action that throws `TypeError: Cannot read properties of undefined (reading 'email')` when receiving `{}` has a validation gap at its network boundary. However, if that action is only called from an authenticated session behind a reverse proxy that guarantees payload structure, the finding is an operational fragility rather than a critical vulnerability.
2. **Upstream Schema Guards**: Applications using external middleware or reverse proxies (e.g. Cloudflare WAF, Next.js middleware checking cookies) may filter payloads before they reach the Server Action. SIS evaluates the Server Action boundary in isolation.
3. **Intentional Error Throwing**: Some actions intentionally throw errors (or `throw new Error("Invalid request")`) to signal invalid input to client form handlers. When such errors are thrown without custom error wrapping, SIS registers them as unhandled runtime exceptions.

---

## 2. Sandbox Constraints: `isolated-vm` vs Full Next.js Runtime

SIS deliberately executes pure logic inside zero-privilege V8 isolates via `isolated-vm` rather than spawning a mock Next.js server or container:

| Feature | `isolated-vm` Sandbox | Full Next.js Server |
| :--- | :--- | :--- |
| **Execution Isolation** | Pure V8 isolate; no `process`, `fs`, `fetch`, or host memory | Full Node.js host process with system access |
| **Execution Speed** | Sub-millisecond execution and delta-debugging | Multiple seconds per request, high memory overhead |
| **Host Safety** | Immune to host tampering or side-effects during fuzzing | Potentially executes destructive operations against host |
| **Framework Globals** | **Static-Only**: skips live `cookies()`, `headers()`, `redirect()` | Provides full Next.js request context and cookies |
| **Database Connections** | **Static-Only**: skips live Prisma, Drizzle, or raw SQL queries | Connects to live database or requires complex mocks |

### The Compatibility Gate
Because SIS does not connect to live databases or emulate live Next.js request headers:
- Actions that call `cookies()`, `headers()`, `redirect()`, `notFound()`, or external database ORMs are classified as **`static-only`**.
- `static-only` actions are inspected statically for secret taint and return-type serializability, but **bypassed from isolate fuzzing** to eliminate artificial crashes.
- Therefore, in real-world codebases with heavy database calls directly inside Server Actions, the number of `sandbox-compatible` actions is naturally a subset of all discovered actions.

---

## 3. Conservative Filters & Recall Risk Analysis

Phase 23 introduced conservative filters to eliminate false positives and sandbox artifacts. While these filters successfully raised active benchmark precision to 100%, **precision hardening carries inherent recall risks**. Each filter's scope, rationale, and associated recall trade-off is documented below:

| Filter Mechanism | Scope Excluded | Rationale | Potential Legitimate Behavior Missed (Recall Risk) | Opt-in / Bypass Path | Conservatism Rating |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Default Test-Directory Filtering** | `playwright/`, `e2e/`, `cypress/`, `__tests__/`, `test/`, `*.test.*`, `*.spec.*` | Test helpers and fixtures are never deployed to client-facing routes. Flagging test utilities as production security/serialization flaws produces developer noise. | If an application mistakenly co-locates production Server Actions inside a test folder, or if a shared utility in `test/` leaks live production secrets. | `--include-tests` CLI option or directly auditing the file as a single-file target (`sis path/to/file.ts`). | **Conservative** (standard static analysis practice) |
| **Route Handler HTTP Response Exemption** | `app/**/route.ts` and `app/**/route.tsx` returning Web API `Response` / `ImageResponse` | Next.js App Router Route Handlers communicate via standard HTTP. React Flight RPC serialization constraints only apply to React Server Actions and Server-to-Client component props. | Route Handlers returning unhandled exceptions or leaking secrets in JSON responses are not affected by this exemption (taint analysis `SIS001` remains active). Flight serialization violations (`SIS002`) are intentionally skipped. | Single-file audits continue to inspect AST data flows. | **Conservative** (strictly follows Next.js App Router specification) |
| **Client Component Hook Inference** | Components using React client hooks (`useState`, `useRouter`, etc.) without an explicit `"use client"` directive | Leaf components imported by a Client Component operate in client context. Enforcing Flight function prop rules on these components produces false positives on ordinary callback props. | If an actual Server Component calls a client hook that Next.js will reject during build, or if a Server Component imports a function that shares the same name as a client hook. | Full AST module graph traversal; explicit `"use server"` directive overrides hook inference. | **Conservative** (aligns with Next.js client component tree semantics) |
| **Cloud SDK Compatibility Gating** | Actions importing known cloud database ORMs (Prisma, Drizzle, Mongo) or cloud SDKs (Upstash, AI SDK, Stripe, Supabase) | In zero-privilege V8 isolates without network access or live databases, invoking cloud singletons throws immediate `ReferenceError`. These are sandbox environment artifacts. | **PRIMARY RECALL RISK**: If a Server Action calls a cloud SDK *later* in its body, but performs faulty input validation or parameter destructuring *earlier* in its body, classifying the action as `static-only` skips isolate fuzzing, and the pre-SDK input validation flaw will not be detected dynamically. | Static taint (`SIS001`) and static return serialization (`SIS002`) remain fully active on `static-only` actions. | **Aggressive for runtime fuzzing** (prioritizes zero false positives over finding yield in cloud-connected actions) |
| **Static-Only Host Global Classification** | Actions referencing `cookies()`, `headers()`, `redirect()`, `notFound()`, `revalidatePath()` | `isolated-vm` does not emulate Next.js incoming HTTP request headers or cookies. Executing them causes synthetic environment crashes. | **RECALL RISK**: An action utilizing `cookies()` that ALSO possesses an unhandled input handling bug (e.g. prototype pollution or null dereference) is marked `static-only` and not fuzzed in the isolate. | Static taint analysis and boundary type checks remain active. | **Conservative for host safety** |

> [!IMPORTANT]
> **Precision Improvements Do Not Imply Recall Preservation**:
> Eliminating false positives through static-only gating reduces noise, but necessarily bounds the dynamic verification envelope to actions that are self-contained or whose dependencies can be evaluated in an isolated V8 environment.

---

## 4. What is NOT Measured by the Benchmark

The SIS benchmark suite explicitly does not evaluate:
1. **Authentication & Authorization Logic**: Whether a user has proper permissions to execute an action (e.g. IDOR, RBAC).
2. **SQL Injection through ORMs**: Complex query injection through ORM query builders.
3. **Client-Side Hydration Mismatches**: Runtime DOM mismatches between server-rendered HTML and client React hydration.
4. **Third-Party Service Dependencies**: Network calls to external APIs (Stripe, GitHub, AWS) that fail when disconnected from the internet.

---

## 5. Benchmark Reproducibility

Deterministic seed derivation makes generated inputs reproducible under equivalent SIS, Node.js, and execution environments:
- **Pinned Git Commits**: All target repositories in `corpus.json` specify exact 40-character commit hashes.
- **Deterministic FNV-1a Seeding**: Target repositories derive seeds deterministically from the base seed (`--seed <number>`, default `42`).
- **Lexicographical Traversal**: Source files are discovered and analyzed in strict lexicographical order, independent of the underlying operating system's filesystem directory order.
- **Zero Host Mutation**: Benchmark runs make zero modifications to target repositories or the SIS repository.

---

## 6. Ground-Truth Validation: Detection vs Verification vs Truth

To ensure scientific rigor, SIS explicitly distinguishes three stages of evaluation:

1. **Static Detection**: Syntax patterns and AST data flows flagged in source code (e.g. environment secret flows, exported action declarations).
2. **Runtime Verification**: Invariants dynamically executed and verified in zero-privilege V8 isolates (e.g., action threw unhandled `TypeError` on empty object input).
3. **Ground-Truth Validation**: Manual human code review determining whether the invariant failure represents a genuine defect, missing input validation, intentional design, or harmless behavior.

### Critical Clarifications:
- A **verified finding** currently means SIS reproduced the relevant invariant failure according to its execution model.
- It does **NOT** automatically mean:
  - A confirmed security vulnerability
  - An exploitable vulnerability
  - A CVE
  - A confirmed production defect
- Manual review is required to establish benchmark **precision** ($TP / (TP + FP)$).
- **Recall is intentionally NOT calculated** because the complete ground-truth set of all actual invariant violations, boundary hazards, and secret flows across large third-party codebases cannot be known.

---

## 7. Contributing to the Corpus

To propose a new open-source repository for inclusion in `benchmarks/corpus.json`:
1. The repository must be public and permissively licensed (MIT, Apache 2.0, BSD).
2. The repository must make meaningful use of Next.js App Router, Server Actions, or React Server Components.
3. The commit SHA must be pinned to a stable release or specific commit.
4. Open a pull request with the updated `corpus.json` and selection rationale.

