# SIS Real-World Benchmark & Evaluation Infrastructure

The SIS Benchmark Suite evaluates **Speculative Invariant Synthesis** against authentic, open-source Next.js applications pinned at immutable Git commit SHAs.

The objective is to measure detection capabilities, runtime verification yield, boundary distribution, and framework compatibility on real production codebases without relying on synthetic or artificial toy fixtures.

---

## 1. Corpus Selection & Manifest Schema

The corpus is defined in [`benchmarks/corpus.json`](./corpus.json). Repositories are selected based on:
1. **Active App Router & RSC Usage**: Applications splitting logic across React Server Components, Client Components, and Server Actions.
2. **Real-World Complexity**: Authentic codebases featuring authentication, database queries, form handling, and third-party integrations.
3. **Public Open-Source Availability**: Permissively licensed public repositories on GitHub.
4. **Pinned Immutability**: Fixed 40-character commit hashes. Deterministic seed derivation makes generated inputs reproducible under equivalent SIS, Node.js, and execution environments.

### Pinned Repositories

| Repository | Pinned Commit | Key Architecture Features |
| :--- | :---: | :--- |
| [**`shadcn-ui/taxonomy`**](https://github.com/shadcn-ui/taxonomy) | `298a8857c7128a0d121e7f699dfd729f23b3966d` | Next.js 13/14 App Router, Contentlayer markdown pipeline, Server Actions, Route Handlers. |
| [**`leerob/site`**](https://github.com/leerob/site) | `fd03371e3c90481a8447904e1b548e4c0327b7db` | Production portfolio with App Router, Postgres queries, and guestbook Server Actions. |
| [**`vercel/commerce`**](https://github.com/vercel/commerce) | `3761e52e60df9c6a316e067dbfd7032e494d3634` | Official Vercel Next.js Commerce architecture template with cart Server Actions and cookies. |
| [**`dubinc/dub`**](https://github.com/dubinc/dub) | `b8866f413cec065438d6e5faabbd9dac7d1ceea5` | Large-scale multi-tenant App Router platform with complex Zod schemas and Server Actions. |
| [**`mickasmt/next-saas-stripe-starter`**](https://github.com/mickasmt/next-saas-stripe-starter) | `a78d130af7e04d0250d65c67f217976f7eb3adc2` | Full-featured SaaS starter with Stripe webhooks, user settings Server Actions, and Prisma. |

### Manifest JSON Schema (`corpus.json`)
Each repository entry in `benchmarks/corpus.json` adheres to the following typed schema:
```json
{
  "name": "org/repo",
  "url": "https://github.com/org/repo.git",
  "commit": "40_character_git_commit_sha",
  "description": "Short description of application architecture",
  "targetDir": ".",
  "framework": {
    "nextVersion": "^14.0.0",
    "appRouter": true,
    "serverActions": true,
    "rsc": true,
    "orm": "prisma",
    "auth": "next-auth"
  },
  "notes": "Evaluation rationale and key boundaries"
}
```

### Proposing a New Repository for the Corpus
To contribute a new repository to `corpus.json`:
1. Ensure the repository is publicly accessible and permissively licensed (MIT, Apache 2.0, BSD).
2. Pin an exact, immutable 40-character commit SHA.
3. Specify `targetDir` (`.` for root, or subdirectory such as `apps/web` for monorepos).
4. Run `npm run benchmark -- --repo org/repo` to verify clean parsing and execution.
5. Open a pull request with the updated `corpus.json` and initial benchmark output.

---

## 2. Benchmark Runner Architecture & Execution Hygiene

The benchmark orchestrator ([`benchmarks/run.ts`](./run.ts) and [`benchmarks/orchestrator.ts`](./orchestrator.ts)) enforces strict execution hygiene:

```
┌─────────────────────────────────────────────────────────────┐
│                      corpus.json                            │
│           (5 Pinned Repositories & Commits)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
               For each pinned repository target:
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Ephemeral Sandbox Creation (os.tmpdir())                 │
│    Shallow fetch exact pinned commit (git fetch --depth 1)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Deterministic FNV-1a Seed Derivation                     │
│    deriveFileSeed(baseSeed, repo.name)                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SIS AuditEngine Invocation                               │
│    AST Parsing → Taint → Serializability → Isolate Fuzzing  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Result Normalization & Failure Isolation                 │
│    Metrics normalization into RepositoryBenchmarkResult     │
│    Guaranteed filesystem cleanup in finally block           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Report Generation & Ground-Truth Sync                    │
│    benchmarks/results/latest.json                           │
│    benchmarks/results/latest.md                             │
│    benchmarks/reviews/ground-truth.json (Sync & Preserve)   │
│    benchmarks/results/ground-truth.md                       │
└─────────────────────────────────────────────────────────────┘
```

1. **Zero-Dependency Checkouts**: Cloned repositories do **not** run `npm install` or compile locally. SIS operates directly on raw TypeScript/TSX ASTs and self-contained JavaScript functions.
2. **Ephemeral Sandboxing**: Each target is checked out into a temporary folder under `os.tmpdir()` and deleted immediately upon completion.
3. **Deterministic Seeding**: Each repository receives an FNV-1a derived seed computed from the base seed and the repository identifier.
4. **Failure Isolation**: An error or clone timeout in one repository is recorded as `status: "failed"` and does not abort the remainder of the benchmark run.

---

## 3. Benchmark CLI Commands & State Mutability

### State-Mutating Commands
These commands modify generated result files and synchronize the review store:

```bash
# Execute full benchmark suite across all 5 repositories
# (Updates benchmarks/results/latest.json, latest.md, syncs ground-truth.json, updates ground-truth.md)
npm run benchmark -- --all

# Execute benchmark on a single repository
npm run benchmark -- --repo vercel/commerce

# Refresh ground-truth markdown report from review store
npm run benchmark -- --review
```

### Read-Only Inspection & Reproduction Commands
These commands read existing files and make zero modifications to the filesystem:

```bash
# Dry-run validation of corpus configuration without cloning repositories
npm run benchmark -- --dry-run

# Inspect all ground-truth review records
npm run benchmark -- --review --status all

# Inspect pending unreviewed findings only
npm run benchmark -- --review --status pending

# Filter review records by rule ID
npm run benchmark -- --review --rule SIS003

# Output raw benchmark JSON to stdout
npm run benchmark -- --json

# Reproduce an exact finding from its stable 16-hex fingerprint
npm run benchmark -- --reproduce b6bbfce3dbe171b5
```

### Complete CLI Options Reference

| Option | Default | Mutability | Description |
| :--- | :---: | :---: | :--- |
| `--all` | `true` | Mutating | Audit all repositories in `corpus.json` |
| `--repo <name>` | — | Mutating | Audit a specific repository from the corpus |
| `--json` | `false` | Read-only | Emit serialized JSON report to stdout |
| `-s, --seed <number>` | `42` | Config | Base random seed for deterministic synthesis |
| `-r, --runs <number>` | `10` | Config | Fuzz runs per candidate Server Action |
| `-t, --timeout <number>` | `20` | Config | Isolate execution budget per payload in milliseconds |
| `--out-dir <path>` | `benchmarks/results` | Config | Target directory for generated benchmark reports |
| `--dry-run` | `false` | Read-only | Validate corpus without cloning repositories |
| `--keep-temp` | `false` | Debug | Retain temporary checkout directories for inspection |
| `--review` | `false` | Mutating (Report) | Synchronize review store and regenerate `ground-truth.md` |
| `--status <status>` | `all` | Read-only | Filter reviews by status (`pending`, `reviewed`, `all`) |
| `--rule <ruleId>` | — | Read-only | Filter reviews by rule ID (`SIS001`, `SIS002`, `SIS003`, etc.) |
| `--reproduce <fp>` | — | Read-only | Clone repository and reproduce finding by fingerprint |

---

## 4. Ground-Truth Review Store (`ground-truth.json`)

All benchmark findings across the project's lifetime are cataloged in [`benchmarks/reviews/ground-truth.json`](./reviews/ground-truth.json).

### Review Record Schema
```typescript
interface ReviewRecord {
  repository: string;
  commit: string;
  file: string;
  line: number;
  column?: number;
  ruleId: string;
  fingerprint: string;
  message: string;
  actionName?: string;
  generatedInput?: unknown;
  failureSignature?: string;
  staticEvidence?: {
    boundaryKind?: string;
    direction?: string;
    source?: string;
    sink?: string;
    invariant?: string;
  };
  runtimeEvidence?: {
    errorName?: string;
    fuzzTarget?: string;
    strategy?: string;
    parameter?: string;
    shrinkAttempts?: number;
    shrinkReduction?: string;
    minimalReproducerVerified?: boolean;
  };
  classification: "TRUE_POSITIVE" | "FALSE_POSITIVE" | "EXPECTED_BEHAVIOR" | "UNREACHABLE" | "FRAMEWORK_ARTIFACT" | "NEEDS_REVIEW";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reviewer: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
}
```

### Deterministic Fingerprint Algorithm
Every finding receives a deterministic 16-hex SHA-256 fingerprint:
`repository:commit[:12]:relativeFilePath:ruleId:line:actionName:signature:payloadId:strategy:category`

- **Path-Independent**: File paths are normalized to POSIX relative paths; absolute temporary clone directories are stripped.
- **Run-Independent**: Does not use timestamps or random IDs.
- **Preservation Guarantee**: Re-running benchmarks will never overwrite an existing reviewer's classification, notes, or attribution.

---

## 5. Ground-Truth Review Status (Phase 24)

As of Phase 24, **100% of all 43 historical and active benchmark findings** have been manually reviewed against source code at pinned commits:

| Classification | Count | Description |
| :--- | :---: | :--- |
| **`TRUE_POSITIVE`** | **9** | Missing defensive input validation on public Server Actions (`vercel/commerce` `components/cart/actions.ts#L54`) |
| **`FALSE_POSITIVE`** | **9** | 6 HTTP Route Handlers returning `Response`/`ImageResponse`, 3 Client modal callback props |
| **`FRAMEWORK_ARTIFACT`** | **24** | Un-mocked Upstash Redis and AI SDK singletons inside isolated-vm (now gated as `static-only`) |
| **`UNREACHABLE`** | **1** | Non-production Playwright test fixture helper (`playwright/api/fixtures.ts`) |
| **`EXPECTED_BEHAVIOR`** | **0** | Zero findings represented intentional application error aborts |
| **`NEEDS_REVIEW` (Pending)** | **0** | **0 pending reviews remaining** |
| **Total Lifetime Records** | **43** | All records preserved with full audit trail |

### Precision Metrics
- **Current Emitted Benchmark Output**: $9 / (9 + 0) = \mathbf{100.0\%}$ (all 9 emitted findings are verified True Positives on `vercel/commerce`).
- **Lifetime Binary Review Store**: $9 / (9 + 9) = \mathbf{50.0\%}$ (9 True Positives out of 18 binary TP/FP classifications).

---

## 6. Documentation References

- [**docs/benchmark.md**](../docs/benchmark.md): Comprehensive evaluation document, multi-phase history, and precision analysis.
- [**benchmarks/KNOWN_LIMITATIONS.md**](./KNOWN_LIMITATIONS.md): Formal documentation of sandbox boundaries and recall trade-offs.
- [**benchmarks/results/latest.md**](./results/latest.md): Latest generated benchmark markdown report.
- [**benchmarks/results/ground-truth.md**](./results/ground-truth.md): Latest generated ground-truth review catalog.
