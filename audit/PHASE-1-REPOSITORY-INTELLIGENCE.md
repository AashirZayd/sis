# SIS — Phase 1: Repository Intelligence Audit

| | |
| :--- | :--- |
| **Repository** | `https://github.com/AashirZayd/sis` (local clone `E:\development\sis`) |
| **Audited revision** | `585af3d` on local `master` (tracks `origin/main`, identical SHA) |
| **Audit date** | 2026-11-01 |
| **Scope** | Read-only. No source, dependency, or configuration changes. This file is the only addition to the working tree. |
| **Environment** | Node v24.19.0, npm 11.17.0, Windows 11 x64 |

## How to read this report

Every claim here comes from one of three kinds of evidence, labeled inline:

- **[code]** — read directly from source at the cited `file:line`.
- **[probe]** — reproduced by running a scratch build of `src/` (compiled to a temp dir, not `dist/`) against small fixtures written for this audit. The fixtures are in [Appendix A](#appendix-a--probe-fixtures) so anyone can rerun them. These are local reproductions, **not benchmark results**.
- **[repo-data]** — computed from data files already committed to the repo (for example `benchmarks/reviews/ground-truth.json`). Nothing in this report is a new benchmark measurement.

Line numbers refer to revision `585af3d`.

---

## 1. Executive summary

SIS is a ~11.3k-line TypeScript CLI and library (`src/`, 68 files) that statically analyzes Next.js App Router code with `@swc/core`, then runs candidate Server Actions inside `isolated-vm` against payloads generated with `fast-check`. The engineering is real and in good shape: the type-check is clean, all **340 tests in 24 files pass** in about 10 s, the pipeline does what it says at the happy-path level, and the benchmark acquisition code (pinned SHAs, shallow fetch, fail-fast) is careful.

The main risks are in **what the tool claims compared with what it can establish**, and in **coverage gaps the reports don't show**:

1. **The published npm package is not the documented product.** `@aashirzayd/sis@0.1.0` was published 2026-09-10 21:22 UTC. Selective Runtime Verification (prefix slicing and preludes) landed after that, in `aee77fd` (2026-09-12). The registry tarball has no `runtime/prefix.js` and no `runtime/preludes/` **[probe]**. The README tells users to run `npx @aashirzayd/sis` and documents prefix mode as current. The version was never bumped, and the repo has no tags.
2. **The benchmark's "9 confirmed true positives" are one defect.** All 9 `TRUE_POSITIVE` records are `vercel/commerce` → `components/cart/actions.ts:54` → `updateItemQuantity`, with different payloads **[repo-data]**. The fingerprint includes `payloadId` and `strategy` (`benchmarks/reviews.ts:130-140`), so each payload gets its own "finding". The headline "100% emitted precision (9/9)" (`README.md:283`, `:292`) is accurate arithmetic over a heavily duplicated sample.
3. **Some runtime findings are reported for the wrong reasons, and some real failures are silently dropped [probe]:**
   - An action that **returns** a function or other non-clonable value gets a `SIS003 runtime-exception` ("…could not be cloned"). That error comes from host-side result copying, not from the application. This contradicts the README's "Core Rule of SIS Trust" (`README.md:197`).
   - A user error whose message contains `"Script execution timed out"` is reported as `SIS004 timeout`. Any error message containing `NEXT_REDIRECT` or `NEXT_NOT_FOUND`, and **every** `ReferenceError` (including real typos), is silently counted as passed or unsupported (`src/runtime/worker.ts:82-102`).
4. **Large classes of actions are labeled `FULL` but never actually run.** The executor extracts only the action's own function node (`src/runtime/executor.ts:130-141`). Any action that calls a module-level helper or reads a module-level constant hits a `ReferenceError` in the isolate, and that is classified `unsupported`. The same happens to actions exported by alias (`export { fn as alias }`) and to anonymous default exports. None of these produce a diagnostic **[probe]**.
5. **Only the first parameter of each action is fuzzed** (`src/index.ts:118-120`, `src/runtime/worker.ts:62`). Later parameters are always `undefined`.
6. **Cross-module analysis only follows relative imports.** `tsconfig` `paths` and `@/…` aliases are not resolved anywhere in `src/`. In a typical Next.js app that imports components via `@/components/...`, prop-boundary analysis finds **zero edges**, and a secret passed to a client component is missed **[probe]**.
7. **Static serialization checks use a name heuristic that produces false positives.** Any returned or passed identifier whose name contains `db`, `client`, `prisma`, or `connection` is a `SIS002` error (`src/boundary/serializability.ts:136`). Returning a variable named `feedback` is reported as a "Database connection / server-only instance" **[probe]**.
8. **There is no CI on push or PR.** The only workflow is a manual/weekly benchmark job (`.github/workflows/benchmark.yml`).

None of these is architectural rot. Most are bounded fixes. But points 2–7 bear directly on the project's central promise of "proof over suspicion" (`README.md:25-42`), so they should come first in later phases.

---

## 2. Verified architecture

### 2.1 Entry points

| Entry point | File | Notes |
| :--- | :--- | :--- |
| CLI `sis audit <target>` | `src/cli.ts:40-217` | Commander. Validates numeric flags (`:114-185`), maps the format, calls `audit()`, writes JSON/SARIF to stdout (`:201-205`). |
| Library `audit()` / `AuditEngine` | `src/index.ts:48-761` | Dispatches to `auditSingleFile` (`:73-336`) or `auditDirectory` (`:342-749`). |
| Benchmark CLI `npm run benchmark` | `benchmarks/run.ts` | Runs as raw `.ts` through Node 24 type stripping. Imports the **built** `../dist/index.js` (`benchmarks/orchestrator.ts:6`, `benchmarks/reviews.ts:5-6`). |
| Barrel re-exports | `src/index.ts:35-46` | Exports every module's internals as public API, including the test-only `NextBoundaryVisitor`. |

### 2.2 Pipeline (as implemented)

```
target ─► discovery (dir only) ─► per file, sequential:
            parseModule (SWC) ─► BoundaryVisitor + classifyBoundary
            ├─► analyzeTaint (intra-file, process.env only)
            └─► if "use server" actions:
                  extractFuzzTargets ─► synthesizeBoundaryPayloads (param 0 only)
                  ─► verifyRuntimeActions
                        extractCandidateFunction ─► analyzeActionPrefix (FULL/PREFIX/STATIC_ONLY)
                        ─► print + transform single function ─► runInIsolate (fresh isolate per payload)
                  ─► shrinkFailurePayload (per failing execution)
          after all files (DIRECTORY MODE ONLY):
            buildModuleGraph ─► analyzeInterproceduralDataflow
            ─► analyzePropBoundaries + analyzeReturnBoundaries (uses NextBoundaryVisitor)
            ─► merge findings by (file, line[, type])
          ─► AuditResult ─► terminal | formatJson | formatSarif
```

**Single-file mode skips stages 9–10 entirely.** There is no data-flow, prop, or return analysis (`src/index.ts:299-335` versus `:638-702`). `sis audit app/actions.ts` and `sis audit app/` give different classes of findings for the same file **[probe]**: the single-file result has no `propBoundariesFound` statistic at all.

### 2.3 Core abstractions

| Abstraction | Defined at | Role |
| :--- | :--- | :--- |
| `ParsedModule` | `src/parser/types.ts:18-26` | AST + directives + boundaries + actions + locator. The unit passed between stages. |
| `ServerAction` | `src/core/types.ts:47-58` | **Mutable**: `extractCandidateFunction` writes `executionCompatibility`, `executionMode`, `stoppedAt` back onto it (`src/runtime/executor.ts:112-128`). |
| `Finding` | `src/core/types.ts:69-102` | One flat type with ~30 optional fields shared by static and runtime findings. |
| `FuzzTarget` | `src/payload/targets/types.ts:39-53` | Per-parameter, per-return, per-prop targets. Only `server-action-argument` targets are ever consumed. |
| `ActionPrefixAnalysis` | `src/runtime/prefix.ts:13-22` | Execution-mode decision and the sliced AST. |
| `ModuleGraph` / `FunctionSummary` | `src/dataflow/types.ts:46-71` | Cross-file taint summaries. |

### 2.4 Trust boundaries

| Boundary | Mechanism | Observations |
| :--- | :--- | :--- |
| Audited source → SIS host process | Source is parsed only. Nothing from the target is `require`d or `import`ed. | Good. The host never evaluates target code. |
| SIS host → V8 isolate | `isolated-vm`, fresh `Isolate` per payload, 128 MB limit, no host globals exposed (`src/runtime/worker.ts:49-66`). | Payload goes in via `ExternalCopy` (`:53-54`). The result comes back with `copy: true` (`:71-75`), and that copy is the source of the false "could not be cloned" findings. The isolate gets only the preludes and the action's code. |
| Isolate → host error channel | Error **message substrings** decide the status (`:82-102`). | Code under test can spoof it (see §8.1). |
| Benchmark → third-party repos | `git` via `execFile` (no shell), `GIT_TERMINAL_PROMPT=0`, shallow fetch of a pinned SHA, HEAD verified (`benchmarks/git.ts:103-185`). | Good. Checked-out repos are parsed, never executed on the host. |
| CI inputs → shell | `${{ github.event.inputs.repo }}` is interpolated straight into `run:` (`.github/workflows/benchmark.yml:41-44`). | Classic workflow-input injection pattern. Only someone with dispatch rights can trigger it, and there's no `permissions:` block. |

### 2.5 Runtime execution lifecycle

1. `verifyRuntimeActions` loops over actions (`src/runtime/executor.ts:263-285`).
2. `extractCandidateFunction` locates the AST node (`:27-105`), then runs `isActionSandboxCompatible` → `analyzeActionPrefix` (`src/runtime/compatibility.ts:193-225`, `src/runtime/prefix.ts:347-530`).
3. The chosen node (or a prefix clone with a `return { __sis_prefix_complete: true }` sentinel, `src/runtime/prefix.ts:260-341`) is wrapped in a one-item `Module`, printed with `swc.printSync`, and transpiled with `swc.transformSync` (`src/runtime/executor.ts:132-152`). **Nothing else from the module is included.**
4. For each payload: `isPayloadTransferable` (`src/runtime/compatibility.ts:20-115`) rejects BigInt, Symbol, functions, Date, RegExp, Map, Set, cycles, and depth > 20. Rejected payloads are recorded as `unsupported` without running.
5. `runInIsolate` builds `(async function(){ <preludes> <code> return await <actionName>(__sisPayload); })()` (`src/runtime/worker.ts:58-64`) and runs it with `timeout` (default 20 ms) and `promise: true`. **[probe]** The timeout also applies after an `await` (an `await null; while(true){}` loop was caught).
6. The status is classified from the error message (`:78-111`). The isolate is disposed in `finally` (`:120-143`).
7. The extraction runs **again** for shrinking (`src/index.ts:250-255`, `:574-579`), mutating the action a second time.

### 2.6 Finding-generation lifecycle and merge

- Static taint findings come from `analyzeTaint` per file.
- Runtime findings: **one per failing payload execution** (`src/index.ts:175-236`). There's no grouping by failure signature, so one bug with 8 failing payloads becomes 8 findings **[probe]**.
- Data-flow, prop, and return findings **replace** any existing finding at the same `file:line` (`src/index.ts:645-698`). For data-flow, the match ignores message and type subtleties: it replaces the first `taint-violation` on the same line (`:646-651`).
- `taintSourcesFound` is patched as `Math.max(totalTaintSources, totalTaintViolations)` (`src/index.ts:701`). That's a cosmetic invariant, not a measured count.
- Every finding type is `severity: "error"` (`src/taint/sinks.ts:18-24`, `src/boundary/props.ts:343-358`, `src/boundary/returns.ts:267-283`, `src/index.ts:186-234`). Exit code 1 (`src/cli.ts:207-209`) is therefore triggered by heuristic static findings just as much as by runtime-confirmed ones.

### 2.7 Error handling

- Per-file isolation in directory mode: `ParserError` becomes `parse-error`, anything else becomes `analysis-error` (`src/index.ts:614-630`). This is solid.
- The CLI maps `ExecutionError` to exit code 3 (`src/cli.ts:214`), but **`new ExecutionError` appears nowhere in `src/`** **[code]**. Exit code 3, documented at `README.md:656`, is unreachable. Isolate setup failures become `execution-error` executions, counted as `unsupported` (`src/runtime/executor.ts:307-309`).
- Signal handlers exit immediately with 130/143 (`src/cli.ts:18-30`). Isolates are not disposed explicitly, though process exit makes that moot.

### 2.8 Serialization and reporting lifecycle

- `formatJson` (`src/output/json.ts:155-301`): schema `version: "1"`. `summary.verifiedFindings` counts all `error` findings (`:159-161`), so heuristic static findings are labeled "verified". `serializeSpecialPayload` handles non-JSON payload values.
- `formatSarif` (`src/output/sarif.ts:18-134`): SARIF 2.1.0, `uriBaseId: "%SRCROOT%"`, but the URI is the path **relative to the audit target, not the repository root** (`src/discovery/scanner.ts:95` → `src/output/sarif.ts:25`). **[probe]** `audit("app")` emits `actions.ts`, not `app/actions.ts`. There are no `partialFingerprints` or `fingerprints`, so GitHub code scanning can't de-duplicate across runs.
- The terminal reporter (`src/reporter/terminal.ts`, 604 lines) prints "verified findings" for all findings (`:511-514`).

### 2.9 Structural issues

| Issue | Evidence |
| :--- | :--- |
| **Circular value import** | `src/runtime/compatibility.ts:117-118` imports `analyzeActionPrefix` from `prefix.ts`. `src/runtime/prefix.ts:5-8` imports `UNSUPPORTED_HOST_GLOBALS` and `EXTERNAL_CLOUD_PACKAGE_PATTERNS` from `compatibility.ts`. It works only because the constants are read lazily. The imports at `compatibility.ts:117-120` sit mid-file. This is the only value-level cycle in `src/` **[probe: import-graph scan]**. |
| Type-only cycle | `src/core/types.ts` ↔ `src/runtime/types.ts` (inline `import()` types). Harmless. |
| **Duplicated pipeline** | `auditSingleFile` and `auditDirectory` duplicate payload selection (`:117-142` / `:456-481`), finding construction (`:185-235` / `:514-564`), and shrinking (`:243-292` / `:567-610`). They have already drifted: single-file has no data-flow stage, and empty-directory statistics omit the execution-mode counters (`:366-383`). |
| **Two divergent boundary visitors** | `src/parser/boundary-visitor.ts` (`BoundaryVisitor`) feeds runtime and fuzzing and only discovers actions in module-level `"use server"` files (`:40-42`). `src/boundary/visitor.ts` (`NextBoundaryVisitor`) discovers inline `"use server"` functions and "candidate" exported async functions in any non-client file (`:213-224`, `:290-296`), but only `returns.ts` uses it (`src/boundary/returns.ts:43`). The two disagree about what an action is. |
| Repeated AST walkers | At least 6 hand-written recursive "walk every key except `span`" traversals: `prefix.ts:79-126`, `classifier.ts:163-185`, `inference.ts:241-359`, plus the taint, data-flow, and props walkers. Each one handles a different subset of node types. |
| Hidden mutation | `ServerAction` objects are mutated during extraction (`src/runtime/executor.ts:112-128`). Whether `action.executionCompatibility === "static-only"` at `:264` is set depends on call order. |
| Bottleneck | Everything is sequential: files, actions, payloads, and shrink attempts. A new `ivm.Isolate` is created per payload (`src/runtime/worker.ts:49`). Throughput is fine for small corpora but grows linearly with actions × runs × (1 + shrink attempts). |
| Placeholder modules | `src/analyzer/index.ts`, `src/fuzzer/index.ts`, `src/sandbox/index.ts` are `export {}` stubs. They still ship in the package (`dist/analyzer`, etc.). |

---

## 3. Module-by-module inventory

Line counts are for `src/` at `585af3d`.

| Module | Files / LOC | Responsibility | Tests | Key limitations (details in §8) |
| :--- | :--- | :--- | :--- | :--- |
| `core/` | 2 / 260 | Shared types, error classes | indirect | `Finding` is one wide optional-field bag. `ExecutionError` is never thrown. |
| `parser/` | 4 / 354 | SWC parse, directives, module-level action discovery, byte offset → line/column | `parser.test.ts` (8) | The locator treats SWC **UTF-8 byte** offsets as UTF-16 indices (`location.ts:13-49`). Default and aliased exports are discovered but can't execute. |
| `boundary/` | 7 / ~1,630 | Classification, prop and return serializability, `NextBoundaryVisitor` | `boundary*.test.ts` (20) | Name heuristic (`serializability.ts:136`). Relative imports only. Any local function counts as a "server function" (`props.ts:58-61`). Recursion drops `localEnv` (`props.ts:386-393`). |
| `taint/` | 6 / ~800 | Intra-file `process.env` secret tracking into client sinks | `taint.test.ts` (15) | Only `process.env.X` and `["X"]`, name-suffix heuristic (`sources.ts:9-41`). Statement visitor covers Block/Var/Function/Return/Expr/If only (`analyzer.ts:103-159`): no loops, `try`, or `switch`. No conditional or logical expressions. Destructuring of `process.env` is ignored. |
| `dataflow/` | 6 / ~1,560 | Module graph, function summaries, cross-file taint | `dataflow.test.ts` (14) | Relative specifiers only (`resolver.ts:32-34`). Fixed 3 passes, not a fixpoint (`analyzer.ts:215`). Summaries read only top-level `VariableDeclaration` and `ReturnStatement`, and the last return wins (`analyzer.ts:311-336`). Flags **any** async function in **any** server-boundary module (including server components) as a "Server Action return" (`analyzer.ts:570-590`). |
| `discovery/` | 5 / ~380 | Recursive scan, ignores, deterministic per-file seeds | `discovery.test.ts` (14) | Skips any directory named `test`, `tests`, `e2e`, `out`, `build`, or starting with `.` (`filters.ts:159-182`, `:247`). This can hide real routes such as `app/test/`. No `.gitignore` support, although the README claims it. |
| `payload/` | 14 / ~1,900 | `fast-check` generators, shape inference, mutation strategies, budgeting | `payload.test.ts`, `fuzzing.test.ts` (25) | Param 0 only. Three inconsistent defaults (§9). Many generated values can never cross into the isolate (Date, Map, Set, BigInt, functions, `Uint8Array`), so budget is spent on `unsupported` results. `string \| null` isn't collapsed to nullable string (`inference.ts:163-185`). |
| `runtime/` | 12 / ~1,800 | Compatibility gate, prefix slicing, preludes, isolate worker | `runtime.test.ts`, `selective-*.test.ts` (55) | See §2.5 and §8.1. `unsupportedActions` is declared but **never incremented** (`executor.ts:261`). Preludes are bound **by identifier name**, not import source (`preludes/index.ts:33-35`). |
| `shrinker/` | 5 / ~450 | Signature-preserving delta reduction plus final re-verification | `shrinker.test.ts` (13) | Sound by construction: it re-runs and falls back to the original if the final check fails (`shrink.ts:88-102`). Only transferable candidates are tried. |
| `output/` | 6 / ~690 | JSON v1, SARIF 2.1.0, special-value payload serialization | `output.test.ts` (13) | SARIF path base and missing fingerprints (§2.8). Tool version hardcoded (`schema.ts:8`). `SIS005` rule defined but never emitted. |
| `reporter/` | 3 / ~640 | Terminal UX (chalk) | `cli.test.ts` (32) | "verified findings" wording. |
| `analyzer/`, `fuzzer/`, `sandbox/` | 3 / 12 | Empty placeholders | — | Dead code that ships in the package. |
| `cli.ts` | 1 / 289 | Commander front end | `cli.test.ts` | Version hardcoded (`:37`). Help text default for `--runs` is wrong (`:45`). No `--exclude-tests` or `--memory-limit` flags. |
| `benchmarks/` | 8 `.ts` / ~2,600 | Pinned corpus, acquisition, orchestration, review store, reproduce-by-fingerprint | `benchmark*.test.ts`, `ground-truth*.test.ts` (56) | Depends on a built `dist/`. Fingerprint granularity (§7). |
| `docs/` (site) | `index.html` (1,039), CSS/JS, SEO assets | GitHub Pages landing page plus Markdown guides | `site.test.ts`, `docs.test.ts` (27) | Tests are string assertions over docs. |

---

## 4. Capability verification matrix

| # | Advertised capability | Implementation | Tests | Status | Evidence / caveat |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | SWC TS/TSX parsing with source locations | `src/parser/index.ts:15-61`, `location.ts` | `parser.test.ts` | **Implemented with limitations** | **[probe]** One line containing `ñ é 漢字` shifted the next line's reported column by +6 (23 → 29). Non-ASCII text earlier in a file skews every location after it, including SARIF regions and prefix line ranges. |
| 2 | Boundary classification (client, server, route handler, server component) | `src/boundary/classifier.ts:75-216` | `boundary*.test.ts` | **Implemented with limitations** | Directive-based is HIGH confidence. Hook inference (`:26-48`) and the "anything under `app/` is a server component" rule (`:200-207`) are heuristics. No Pages Router support. |
| 3 | Server Action discovery (module-level `"use server"`) | `src/parser/boundary-visitor.ts:138-215` | `parser.test.ts`, `sis.test.ts` | **Implemented with limitations** | Aliased named exports and anonymous default exports are discovered but never execute **[probe]**. |
| 4 | Inline `"use server"` actions (`README.md:124`) | `src/boundary/visitor.ts:163-224` only | `boundary.test.ts` | **Partially implemented** | Used only for return-value analysis. Not fuzzed or executed. Nested inline actions inside components are not discovered at all. |
| 5 | Static secret taint (SIS001) | `src/taint/*` | `taint.test.ts` | **Implemented with limitations** | Intra-file, `process.env` only, name-heuristic sources, partial statement coverage. |
| 6 | Interprocedural data flow and re-exports | `src/dataflow/*` | `dataflow.test.ts` | **Implemented with limitations** | Relative imports only, no `@/` aliases. Directory mode only. 3-pass summaries. README calls it both "intra-module" (`:123`) and interprocedural. |
| 7 | React Flight serialization of props and returns (SIS002) | `src/boundary/props.ts`, `returns.ts`, `serializability.ts` | `boundary-precision.test.ts` | **Implemented with limitations, with false-positive risk** | **[probe]** `feedback` was reported as a DB connection, and a `@/`-imported client component got 0 prop edges. Unresolved identifiers default to "serializable" and are counted as `verifiedSafeProps` (`serializability.ts:143`). |
| 8 | Boundary-directed payload synthesis | `src/payload/*` | `payload.test.ts`, `fuzzing.test.ts` | **Implemented with limitations** | Param 0 only. Return and prop fuzz targets are created and counted in `fuzzTargetsDiscovered` (`src/index.ts:326`) but never used. |
| 9 | Isolated runtime execution (SIS003/SIS004) | `src/runtime/worker.ts`, `executor.ts` | `runtime.test.ts` | **Implemented with limitations** | Single-function extraction; misclassification of return-copy errors, spoofed timeouts, `ReferenceError`, and `NEXT_*` substrings (§8.1). |
| 10 | Selective Runtime Verification: prefix slicing (`README.md:201-210`) | `src/runtime/prefix.ts` | `selective-*.test.ts` (36) | **Implemented with limitations, not released** | Absent from npm `0.1.0` **[probe]**. The identifier scan doesn't distinguish property keys or member properties: `obj.db`, `{ headers: x }`, or a local `db` variable all trigger "unsupported" (`prefix.ts:82-107`). Relative imports default to reason `"cloud-sdk"` (`:41-45`). `startsWith("next")`/`("react")` also matches `next-auth`, `react-hook-form` (`:40`). |
| 11 | Deterministic framework preludes | `src/runtime/preludes/*` | `selective-verification.test.ts` | **Implemented with limitations, not released** | Bound by name regardless of import source. `cookies()` returns a fresh empty store on each call (`cookies.ts:28-29`), so state doesn't persist between calls. `Math.random` and `Date` inside the isolate are not made deterministic. |
| 12 | Failure shrinking (delta debugging) | `src/shrinker/*` | `shrinker.test.ts` | **Fully implemented** | The final re-verification guards soundness. |
| 13 | Deterministic seeding / reproducibility | `src/discovery/seeds.ts`, `payload/strategies/budgeting.ts` | `hardening.test.ts`, `performance.test.ts` | **Implemented with limitations** | Without `--seed`, the generic fallback is random. The README says the default seed is `Date.now()` (`README.md:641`), but the code leaves it `undefined`. File ordering uses ICU `localeCompare` (`scanner.ts:145`). |
| 14 | JSON output | `src/output/json.ts` | `output.test.ts` | **Fully implemented** | "verifiedFindings" label caveat. |
| 15 | SARIF 2.1.0 for CI | `src/output/sarif.ts` | `output.test.ts` | **Implemented with limitations** | Path base, no fingerprints, one result per failing payload. |
| 16 | Exit code contract 0/1/2/3/130/143 | `src/cli.ts` | `cli.test.ts` | **Partially implemented** | Code 3 is unreachable. Code 1 is triggered by heuristic findings too. |
| 17 | `.gitignore`-aware discovery (`README.md:120`) | — | — | **Not implemented** | No reference to `gitignore` in `src/`. |
| 18 | `SIS005` invariant-violation | `src/output/schema.ts:52-58` (rule metadata only) | — | **Documentation-only** | No producer anywhere in `src/`. |
| 19 | 16-hex deterministic fingerprints (`README.md:111`, `:131`) | `benchmarks/reviews.ts:56-140` | `ground-truth*.test.ts` | **Implemented in benchmarks only** | Not in CLI, JSON, or SARIF output. The README says "64-bit FNV-1a"; the code uses truncated SHA-256 (`reviews.ts:57`). |
| 20 | Ground-truth review store and `--reproduce` | `benchmarks/reviews.ts`, `run.ts:44,81` | `ground-truth*.test.ts` | **Fully implemented** | Review provenance in §7. |
| 21 | Pinned 20-repo corpus and hardened acquisition | `benchmarks/corpus.json`, `git.ts`, `validator.ts` | `benchmark-tiered-corpus.test.ts` | **Implemented** | 16 active, 4 excluded. Committed results (`latest.json`) cover only the 5 CORE repos. |
| 22 | Blind dual-reviewer protocol with Cohen's κ (`BLIND_REVIEW_PROTOCOL.md:16-120`) | — | — | **Documentation-only / unverified** | Review records carry process labels (`ground-truth-pilot`, `ground-truth-phase-24`), not reviewer identities. No κ computation appears in the data. |
| 23 | Phase 26 dependency-aware prefix verification | `benchmarks/results/phase-26-architecture.md` | — | **Documentation-only** | The doc says "Design ONLY" (line 4). |
| 24 | Configurable isolate memory limit | `RuntimeExecutionOptions.memoryLimitMb` (`src/runtime/types.ts:62`) | — | **Implemented, not exposed** | No CLI flag. `AuditOptions` has no field for it. |
| 25 | CI test gate | — | — | **Not implemented** | Only a benchmark workflow exists. |

---

## 5. Dependency inventory

### 5.1 Direct dependencies (`package.json`, lockfile v3, 123 packages total)

| Package | Declared | Locked | Used in | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `@swc/core` | `^1.16.2` | 1.16.2 | 20 files | **Native** (per-platform optional binaries plus an install script). The core of all analysis. The AST shape is coupled tightly to the SWC version: hand-written walkers depend on node `type` strings and field names. |
| `isolated-vm` | `^7.0.1` | 7.0.1 | `runtime/worker.ts` | **Native** (install script plus prebuilds only for darwin-arm64, linux-arm64, linux-x64, win32-x64). Its `engines` field is `node >=24.0.0`, which is what forces SIS's own `>=24` floor. Its README says Node ≥20 **must** be started with `--no-node-snapshot`. Neither the CLI shebang (`#!/usr/bin/env node`) nor CI passes it. It worked in this environment (Node 24.19, win32); other platforms are **unverified**. No prebuild for Alpine/musl or Windows ARM, which means a C++ toolchain is needed there. |
| `fast-check` | `^4.9.0` | 4.9.0 | `payload/generators.ts`, `synthesis.ts` | Used only through `fc.sample` with `constantFrom`. The property-testing engine itself isn't used. |
| `commander` | `^15.0.0` | 15.0.0 | `cli.ts`, `benchmarks/run.ts` | Requires `node >=22.12`. |
| `chalk` | `^6.0.0` | 6.0.0 | `reporter/*` | Requires `node >=22`. |
| `ora` | `^9.4.1` | 9.4.1 | **nothing** | **Unused runtime dependency.** It gets installed for every user. |
| `typescript` (dev) | `^7.0.2` | 7.0.2 | build | |
| `vitest` (dev) | `^5.0.0` | 5.0.0 | tests | |
| `@types/node` (dev) | `^26.4.1` | 26.4.1 | types | Types for a newer Node than the `>=24` engine floor, so APIs the minimum runtime lacks can type-check. |

### 5.2 Supply-chain and packaging observations

- **Install scripts:** `@swc/core`, `isolated-vm`, and `fsevents` (macOS, transitive). Installing SIS runs native build or download steps.
- **Licenses (lockfile):** MIT 68, Apache-2.0 27, Apache-2.0 AND MIT 11, MPL-2.0 12, ISC 4, BSD-3-Clause 1. The MPL-2.0 packages are file-level copyleft, which is compatible with MIT distribution, but worth recording.
- **Caret ranges on native packages:** a fresh `npm install` of the published package can resolve to a newer `@swc/core` minor version. Because analysis depends on exact AST shapes, that's a reproducibility risk for users. The repo itself is protected by its lockfile.
- **Reproducible build:** `tsc` is deterministic, and `npm ci` plus the lockfile is reproducible. But `dist/` is gitignored and **tests and benchmarks import `dist/`**: `test/cli.test.ts` imports from it, and `test/benchmark*.test.ts` and `test/ground-truth*.test.ts` import `benchmarks/*.ts`, which import `../dist/index.js`. On a fresh clone, `npm test` without `npm run build` should fail those suites. This is inferred from the import graph, not run. The local `dist/` was built 2026-09-14, after the last `src/` change, so it was current during this audit.
- **Package contents** (`npm pack --dry-run --ignore-scripts`): 299 files, 162 KB packed, 785 KB unpacked. 158 of those are `.map` / `.d.ts.map` files and placeholder-module files. Source maps point at `src/`, which isn't shipped.
- **Version drift:** `0.1.0` is hardcoded in `package.json`, `src/cli.ts:37`, and `src/output/schema.ts:8`.
- **No upgrades were made, as instructed.** Version numbers above are what the lockfile pins.

---

## 6. Testing architecture

- **Runner:** Vitest 5, `globals: true`, node environment, `test/**/*.test.ts` (`vitest.config.ts`).
- **Result on this machine:** **24 files, 340 tests, all passing, 9.96 s** (`npx vitest run`). `tsc --noEmit` is clean.
- **Composition (approximate tests per file):** runtime and selective verification (55), benchmark and ground-truth infrastructure (56), CLI (32), boundary and precision (20), payload and fuzzing (25), taint (15), data flow (14), discovery (14), output (13), shrinker (13), hardening (13), performance (10), parser (8), release metadata (5), and **docs/site string checks (27)**.
- **Fixtures:** `test/fixtures/` holds about 230 files, including synthetic "real-world" patterns (`real-world/*`) and performance-scale trees (`performance/large`, 100+ files).
- **Gaps relevant to the findings in this report:**
  - No test covers an action that calls a module-level helper or constant, an aliased export, an anonymous default export, a multi-parameter action, a non-clonable **return** value, a spoofed timeout message, `@/` path aliases, non-ASCII source text, or a subdirectory SARIF target. Each of these behaves incorrectly in the probes (§8).
  - `docs.test.ts` and `site.test.ts` assert that strings exist in Markdown and HTML (for example `docs.test.ts:74`, "prohibits unsupported absolute claims"). They raise the test count but don't verify behavior. The README's own test count (`README.md:855`: "284 tests across 21 suites") is already stale.
  - No coverage tooling is configured.
  - No CI runs the suite.

---

## 7. Benchmark infrastructure

### 7.1 Components

| Component | File | Assessment |
| :--- | :--- | :--- |
| Corpus manifest | `benchmarks/corpus.json` | 20 entries: 5 CORE, 12 EXTENDED, 3 ADVERSARIAL. 4 are `excluded` (openstatus, infisical, charlie-tango/next-starter, typebot). Pinned full SHAs. `dubinc/dub` appears twice (CORE and ADVERSARIAL `dub-api`, same commit). |
| Acquisition | `benchmarks/git.ts:103-185` | Good: `execFile` with no shell, non-interactive environment, `fetch --depth 1 <sha>`, checkout of `FETCH_HEAD`, verified `rev-parse HEAD`, typed failures, no full-clone fallback. |
| Orchestrator / reporter | `benchmarks/orchestrator.ts`, `reporter.ts` | Runs the built `AuditEngine` per repo and writes `results/latest.{json,md}`. |
| Review store | `benchmarks/reviews.ts`, `reviews/ground-truth.json` | 43 records. The fingerprint includes `payloadId` and `strategy` (`reviews.ts:130-140`), so it identifies a payload execution, not a defect. |
| Workflow | `.github/workflows/benchmark.yml` | `workflow_dispatch` plus a weekly cron, Node 24, `npm ci`, build, run, upload artifact. Input injection pattern at `:41-44`. No `permissions:` block. |

### 7.2 What the committed data actually supports [repo-data]

- `results/latest.json` metadata: SIS commit `52f313a`, 2026-09-14, Node v24.19.0, win32, seed 42, 10 runs, 20 ms, **5 repositories**. Aggregate: 3,804 files analyzed, 20 actions, 9 runtime failures, 0 taint, 0 serialization, wall time **25,013 ms**. The README's 32.20 s (`README.md:256`, `:283`) is from an earlier run.
- `reviews/ground-truth.json`: 9 TRUE_POSITIVE, 9 FALSE_POSITIVE, 24 FRAMEWORK_ARTIFACT, 1 UNREACHABLE, matching `README.md:216`. Breakdown:
  - **TRUE_POSITIVE (9):** all `vercel/commerce` `components/cart/actions.ts:54`, action `updateItemQuantity`, message "Cannot destructure property 'merchandiseId' of 'payload' as it is undefined." **1 unique action and line; 9 payload-level fingerprints.**
  - **FALSE_POSITIVE (9):** all SIS002. 6 are Route Handlers (`app/api/og/*`, Stripe webhook ×2) and 3 are client modals in `dubinc/dub`.
  - **FRAMEWORK_ARTIFACT (24):** all SIS003 in `dubinc/dub` across 3 files (`lib/actions/partners/force-withdrawal.ts` ×8, `lib/ai/generate-csv-mapping.ts` ×9, `lib/ai/generate-filters.ts` ×7).
  - **UNREACHABLE (1):** `playwright/api/fixtures.ts`.
- **Recomputed precision under other conventions.** These are arithmetic over the committed records, not new measurements:
  - README "emitted": 9 / (9 + 0) = 100%.
  - README "lifetime": 9 / (9 + 9) = 50%.
  - Counting framework artifacts as false alarms from a user's point of view: 9 / 42 ≈ 21%.
  - De-duplicated by action and line: 1 unique true defect against 3 + 9 + 1 = 13 unique non-true-positive locations.
  The README presents the first two. The de-duplicated view is what users experience.
- `results/phase-27-architecture.md:219-247` is labeled a **design** document (line 4), but its "Reporting Format Design" block contains concrete-looking figures (20 repos, 14 SIS003, "Emitted Precision 100.0%", "Cohen's Kappa 0.94 (Sample: 6 findings)"). They aren't marked as illustrative, so they're easy to mistake for results.

---

## 8. Technical debt and correctness risks

Ordered by impact on the trustworthiness of findings.

### 8.1 Runtime verdict integrity

| ID | Issue | Location | Evidence | Effect |
| :- | :--- | :--- | :--- | :--- |
| R1 | Errors from host-side **result** copying (`copy: true`) are classified `failed` | `src/runtime/worker.ts:71-75`, `:103-110` | **[probe]** `returnsFn` → 8× "SIS003 … ()=>1 could not be cloned." | False SIS003 for any action returning a function, class instance with methods, or other non-clonable value. Server Actions that return such values are common. |
| R2 | Timeout detected by **message substring** | `worker.ts:82` | **[probe]** `throw new Error("Script execution timed out")` → SIS004 | Spoofable misclassification. |
| R3 | Any message containing `NEXT_REDIRECT` / `NEXT_NOT_FOUND` counts as passed | `worker.ts:89-93` | **[probe]** suppressed | Should check `err.digest` or the prelude's `__sisRedirect` marker instead of the message. |
| R4 | **All** `ReferenceError`s become `unsupported` | `worker.ts:94-102` | **[probe]** a typo'd identifier is suppressed | Real application `ReferenceError`s are never reported. Combined with R5, the suppression is silent. |
| R5 | Only the action's own node is compiled into the isolate | `src/runtime/executor.ts:130-141` | **[probe]** `usesHelper` (module helper and const) is labeled FULL and yields 0 executions | Any action depending on module-scope helpers or constants is silently untested. In real code this is likely the majority of actions; the size of that majority is unmeasured. |
| R6 | Aliased export: the harness calls the exported name, but the code defines the local name | `executor.ts:50-78`, `worker.ts:62` | **[probe]** `aliased` → 0 findings; the identical non-aliased body → 4 findings | Silent loss of coverage. |
| R7 | Anonymous default export: produces `async function default(...)` / `default(__sisPayload)` | `executor.ts:80-103`, `worker.ts:62` | **[probe]** `default` labeled FULL, never executes | Silent loss of coverage. |
| R8 | Only parameter 0 is fuzzed; others are always `undefined` | `src/index.ts:118-120`, `worker.ts:62` | **[code]** | Missed bugs in later parameters, and possible spurious crashes when later parameters are dereferenced. |
| R9 | `unsupportedActions` is never incremented. Actions that fail extraction for reasons other than `static-only` aren't counted anywhere | `executor.ts:261`, `:270-277` | **[code]** | Reports understate how much was **not** verified. |
| R10 | One finding per failing payload, no grouping by signature | `src/index.ts:175-236` | **[probe]** 8× the same TypeError for `twoArgs` | Inflated counts, CI noise. This is also the root cause of §7.2's 9-for-1. |

### 8.2 Static-analysis precision and recall

| ID | Issue | Location | Effect |
| :- | :--- | :--- | :--- |
| S1 | `db` / `client` / `prisma` / `connection` substring heuristic on identifiers | `src/boundary/serializability.ts:136` | **[probe]** `feedback` → SIS002 error. Also matches `clientId`, `clients`, `dbResult`, and so on. |
| S2 | Unresolved identifiers default to `serializable` and count toward `verifiedSafeProps` | `serializability.ts:143` | The "verified safe" statistic includes values that were never checked. |
| S3 | No `tsconfig` `paths` / `@/` resolution | `src/dataflow/resolver.ts:32-34` | **[probe]** a secret passed to a `@/components` client component is missed, with 0 prop edges. Cross-file taint and prop analysis are blind in most real App Router projects. |
| S4 | "Candidate" actions = every exported async function in any non-client, non-route file | `src/boundary/visitor.ts:213-224`, `:290-296` → `returns.ts` | Library helpers (`lib/db.ts`) are judged under React Flight return rules. |
| S5 | Data-flow flags any async function in any server-boundary module (including server components) as a "Server Action return" | `src/dataflow/analyzer.ts:570-590` | Possible SIS001 false positives for internal async helpers. |
| S6 | `isServerFunction` = "declared locally" | `src/boundary/props.ts:58-61` | Passing a plain local function as a client prop is judged serializable (false negative). |
| S7 | Nested JSX recursion drops `localDecls` / `localEnv` | `props.ts:386-393` | Taint and serializability context is lost for client components nested in other JSX. |
| S8 | Taint visitor ignores loops, `try`, `switch`, and conditional or logical expressions; `const { X } = process.env` isn't a source | `src/taint/analyzer.ts:103-159`, `src/taint/sources.ts:48-105` | Recall gaps. |
| S9 | Prefix dependency scan treats every `Identifier` node as a reference, including member properties and object keys | `src/runtime/prefix.ts:82-107` | `user.db`, `{ ai: true }`, or a local variable named `kv` / `fs` / `db` forces PREFIX or STATIC_ONLY unnecessarily. |
| S10 | UTF-8 byte offsets indexed against UTF-16 strings | `src/parser/location.ts:13-49` | **[probe]** +6 column shift after one non-ASCII line. Affects every location after non-ASCII text. |

### 8.3 Engineering debt

- Duplicated single-file and directory pipelines, already drifted (§2.9).
- Two boundary visitors with different action semantics (§2.9).
- Mutable `ServerAction`, with extraction done twice per action.
- Three different "default runs" values (§9).
- Placeholder modules shipped. Unused `ora`.
- `as any` used heavily in AST walkers (`inference.ts`, `taint/analyzer.ts`, `returns.ts`). That's understandable given SWC's types, but it means SWC AST changes won't produce type errors.
- Hardcoded version in three places. No git tags or release process. `CHANGELOG.md` has only "[0.1.0] - Preparation".
- Performance: sequential execution, a new isolate per payload, and shrinking re-runs up to 30 isolates per failure. Not a problem yet; it will matter as runs and corpus size grow.

---

## 9. Documentation inconsistencies

| # | Documentation says | Code / data says | Where |
| :-: | :--- | :--- | :--- |
| D1 | `npx @aashirzayd/sis` gives you Selective Runtime Verification and preludes | Published 0.1.0 has no `prefix.js` or `preludes/` **[probe]** | `README.md:20`, `:201-210` vs. the npm tarball |
| D2 | `--runs` default `10` | No `--runs` → **25 payloads per action** (`payload/strategies/index.ts:33`). The generic path defaults to 100 (`payload/synthesis.ts:18`). `requestedRuns` is reported as 100 (`src/index.ts:146`) **[probe: 175 payloads / 7 actions]** | `README.md:637`, `src/cli.ts:45` |
| D3 | `--seed` default `Date.now()` | `undefined` (non-seeded `fast-check`; boundary variants taken in fixed order) | `README.md:641` |
| D4 | Discovery respects `.gitignore` | Not implemented | `README.md:120` |
| D5 | `cookies()` / `headers()` / `redirect()` / `notFound()` → `static-only` | After `aee77fd` these are prelude-backed and run as FULL or PREFIX | `README.md:125`, `:764`; `benchmarks/KNOWN_LIMITATIONS.md:35`, `:40` (contradicts `README.md:201-210`) |
| D6 | Host-infrastructure failures are "never an application defect" | Result-clone errors are reported as SIS003 (R1) | `README.md:32`, `:197` |
| D7 | Inline `"use server"` functions are candidate actions | Not fuzzed or executed (capability #4) | `README.md:124` |
| D8 | Fingerprints are "64-bit FNV-1a" and part of the pipeline | Truncated SHA-256 in `benchmarks/` only. Absent from CLI, JSON, and SARIF | `README.md:111`, `:131` vs. `benchmarks/reviews.ts:57` |
| D9 | Exit code 3 = engine failure | Unreachable | `README.md:656` vs. `src/cli.ts:214` |
| D10 | SIS005 is a finding class | Never emitted | `README.md:696`, `KNOWN_LIMITATIONS.md` §1 |
| D11 | "284 tests across 21 suites" | 340 tests, 24 files | `README.md:855` |
| D12 | Benchmark wall time 32.20 s | `latest.json` reports 25.0 s (later run) | `README.md:256`, `:283` |
| D13 | "9 confirmed true positives", "100% emitted precision" | 1 unique defect, 9 payload variants | `README.md:216`, `:283`, `:292` |
| D14 | Blind dual review with κ | No reviewer identities or κ in the data | `benchmarks/BLIND_REVIEW_PROTOCOL.md:16-120` |
| D15 | Phase-27 dashboard figures (precision 100%, κ 0.94) | Inside a design-only document, not labeled illustrative | `benchmarks/results/phase-27-architecture.md:219-247` |
| D16 | "Intra-module call graphs" vs. "interprocedural" cross-module analysis | Cross-module, relative imports only, directory mode only | `README.md:123` |
| D17 | Terminal/JSON "verified findings" | Includes heuristic static findings | `src/reporter/terminal.ts:511`, `src/output/json.ts:159-161` |

---

## 10. Critical unknowns

These couldn't be settled from the repository alone and should be tested empirically in later phases:

1. **How many real-world actions actually execute.** R5–R7 suggest a large share of `FULL`-labeled actions produce only `unsupported` results. `latest.json` reports `totalRuntimeCompatibleCandidates: 0`, which is suggestive but not explained. This needs a per-action breakdown on the corpus.
2. **`isolated-vm` without `--no-node-snapshot`** on Linux and macOS under Node 24 and later. It works on Windows here. The upstream README says it's required.
3. **Reachability of the generated payloads.** Real Server Action arguments arrive through React's reply decoding. Whether values such as own-`__proto__` objects, `-0`, or deeply nested arrays can arrive at an action unchanged hasn't been established. This affects how SIS003 findings should be described.
4. **Whether `fsevents` / `@swc/core` optional binaries resolve correctly** on fresh installs across platforms, and how behavior changes when a caret range pulls a newer `@swc/core`.
5. **Whether the 24 `FRAMEWORK_ARTIFACT` findings in `dubinc/dub` are now suppressed** by the selective-runtime gating (`isUpstashOrAiSdk`, `prefix.ts:235-254`), or would reappear. The fix isn't covered by a corpus-level regression run in `latest.json`.
6. **Fresh-clone test behavior** without a prior `npm run build` (inferred failure, not executed).
7. **Prefix-slicing soundness.** Statements before the cut can depend on later hoisted declarations, and the sentinel return changes the action's return contract. There's no test for semantic equivalence of the executed prefix.

---

## 11. Recommended audit priorities

Proposed order for the next phases. Each item is scoped so it can be verified with a failing test first.

1. **Release integrity (P0).** Either publish a version that matches HEAD, or mark Selective Runtime Verification as unreleased in the README. Add git tags. Derive the version from `package.json` in `cli.ts` and `schema.ts`. Remove `ora`.
2. **Runtime verdict correctness (P0).** Fix R1–R4. Classify by error identity rather than message: separate result-transfer failures from candidate errors, check the timeout by error type or code, check redirects by `digest`, and stop blanket-suppressing `ReferenceError` (only suppress when the identifier is a known unbound module dependency). Add the probe fixtures from Appendix A as regression tests.
3. **Execution coverage honesty (P0).** Fix R5–R9. Include module-scope pure declarations in the isolate (or classify the action as PREFIX or STATIC_ONLY when it depends on them), handle aliases and anonymous defaults, pass every parameter, and count every non-executed action with a reason. Report "actions actually executed" prominently.
4. **Finding de-duplication (P1).** Group runtime findings by `(file, action, failure signature)`, keep the minimized payload, and change the benchmark fingerprint to defect granularity. Re-derive the README precision figures from de-duplicated data (D13).
5. **Static precision (P1).** Remove the identifier-name heuristic (S1). Stop counting unresolved identifiers as "verified safe" (S2). Restrict return analysis to real actions (S4, S5).
6. **Real-project recall (P1).** Add `tsconfig` `paths` resolution (S3) and run data-flow analysis in single-file mode, or document that it doesn't. Fix UTF-8 to UTF-16 offset mapping (S10).
7. **CI and supply chain (P1).** Add a push/PR workflow running `npm ci && npm run build && npm test` on Linux, macOS, and Windows with Node 24. Pass `--no-node-snapshot`, or verify it isn't needed. Fix the workflow-input injection (pass inputs through `env:`), and add `permissions: contents: read`.
8. **SARIF for CI (P2).** Emit repository-relative URIs (or set `originalUriBaseIds`) and `partialFingerprints`.
9. **Architecture consolidation (P2).** Merge the two pipelines in `src/index.ts`. Unify the two boundary visitors. Break the `compatibility` ↔ `prefix` cycle by moving the constants to their own module. Delete the placeholder modules. Make `ServerAction` immutable.
10. **Documentation reconciliation (P2).** Resolve D1–D17, mark design-doc figures as illustrative, and either carry out or soften the blind-review protocol claims.

---

## Appendix A — Probe fixtures

These were built from `src/` with `npx tsc -p . --outDir <scratch>/build`. The fixtures lived in a scratch directory, not this repository. They were run with `audit(".", { silent: true, seed: 42, runs: 10 })` unless noted.

**Probe 1** — `app/actions.ts`:

```ts
"use server";
const LIMIT = 10;
function helper(x: number) { return x * 2; }
async function internal(v: { amount: number }) { return v.amount.toFixed(2); }
export { internal as aliased };
export async function usesHelper(n: number) { return helper(n) + LIMIT; }
export async function twoArgs(a: string, b: { id: number }) { return a.length + b.id.toFixed(1); }
export async function returnsFeedback(input: string) { const feedback = { text: "ok" }; return feedback; }
export async function returnsFn(x: unknown) { return () => 1; }
export async function oom(x: unknown) { const a: number[] = []; while (true) { a.push(1, 2, 3, 4, 5, 6, 7, 8); } }
export async function obviousCrash(v: { amount: number }) { return v.amount.toFixed(2); }
```

`app/page.tsx`: `import { Card } from "@/components/Card"; export default async function Page() { return <Card secret={process.env.STRIPE_SECRET_KEY} />; }`
`components/Card.tsx`: `"use client"; export function Card(props: { secret?: string }) { return <div>{props.secret}</div>; }`

Observed: every action labeled `FULL`. Findings: `twoArgs` 8× SIS003, `returnsFn` 8× SIS003 ("could not be cloned") plus 1× SIS002, `oom` 8× SIS004, `obviousCrash` 4× SIS003, `returnsFeedback` 1× SIS002 ("Database connection … 'feedback'"). `aliased` and `usesHelper`: **0 findings**. `taintViolations: 0`, `propBoundariesFound: 0`, `unsupportedExecutions: 31`, `unsupportedActions: 0`. Without `runs`, the same file generated 175 payloads for 7 actions, with `requestedRuns` reported as 100.

**Probe 2** — `app/actions.ts` (seed 1, runs 3, no shrink):

```ts
"use server";
// ñ é 漢字 non-ASCII comment
export async function asyncSpin(x: unknown) { await null; while (true) {} }
export async function spoof(x: unknown) { throw new Error("Script execution timed out"); }
export async function typo(x: { a: number }) { return undefinedThing + x.a; }
export async function redirectish(x: unknown) { throw new Error("NEXT_REDIRECT is how I hide bugs"); }
export default async function (x: { a: number }) { return x.a.toFixed(); }
```

Observed: `asyncSpin` → SIS004, so the timeout holds across `await`. `spoof` → SIS004 (misclassified). `typo`, `redirectish`, and `default` → no findings. All actions were reported at column 29 instead of 23. Single-file mode had no `propBoundariesFound` key. `audit("app")` emitted the SARIF URI `actions.ts`, and no result had `partialFingerprints`.

**Other checks:** an SWC span probe (`@swc/core` 1.16.2) confirmed spans are file-relative across repeated `parse` calls, so there's no cumulative drift, but they are UTF-8 byte offsets. An import-graph scan of `src/` found one value-import cycle (`runtime/compatibility.ts` ↔ `runtime/prefix.ts`). The npm tarball `@aashirzayd/sis@0.1.0` was downloaded to scratch and listed, not executed.
