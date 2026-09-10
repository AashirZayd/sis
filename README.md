# SIS

**Speculative Invariant Synthesis**

> Autonomous runtime verification for Next.js boundaries.

SIS is a zero-configuration developer tool and compiler-level verification engine designed for modern Next.js App Router and React Server Components (RSC) codebases. It identifies Server/Client boundaries, tracks secret flows across component boundaries, synthesizes adversarial inputs, and verifies runtime invariants inside an isolated execution environment.

---

## Architectural Pipeline

```text
SOURCE CODE
    ↓
PROJECT DISCOVERY
    ↓
SWC AST ANALYSIS
    ↓
SERVER/CLIENT BOUNDARY DISCOVERY
    ↓
SECRET TAINT ANALYSIS
    ↓
SERVER ACTION DISCOVERY
    ↓
ADVERSARIAL PAYLOAD SYNTHESIS
    ↓
SANDBOX-COMPATIBLE RUNTIME EXECUTION
    ↓
INVARIANT VERIFICATION
    ↓
FAILURE SHRINKING
    ↓
MINIMAL REPRODUCTION
    ↓
DEVELOPER-FRIENDLY REPORT
```

---

## Usage

```bash
# Audit the entire Next.js repository (recursive discovery)
npx sis audit .

# Generate machine-readable JSON output (Version 1 schema)
npx sis audit . --json > sis-report.json
npx sis audit . --format json > sis-report.json

# Generate OASIS SARIF 2.1.0 output for CI/CD and security scanners
npx sis audit . --sarif > sis-results.sarif
npx sis audit . --format sarif > sis-results.sarif

# Run silently (no terminal UI, preserves exit code and machine-readable stdout)
npx sis audit . --silent
npx sis audit . --json --silent > report.json

# Audit with custom fuzzing runs, deterministic base seed, and execution timeout
npx sis audit . --runs 25 --seed 42 --timeout 20

# Configure maximum call-depth for interprocedural data-flow analysis
npx sis audit . --max-analysis-depth 10

# Ignore custom folders in addition to standard defaults
npx sis audit . --ignore e2e tests/fixtures

# Audit an individual Server Action or client component file
npx sis audit ./app/actions/transfer.ts
npx sis audit ./app/components/ProfileCard.tsx

# Disable automatic failure shrinking or adjust max attempts
npx sis audit . --no-shrink
npx sis audit . --max-shrink-attempts 50
```

### Exit Code Contract

SIS provides deterministic, standardized process exit codes for integration into CI/CD pipelines and developer tooling:

| Exit Code | Meaning | Description |
| :---: | :--- | :--- |
| `0` | **Success / Clean** | Audit completed successfully with zero actionable findings or invariant violations. |
| `1` | **Violations Detected** | Audit completed and actionable findings (taint leaks, runtime exceptions, timeouts, serialization errors) were detected. |
| `2` | **Usage / Config / Input Error** | Target path not found, invalid numeric option (e.g. `--runs <= 0`), conflicting output flags (`--json` and `--sarif`), or malformed invocation. |
| `3` | **Internal Execution Error** | Unexpected internal executor or isolate failure. |
| `130` | **Interrupted** | Process cleanly terminated by user (`SIGINT` / `Ctrl+C`). |


### Directory Audit Example

Running SIS against a repository automatically discovers all relevant source files (`.ts`, `.tsx`, `.js`, `.jsx`), filters out dependencies and build artifacts (`node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`), and executes isolated static and dynamic checks across all boundaries:

```text
$ npx sis audit .
SIS  Speculative Invariant Synthesis
Autonomous runtime verification for Next.js boundaries

Scanning 147 source files...

◆ DISCOVERY
  ✓ 18 server boundaries
  ✓ 4 client boundaries
  ✓ 31 candidate Server Actions

◆ TAINT ANALYSIS
  ✖ 2 high-confidence secret flows

    process.env.PRIVATE_API_KEY
      → secret
      → JSX expression
    components/UserProfile.tsx:14

◆ PAYLOAD SYNTHESIS
  ✓ 1,240 adversarial payloads

◆ RUNTIME VERIFICATION
  ✓ 1,137 passed
  ✖ 41 failed
  ⊘ 62 unsupported

  ✖ riskyTransfer
    Payload #4
    Input: null
    TypeError: Cannot read properties of null (reading 'amount')
    app/actions/transfer.ts:18

◆ FAILURE SHRINKING
  ✓ 41 failures reduced

  ✖ riskyTransfer
    Original: { metadata: { client: "web" }, amount: null }
    Minimal reproducer: { amount: null }
    Attempts: 2
    Reduction: 74.2%
    Verification: ✓ failure preserved

────────────────────────────────────────
AUDIT COMPLETE
  Files analyzed:        147
  Server boundaries:      18
  Candidate actions:      31
  Runtime failures:       41
  Taint violations:        2
  Analysis errors:         0

✖ SIS found 43 verified findings
────────────────────────────────────────
```

### Failure Shrinking Example

When runtime verification discovers a failing adversarial payload, SIS automatically invokes its failure-preserving shrinking engine. It systematically reduces strings, numbers, arrays, and objects using delta debugging to find the smallest reproducible input that triggers the identical error signature:

```typescript
"use server";

export async function processNestedConfig(payload: any) {
  if (typeof payload.user.profile.settings.theme.primary !== "string") {
    throw new TypeError("Invalid theme primary color");
  }
  return { success: true };
}
```

```text
◆ FAILURE SHRINKING

  ✖ processNestedConfig
    Original: { user: { profile: { settings: { theme: { primary: 123, font: "sans" } } } }, extra: [1, 2, 3] }
    Minimal reproducer: { user: { profile: { settings: { theme: { primary: 0 } } } } }
    Attempts: 4
    Reduction: 68.5%
    Verification: ✓ failure preserved
```

### Isolated Runtime Execution Example

When candidate Server Actions (`"use server"`) are detected, SIS synthesizes adversarial payloads and executes sandbox-compatible candidates inside a secure, zero-privilege `isolated-vm` V8 isolate with a 20ms execution budget:

```typescript
"use server";

export async function executeTransfer(payload: { amount: number }) {
  return payload.amount.toFixed(2);
}
```

```text
◆ RUNTIME VERIFICATION

  Executed 23 transferable payloads
  Unsupported 2
  Passed 2
  Failed 21

  ✖ executeTransfer
    Payload #1
    Category: numeric-extreme
    Input: -Infinity

    TypeError: Cannot read properties of undefined (reading 'toFixed')
    ./test/fixtures/payload-fragile-action.ts:3

    Execution: 3ms / 20ms budget
    Wall time: 8ms

  ✖ executeTransfer
    Payload #22
    Category: nullish
    Input: null

    TypeError: Cannot read properties of null (reading 'amount')
    ./test/fixtures/payload-fragile-action.ts:3

    Execution: 2ms / 20ms budget
    Wall time: 6ms
```

> **Timeout & Execution Semantics**:
> SIS applies the `--timeout` value as a per-payload candidate execution budget inside the isolated V8 context. Isolate startup, payload preparation, and teardown are outside this budget, so total wall-clock time may exceed the configured execution timeout.
>
> For example, `--timeout 20` means:
> * **Candidate execution budget**: 20ms (strictly enforced inside the isolate)
> * **Total wall-clock observation**: ~25–30ms (including V8 isolate spinup, context creation, and teardown)

> **Important Guarantee**:
> SIS currently verifies sandbox-compatible Server Action candidates. It does not recreate the full Next.js runtime and therefore does not claim to execute every real-world Server Action. Actions relying on external database connections, complex framework imports, or host globals are conservatively classified as `static-only`.

### Static Taint Analysis Example

SIS tracks AST-level data flows from sensitive server environment variables into `"use client"` boundaries:

```tsx
"use client";

const secret = process.env.PRIVATE_API_KEY;
const value = secret;

export function Profile() {
  return <div>{value}</div>;
}
```

```text
◆ TAINT ANALYSIS
  ✖ 1 sensitive value reaches client boundary

    process.env.PRIVATE_API_KEY
      → secret
      → value
      → JSX expression

  ./app/components/Profile.tsx:7
```

### GitHub Actions CI / CodeQL SARIF Integration

Integrate SIS into GitHub Actions to automatically verify Next.js App Router boundaries on every pull request and upload findings directly to GitHub Security / Code Scanning:

```yaml
name: SIS Security Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run SIS Audit (SARIF)
        run: npx sis audit . --format sarif > sis-results.sarif
        continue-on-error: true

      - name: Upload SARIF report to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: sis-results.sarif
```

---

### Performance Controls & Fuzz Budget Semantics

SIS is engineered for deterministic, predictable scaling across projects with dozens or hundreds of candidate actions:

* **Per-Target Budget Allocation (`--runs <n>`)**:
  The `--runs` option (default: `10`) configures the **per-candidate action fuzzing quota**, *not* a flat global pool. For a project with $T$ discovered candidate Server Actions, SIS synthesizes up to $T \times N$ adversarial payloads. Each candidate target receives proportional exploration across structural object mutations, numeric extremes, string hazards, nullish inputs, and wire serialization traps without risk of combinatorial explosion ($O(T \cdot N)$ rather than $O(T \cdot N \cdot S)$).
* **Deterministic Pseudo-Random Seed (`--seed <number>`)**:
  Specifying `--seed` (default: `Date.now()`) seeds both directory traversal hashing (FNV-1a per-file seeds) and the underlying `fast-check` generator. Given the same source code, configuration, and seed, SIS produces 100% deterministic, byte-for-byte identical findings, reproducer payloads, and failure signatures across runs.
* **Isolate Execution Budget (`--timeout <ms>`)**:
  Enforces a strict execution deadline (default: `20ms`) strictly on **candidate JavaScript execution inside the V8 isolate**. Host-side compilation, AST parsing, payload preparation, and isolate spinup/teardown do not deplete the candidate's execution budget.
* **Failure Shrinking Bounds (`--max-shrink-attempts <n>`, `--no-shrink`)**:
  Limits the maximum delta-reduction iterations per failing candidate (default: `30`) to guarantee deterministic bounded runtime overhead.

---

## Real-World Validation

SIS is hardened and continuously verified against realistic, messy, and adversarial Next.js App Router patterns across dedicated fixture suites in `test/fixtures/real-world/`:

* **Nested Boundaries**: Deeply composed Client and Server Components (`"use client"`, `"use server"`, inline Server Actions, and shared helper utilities) verified without false positives or lost candidate actions.
* **Complex Interprocedural Data-Flow**: Multi-hop taint propagation tracing sensitive server-side configuration across modular helper chains (`config.ts` → `session.ts` → `user.ts` → `page.tsx`) into client component JSX sinks.
* **React Flight Serialization**: Accurate classification of Flight-compatible props (primitives, `Date`, `Map`, `Set`, typed arrays) versus non-serializable values (event handlers, functions without `'use server'`, custom class instances, and database handles).
* **Taint & Serialization Boundary Interaction**: Distinct reporting of secret leakage (`SIS001`) and non-serializable values (`SIS002`) crossing the exact same component prop boundary without collapsing or masking either violation.
* **Complex Destructuring**: Nested object destructuring, aliased properties, defaults, and tuple/array unpacking under synthesized adversarial inputs, driving minimal reproducer shrinking.
* **Import Resolution Edge Cases**: Extensionless imports, `.js` specifiers resolving to `.ts`/`.tsx` sources, directory `index.ts` resolution, and resilience against unresolvable external module imports.
* **Framework Dependencies & Static-Only Classification**: Robust isolation identifying framework APIs (`prisma`, `cookies()`, `headers()`, `redirect()`, `notFound()`, `revalidatePath()`) and classifying them as `static-only` while safely verifying self-contained actions in `isolated-vm`.
* **Runtime Hazards**: Hard execution timeout budgets (`--timeout`) enforcing termination on infinite loops, and graceful containment of deep recursion stack exhaustion (`RangeError`).
* **Noise & False-Positive Elimination**: Zero false alarms on public environment variables (`NEXT_PUBLIC_*`), server-internal helper routines, and serializable standard objects.
* **Deterministic Fuzzing & Budget Scaling**: Predictable linear budget scaling under high action density (25+ actions) and deterministic finding reproducibility across runs (`--seed`).
* **Schema-Compliant Output Purity**: Strict validation ensuring clean stdout emission of Version 1 JSON and OASIS SARIF 2.1.0 formats even on complex adversarial projects.

---

## Status & Roadmap

SIS is being developed across rigorous, incremental phases. We prioritize correctness over simulated behavior: if an invariant cannot be safely verified at runtime, it is explicitly classified as static-only.

### Implemented

- [x] **Phase 1 — Foundation & CLI Shell**: Production CLI executable built on Commander with Node.js >=18 and strict ESM. High-contrast terminal presentation layer (`◇`, `◆`, `⟳`, `⚡`, `✂`, `✓`, `✖`, `⚠`). Core contracts for `Boundary`, `ServerAction`, `Finding`, and `AuditResult`.
- [x] **Phase 2 — SWC AST Parser & Boundary Discovery**: Compiler-grade AST parsing using `@swc/core` for TypeScript and TSX. Accurate discovery of prologue directives (`"use client"`, `"use server"`), zero-copy source location mapping (`file:line:col`), candidate Server Action detection (`export async function`, `export const fn = async () => {}`, named export declarations), and clean compiler diagnostics on syntax errors (`ParserError`).
- [x] **Phase 3 — Static Taint Analysis**: AST-driven data-flow tracking for sensitive environment variables (`*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_PRIVATE_KEY`, `*_API_KEY`, `PRIVATE_*`, `SECRET_*`) propagating across direct assignments, variable reassignments, object properties, nested objects, array elements, and template literal interpolations into `"use client"` boundaries. Strict exclusion of public environment variables (`NEXT_PUBLIC_*`).
- [x] **Phase 4 — Property-Based Payload Synthesis**: Adversarial input synthesis for candidate Server Actions powered by `fast-check`. Features 7 specialized failure-inducing categories (`nullish`, `empty`, `numeric-extreme`, `prototype-sensitive`, `deep-nested`, `serialization-trap`, `primitive-mismatch`), recursion-depth bounding (depth <= 5), deterministic PRNG seed configuration (`--seed`), and safe terminal representation of unprintable, circular, and exotic values.
- [x] **Phase 5 — Isolated Runtime Execution**: Bounded, secure execution of sandbox-compatible candidate Server Actions against synthesized payloads inside a controlled `isolated-vm` V8 isolate. Enforces hard execution deadlines (default 20ms, `--timeout`), non-mutating transfer compatibility checks, strict host isolation (no `process`, `require`, `fs`, `fetch`, or env vars), deterministic failure detection (`runtime-exception`, `timeout`), and clean distinction between transferable, unsupported, and static-only candidates.
- [x] **Phase 6 — Failure Shrinking / Minimal Reproduction Synthesis**: Delta-debugging and structural shrinking engine that reduces complex failing payloads to minimal reproducers while strictly preserving failure signatures (action name + status + error name + normalized message pattern). Enforces per-candidate attempt budgets (default: 30, `--max-shrink-attempts`), executes all shrink iterations in isolated V8 sandboxes, and verifies the minimal reproducer prior to reporting with automatic fallback to original payload.
- [x] **Phase 7 — Directory-Wide Auditing & Production CLI Experience**: Recursive directory discovery, default exclusion filters (`node_modules`, `.next`, `dist`, `build`, `coverage`, `.git`), deterministic lexicographical ordering, FNV-1a per-file seed derivation, per-file isolation (one broken file does not halt the audit), POSIX-normalized cross-platform paths, and production CLI exit codes (`0` clean, `1` verified findings, `2` fatal CLI errors).
- [x] **Phase 8 — Machine-Readable Results, JSON & SARIF**: Dual machine-readable output formats (`--format json`, `--format sarif`), deterministic Version 1 JSON schema, OASIS SARIF 2.1.0 specification compliance, stable rule catalog (`SIS001` - `SIS005`), structured serialization preserving exotic JavaScript values (`undefined`, `NaN`, `Infinity`, `BigInt`, circular references), strict `stdout` purity, and seamless GitHub Actions Code Scanning integration.
- [x] **Phase 9 — Interprocedural Data-Flow & Boundary Analysis**: Bounded, conservative local call-graph and module-graph analysis tracking sensitive server environment data through multi-hop helper functions, arguments, return values, structured object properties, array elements, destructuring, and template literals into `"use client"` component boundaries and Server Action returns. Cycle-safe recursion bounding (`--max-analysis-depth`).
- [x] **Phase 10 — Next.js-Aware Boundary Semantics**: Fine-grained Next.js App Router and React Server Components (RSC) boundary modeling:
  - **Boundary Classification**: Distinguishes `client-module`, `server-module`, `server-component`, `server-action`, `server-function`, `candidate-server-function`, and `server-to-client-props`.
  - **Function-Level "use server"**: Identifies inline directive prologues in function declarations, function expressions, and arrow functions with strict directive prologue correctness.
  - **Server Action Confidence**: Differentiates `definite` (directive-marked), `candidate` (async server exports), and `ordinary` server functions.
  - **React Flight Serializability**: Evaluates serializability of props crossing from Server Components into Client Components (`<ClientComponent prop={value} />`) and Server Action return values. Supports primitives, `Date`, `Map`, `Set`, `ArrayBuffer`, typed arrays, plain objects, arrays, JSX elements, and Server Functions; rejects unmarked function callbacks, custom class instances, database handles, and unregistered Symbols (`SIS002: serialization-violation`).
  - **Runtime vs Static-Only Distinction**: Identifies framework-dependent actions (ORM, database queries, Next.js server APIs like `cookies()`, `headers()`, `redirect()`) and marks them as `static-only`, executing only self-contained actions in `isolated-vm`.
- [x] **Phase 11 — Boundary-Aware Speculative Fuzzing**: Directed adversarial input generation and invariant verification guided by boundary contracts:
  - **AST-Driven Shape Inference**: Infers parameter and return shapes from TypeScript type annotations (`TsTypeLiteral`, `TsKeywordType`, `TsArrayType`, `TsUnionType`), destructuring patterns, default argument values, and function body property and method usage heuristics.
  - **Targeted Mutation Strategies**: Systematically mutates boundaries based on target contracts: numbers (extremes, `NaN`, `-0`, `Infinity`, precision loss), strings (null byte `\0`, whitespace hazards, control chars, long strings), booleans, and structural objects (property deletion, empty structures, null property values, and prototype pollution keys `__proto__`, `constructor`, `prototype`).
  - **React Flight & Wire Serialization Traps**: Synthesizes classified serialization traps (unregistered `Symbol()`, custom class instances, unmarked closure functions, cyclic references, BigInt boundaries) to verify Flight protocol resilience across Client/Server boundaries.
  - **Deterministic Budgeting Algorithm**: Proportional budget distribution across discovered targets with clamped per-target quotas and seeded permutation to prevent single-target dominance and Cartesian explosion.
  - **Isolated Execution & Minimal Reproduction**: Executes sandbox-compatible candidates in `isolated-vm` within runtime budgets, capturing failure signatures and automatically reducing failing payloads to minimal reproducers.
  - **Richer Metadata Reporting**: Terminal, JSON, and SARIF 2.1.0 outputs enriched with `fuzzTarget`, `strategy`, `invariant`, and `parameter` provenance.
- [x] **Phase 12 — Real-World Hardening & Adversarial Fixture Validation**: End-to-end stress-testing and pipeline verification against complex real-world code patterns:
  - Validated on 11 real-world and adversarial fixture suites covering nested boundaries, Flight serialization, multi-hop interprocedural taint flows, runtime timeouts, deep recursion, and complex destructuring.
  - Zero false-positive regressions for valid constructs (`NEXT_PUBLIC_*`, internal helpers, `Date`).
  - Strict host isolation verification (zero leaks of `process`, `require`, `fs`, `fetch`).
  - Scalable fuzz budgeting and verified seed reproducibility across varied suites.
  - Format validation ensuring clean terminal rendering and schema-valid JSON / SARIF 2.1.0 outputs.
- [x] **Phase 13 — Performance, Determinism & Scalability Hardening**: Predictable and scalable analysis across large codebases:
  - Validated on 7 dedicated benchmark suites (`tiny`, `medium`, `deep-module-graph`, `many-targets`, `heavy-fuzzing`, `mixed-real-world`, and `large` 100-file project).
  - Verified linear budget scaling ($O(T \cdot N)$) across 100 candidate actions without Cartesian explosion.
  - 100% deterministic, byte-for-byte finding reproducibility across repeated runs given the same `--seed`.
  - Zero-overhead static-only classification bypassing isolate creation for framework-bound actions.
  - Bounded shrink overhead under `--max-shrink-attempts` and isolate timeouts.
- [x] **Phase 14 — CLI/UX & Error Handling Polish**: Developer experience, error diagnostics, and CLI refinement:
  - Comprehensive input validation and non-zero exit codes for invalid options (`--runs`, `--timeout`, `--max-shrink-attempts`, `--seed`, `--max-analysis-depth`).
  - Conflicting flag detection preventing corrupted multi-format invocations.
  - Direct `--json` and `--sarif` aliases emitting 100% pure parseable output to `stdout`.
  - Strict `stdout`/`stderr` separation ensuring error messages, diagnostics, and stack traces never corrupt machine-readable streams.
  - Graceful `SIGINT` / `SIGTERM` cancellation handling with standardized exit code 130.
  - Transparent static-only action presentation and compiler-grade error boxes (`SIS ERROR`).
  - Standardized exit code contract (`0` clean, `1` findings, `2` config/input error, `3` internal error, `130` interrupted).

### Planned (Upcoming Phases)

- [ ] **Phase 15 — Automated Invariant Remediation & Patch Generation**: Automated code transforms, boundary validation decorators, and interactive patch synthesis.

---

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run test suite
npm test

# Run tests in watch mode
npm run test:watch
```

---

## License

MIT © Aashir Zayd
