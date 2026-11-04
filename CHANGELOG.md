# Changelog

All notable changes to **SIS (Speculative Invariant Synthesis)** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on Package Identity**: The unscoped npm package name `sis` was historically registered by an unrelated legacy library published in 2014–2015. Speculative Invariant Synthesis is prepared for its initial release under the scoped package name `@aashirzayd/sis`.

## [Unreleased]

Reliability Reset, implementation batch 1 (see `audit/PHASE-5-BATCH-1-IMPLEMENTATION-REPORT.md`). Nothing in this section has been published to npm; the published package remains `0.1.0`.

### Fixed
- **Sandbox executions can no longer hang the audit.** A host-side wall-clock deadline (default `max(10 × --timeout, 1000ms)`) now bounds every sandbox execution, including actions awaiting promises that never settle, which V8's CPU timeout does not cover. Expired executions are terminated and counted as `unsupported`; they are never reported as findings. (audit V-26)
- **Source locations after non-ASCII text.** SWC reports UTF-8 byte offsets; SIS previously indexed them as UTF-16 positions, so columns (and sometimes lines) were wrong after accented, CJK or emoji characters, and columns were off by one in files starting with a byte-order mark. Locations in terminal, JSON and SARIF output are now exact (1-based lines, UTF-16 code-unit columns). (audit V-12)

### Changed
- The CLI `--version`, JSON `tool.version` and SARIF `driver.version` are read from `package.json` instead of three hard-coded copies.
- The npm package no longer ships source maps or the empty `analyzer`, `fuzzer` and `sandbox` placeholder modules (299 → 147 files).
- Removed the unused `ora` dependency.
- Added `.gitattributes` so every checkout uses LF; builds are now byte-identical across platforms regardless of `core.autocrlf`.

### Development
- `npm test` no longer depends on a prebuilt `dist/`: the test run compiles `src/` into `node_modules/.cache/sis-test-build`. A fresh clone can run `npm ci && npm test`.
- Golden output snapshots (`test/__golden__/`) pin terminal, JSON and SARIF output and exit codes, including fixtures that capture known defects still under remediation.
- New CI workflow on push and pull request (Linux and Windows, Node 24), with non-blocking Node 26 and `--no-node-snapshot` observation jobs and `actionlint`.
- The benchmark workflow now passes `workflow_dispatch` inputs through environment variables, validates them before use, runs with read-only permissions and uses SHA-pinned actions. (audit V-18)
- Fixture files `test/fixtures/project/dist/ignored.ts` and `test/fixtures/project/node_modules/ignored.ts` are now tracked; they had been excluded by `.gitignore`, leaving the default-ignore tests vacuous on fresh clones.

### Documentation
- README, `docs/benchmark.md` and `benchmarks/KNOWN_LIMITATIONS.md` now state the known verification and release limitations, mark the published-package gap, and label the benchmark figures as historical and pre-correction. Historical benchmark data is unchanged.

## [0.1.0] - Preparation for Initial Scoped Release

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
