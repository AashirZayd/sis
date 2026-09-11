# Frequently Asked Questions & Technical Specifications

This technical reference provides direct, authoritative answers to common questions about **SIS (Speculative Invariant Synthesis)**, its verification pipeline, and its boundary models.

---

## Core Concepts

### What is SIS?
SIS is an open-source CLI runtime verification and speculative fuzzing tool for Next.js App Router and React Server Component boundaries. It discovers Client/Server module boundaries, traces secret data flows, models React Flight serializability contracts, synthesizes targeted adversarial payloads, and dynamically verifies invariants inside an isolated V8 execution sandbox.

### What does SIS test?
SIS tests the boundaries where Next.js application logic crosses between server and client environments:
- **Server Actions**: Synthesizes adversarial inputs (nullish values, numeric extremes, prototype pollution, deep nesting) to verify that actions handle unexpected shapes without unhandled runtime exceptions (`SIS003`).
- **React Flight Serialization**: Checks that props passed from Server Components to Client Components and return values from Server Actions are transferable according to the React Flight protocol (`SIS002`).
- **Secret Taint Leaks**: Traces sensitive server environment variables (`*_KEY`, `*_SECRET`, `*_TOKEN`) through multi-hop helper functions into client-rendered JSX sinks (`SIS001`).

### How does SIS test Server Actions?
SIS extracts candidate Server Actions using `@swc/core` AST parsing. It infers parameter shapes from TypeScript type signatures, parameter destructuring, and property accesses. It then uses property-based generation (`fast-check`) and targeted mutation strategies to synthesize adversarial payloads. Sandbox-compatible actions are executed inside zero-privilege `isolated-vm` isolates under strict execution budgets (default: 20ms). If a failure occurs, delta-debugging shrinks the failing input to a minimal reproducer.

### Does SIS replace unit tests?
**No.** SIS does not replace conventional unit, integration, or end-to-end tests (such as Vitest, Jest, or Playwright). Conventional tests verify expected developer-written examples and happy paths. SIS complements them by exploring unanticipated boundary edge cases, fuzzing argument envelopes, and verifying unhandled runtime exceptions in an isolated sandbox.

---

## Architectural Boundaries

### Does SIS execute the full Next.js runtime?
**No.** SIS does not emulate the entire Next.js server, React reconciler, or routing engine. It executes pure JavaScript and TypeScript logic inside a zero-privilege V8 isolate using `isolated-vm`.

Actions that require live framework request context:
- `cookies()` from `next/headers`
- `headers()` from `next/headers`
- `redirect()` and `notFound()` from `next/navigation`
- Live database ORM connections or network sockets

are classified as **static-only** via the Compatibility Gate. They are analyzed statically for taint and serializability, but bypassed from isolate execution to prevent false-positive crashes.

### What is the difference between a Server Action and a Server Function?
In Next.js App Router terminology:
- **Server Function**: Any function that executes on the server (e.g. database helpers, internal utility functions, data fetchers inside Server Components).
- **Server Action**: An asynchronous function explicitly marked with a `"use server"` directive prologue (either at the file level or inline at the top of the function body). Server Actions expose a callable network RPC endpoint accessible from client components and browser requests.

*Not every Server Function is a Server Action.* SIS distinguishes between the two, focusing adversarial fuzzing specifically on client-callable Server Actions.

---

## Execution & Reporting

### What output formats does SIS support?
SIS supports three output formats:
1. **Terminal (`--format terminal`)**: High-contrast, human-readable terminal report with ANSI status indicators, progress summaries, and minimal reproducers.
2. **JSON (`--json` or `--format json`)**: Machine-readable Version 1 JSON schema for automated tooling and custom dashboards.
3. **SARIF (`--sarif` or `--format sarif`)**: OASIS SARIF 2.1.0 standard format for native integration with GitHub Security Code Scanning and enterprise static analysis tools.

When machine-readable formats (`--json`, `--sarif`) are enabled, SIS enforces **pure stdout discipline**: machine data is sent to `stdout`, while diagnostic notices and progress banners are routed exclusively to `stderr`.

### What are the stable SIS rule IDs?
SIS findings use immutable, permanent rule identifiers:
- **`SIS001`**: `taint-violation` (Static) — Sensitive server environment variable flows into a client boundary.
- **`SIS002`**: `serialization-violation` (Static) — Non-transferable value crosses React Flight boundary.
- **`SIS003`**: `runtime-exception` (Runtime) — Candidate Server Action threw an unhandled runtime exception.
- **`SIS004`**: `timeout` (Runtime) — Candidate Server Action exceeded its isolate execution budget.
- **`SIS005`**: `invariant-violation` (Dynamic/Static) — Boundary invariant assertion violated during execution.

---

## System Requirements & Installation

### Why does SIS require Node.js 24+?
SIS depends on `isolated-vm@7.0.1` to execute candidate actions inside zero-privilege V8 isolates. Version 7.0.1 includes prebuilt native binaries for Node.js 24 (`abi137`), enabling immediate installation via `npx` or `npm install` with zero local C++ compilation (`node-gyp`).

### Can SIS be run without installing globally?
**Yes.** SIS is designed to run on-demand via `npx`:
```bash
npx @aashirzayd/sis audit .
```
Or added as a development dependency:
```bash
npm install --save-dev @aashirzayd/sis
sis audit .
```

---

## Related Guides

- [Testing Next.js Server Actions](./server-actions-testing.md)
- [React Flight Serialization Boundaries](./serialization-boundaries.md)
- [Adversarial Testing & Speculative Fuzzing](./adversarial-testing.md)
- [Static Secret Taint Analysis](./taint-analysis.md)
- [CI Pipelines & GitHub Code Scanning](./ci-sarif.md)
- [Architecture Specification](./architecture.md)
