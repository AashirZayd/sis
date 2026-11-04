# Contributing to SIS

Thank you for your interest in contributing to **SIS (Speculative Invariant Synthesis)**!

SIS is an autonomous runtime verification and speculative fuzzing tool for Next.js App Router and React Server Components.

---

## Getting Started

### Prerequisites
- **Node.js**: `>= 24.0.0`
- **Package Manager**: `npm`

### Repository Setup
```bash
# Clone the repository
git clone https://github.com/AashirZayd/sis.git
cd sis

# Install dependencies exactly as locked
npm ci

# Run the test suite (no prior build needed: the test run compiles src/
# into node_modules/.cache/sis-test-build and never reads dist/)
npm test

# Compile dist/ when you want to run the CLI or the benchmark locally
npm run build
```

### Golden output snapshots

`test/golden.test.ts` pins terminal, JSON and SARIF output and exit codes for the fixtures in `test/fixtures/golden/` and selected existing fixtures. Snapshots live in `test/__golden__/`. Some fixtures intentionally capture known-defective behavior from the audit (`audit/PHASE-2-FINDINGS-VALIDATION.md`). If your change alters a snapshot, update it with `npx vitest run test/golden.test.ts -u` **only when the change is intentional**, and explain each changed snapshot in the pull request, citing the defect it addresses.

---

## Architectural Principles

Before contributing code, review [`docs/architecture.md`](docs/architecture.md) for details on the pipeline stages.

Key architectural rules:
1. **Host Isolation**: Untrusted or candidate user code must **never** be evaluated directly on the host Node.js runtime. Dynamic execution is strictly confined to `isolated-vm` V8 isolates with enforced timeouts.
2. **Deterministic Analysis**: Given the same source code, configuration, and `--seed`, SIS must produce byte-for-byte identical findings, failure signatures, and minimal reproducers. All file traversals and AST object keys must be sorted deterministically.
3. **Linear Scaling**: Speculative fuzz runs are budgeted per discovered target ($O(T \cdot N)$) to avoid Cartesian explosions.
4. **Stable Finding Catalog**: Rule IDs (`SIS001` through `SIS005`) are immutable. Do not renumber or repurpose existing IDs.
5. **Stream Purity**: When machine-readable output formats (`--json`, `--sarif`) are requested, `stdout` must contain exclusively valid JSON/SARIF. All diagnostic logging, progress spinners, and errors must go to `stderr`.

---

## Pull Request Guidelines

1. Ensure all existing tests pass:
   ```bash
   npm test
   ```
2. Verify TypeScript compilation and packaging:
   ```bash
   npm run build
   npm pack --dry-run
   ```
3. Add focused unit or fixture tests in `test/` for new functionality.
4. Keep pull requests focused on a single change or bug fix.
