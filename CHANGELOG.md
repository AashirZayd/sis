# Changelog

All notable changes to **SIS (Speculative Invariant Synthesis)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on Registry History**: The npm registry name `sis` was previously associated with an unrelated legacy library published in 2014–2015 (v0.1.0 through v0.1.3). The history below documents the genuine development milestones of the Speculative Invariant Synthesis engine.

## [0.1.0]

### Added
- **Core Engine & AST Analysis**: SWC-based parsing of TypeScript and TSX, identifying Next.js App Router boundaries (`"use client"`, `"use server"`) and candidate Server Actions.
- **Interprocedural Taint Tracking**: Local module-graph and call-graph data-flow analysis tracking private environment variables (`*_KEY`, `*_SECRET`, `*_TOKEN`, `PRIVATE_*`) into Client Component JSX sinks (`SIS001`).
- **React Flight Serializability**: Validation of Server Component prop expressions and Server Action return values against React Flight serialization specifications (`SIS002`).
- **Speculative Shape Inference & Fuzzing**: Boundary-directed adversarial input generation powered by `fast-check` with targeted numeric, string, nullish, prototype pollution, and wire serialization traps.
- **Isolated Runtime Execution**: Zero-privilege execution of sandbox-compatible candidate Server Actions in `isolated-vm` with strict per-payload candidate execution budgets (`--timeout`) (`SIS003`, `SIS004`).
- **Failure Shrinking**: Delta-debugging reduction engine producing minimal reproducible failing inputs while strictly preserving runtime failure signatures.
- **Directory-Wide Deterministic Auditing**: Recursive scanner with lexicographical file ordering and FNV-1a deterministic per-file seed derivation (`--seed`).
- **Machine-Readable Output**: Dual structured output supporting Version 1 JSON schema (`--json`) and OASIS SARIF 2.1.0 (`--sarif`) with pure `stdout` stream discipline.
- **CLI & Error Handling**: Commander-based CLI with comprehensive numeric parameter validation, signal handling (`SIGINT`, `SIGTERM`), exit code contract (`0`, `1`, `2`, `3`, `130`, `143`), and high-contrast diagnostic error reporting.
- **Documentation & Examples**: Curated documentation, architecture specifications (`docs/architecture.md`), and verified examples (`examples/`).
