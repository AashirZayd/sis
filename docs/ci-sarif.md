# Automated CI Pipelines & GitHub Code Scanning with SARIF

SIS is designed from the ground up for automated Continuous Integration (CI) workflows, pull request quality gates, and automated security reporting.

By supporting OASIS SARIF 2.1.0 (Static Analysis Results Interchange Format) and enforcing strict stream discipline, SIS integrates natively with GitHub Security Code Scanning and enterprise security dashboards.

---

## Stream Separation Discipline

A common frustration with developer security tools in CI is corrupted output files: diagnostic notices, log banners, or progress bars inadvertently mixed into standard output, rendering JSON or SARIF unparseable.

SIS enforces **pure stream discipline**:

- **`stdout`**: Strictly reserved for valid, machine-readable JSON or SARIF. Not a single diagnostic byte is printed to `stdout` when `--json` or `--sarif` is enabled.
- **`stderr`**: Receives all diagnostic notices, scanning summaries, progress indicators, and error boxes.

This allows safe redirection directly into output files:

```bash
# Pure JSON output to file
npx @aashirzayd/sis audit . --json > sis-report.json

# Pure SARIF output to file
npx @aashirzayd/sis audit . --sarif > sis-results.sarif
```

---

## Exit Code Contract

SIS communicates audit results to CI runners using standardized, deterministic exit codes:

| Exit Code | Status | Meaning |
| :---: | :--- | :--- |
| **`0`** | **Clean Audit** | Audit completed successfully with zero actionable findings or invariant violations. |
| **`1`** | **Violations Detected** | Actionable findings detected (secret leaks, runtime exceptions, timeouts, or serialization errors). |
| **`2`** | **CLI / Config Error** | Target path not found, invalid numeric option (`--runs <= 0`), conflicting flags (`--json` and `--sarif`), or malformed arguments. |
| **`3`** | **Engine Failure** | Unexpected internal executor or V8 isolate failure. |
| **`130`** | **Interrupted** | Execution canceled by user via `SIGINT` (`Ctrl+C`). |
| **`143`** | **Terminated** | Execution terminated via `SIGTERM`. |

---

## GitHub Actions Workflow Example

You can configure SIS to scan every push and pull request, uploading findings directly to GitHub Code Scanning so that violations appear as inline PR review annotations and security alerts:

```yaml
# .github/workflows/sis-audit.yml
name: SIS Security & Boundary Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    name: Next.js Boundary Verification
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
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run SIS Boundary Audit
        run: npx @aashirzayd/sis audit . --sarif > sis-results.sarif
        # Continue on error so findings can be uploaded to GitHub Code Scanning
        continue-on-error: true

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: sis-results.sarif
          category: sis-boundary-audit
```

---

## Deterministic CI Reproducibility

In automated pipelines, tests must not be flaky. A test that fails intermittently erodes developer confidence.

To ensure byte-for-byte deterministic audits across different CI environments, use the `--seed` flag:

```bash
npx @aashirzayd/sis audit . --seed 42 --sarif > sis-results.sarif
```

When an explicit seed is provided:
- File discovery uses strict lexicographical sorting regardless of operating system filesystem order.
- Each source file receives a deterministic seed derived via 32-bit FNV-1a hashing of the base seed and relative path.
- The underlying `fast-check` PRNG generates identical payloads.
- Failure shrinking sequences and minimal reproducers are deterministic and reproducible across runs given identical seeds.

---

## CI Configuration Best Practices

1. **Pin the Node.js Version**: Ensure your CI workflow runs Node.js 24+ (`node-version: 24`) to utilize native prebuilt binaries for `isolated-vm`.
2. **Tune the Runs Budget**: In fast PR check jobs, `--runs 10` provides rapid verification (< 5s for medium codebases). In nightly security audits, `--runs 50` or `--runs 100` provides deeper fuzzing exploration.
3. **Use the `--silent` Flag for Custom Loggers**: When running SIS in scripts where you only care about the exit code, use `--silent` to suppress all terminal output.

---

## Related Guides

- [Testing Next.js Server Actions](./server-actions-testing.md)
- [React Flight Serialization Boundaries](./serialization-boundaries.md)
- [Static Secret Taint Analysis](./taint-analysis.md)
- [Architecture Specification](./architecture.md)
- [Frequently Asked Questions](./faq.md)
