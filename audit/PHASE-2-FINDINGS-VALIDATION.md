# SIS — Phase 2: Independent Findings Validation & Critical Defect Investigation

| | |
| :--- | :--- |
| **Audited revision** | `585af3d` (local `master`). Remote `main` is `cbd7d8e`, two commits ahead, and only adds a Code of Conduct and issue templates (no code). See V-R2. |
| **Published artifact** | `@aashirzayd/sis@0.1.0`, registry `gitHead` `71d78a1`, integrity `sha512-e7cFbX300dZG…` |
| **Date** | 2026-11-01 |
| **Environment** | Windows 11 x64, Node v24.19.0 (ABI 137), npm 11.17.0. Linux evidence comes from GitHub Actions run `40292039378` (ubuntu-24.04, Node v24.21.0). |
| **Mode** | Read-only. No source, `package.json`, or lockfile changes. No installs, publishes, commits, pushes, or tags. `audit/PHASE-1-REPOSITORY-INTELLIGENCE.md` is preserved unchanged. |

## How evidence is labeled

- **CONFIRMED**: I reproduced it independently in this phase.
- **SUPPORTED**: strong source or third-party evidence (for example a CI artifact), but I didn't reproduce it myself.
- **UNVERIFIED**: not enough evidence either way.
- **REJECTED**: the original claim is wrong.

All probes ran against `src/` compiled with `tsc` into a scratch directory. A Windows directory junction pointed that scratch directory at the existing `node_modules`; nothing was installed. Fixtures are summarized in [Appendix A](#appendix-a--probe-inventory). Third-party code (corpus repositories, the published tarball, the CI artifact) was **read**, never executed. The one exception is the published SIS CLI itself, which is the project's own code; I ran it against my own fixtures to observe what users get. Counts and classifications computed in this report are **auditor assessments**. They are not benchmark results and not ground-truth reviews.

---

## 1. Executive summary

Phase 1's major findings hold up. Several turned out **worse** than Phase 1 stated, and two minor Phase 1 claims were wrong.

**The most consequential new result: SIS's headline evidence is a harness artifact.** The benchmark's nine "confirmed true positives" (all `vercel/commerce` `updateItemQuantity`) are not nine defects, and they aren't even one independently fuzz-discovered defect. The action's signature is `updateItemQuantity(prevState, payload)`, and its first statement destructures `payload`. SIS fuzzes only argument 0 (`prevState`) and never passes argument 1, so **every payload crashes identically, whatever its value**. The CI artifact records `"parameter": "prevState"` with payloads such as `{"__proto__":{"polluted":true}}` for a crash about `payload` (V-01). SIS-generated harness behavior is being reported as a verified application defect, which is exactly what the project's core trust rule forbids.

Other high-impact results, all reproduced:

- **Infrastructure errors become SIS003 "runtime exceptions."** Examples: un-clonable return values, dynamic `import()` (isolated-vm reports "Not supported"), and isolate out-of-memory. This is happening **in the project's own weekly CI today**: `shadcn-ui/ui getAllBlocks` produced 8 SIS003 findings that are all `Error: Not supported` from `await import(...)` (V-02).
- **FULL/PREFIX execution modes are asserted without verifying that the extracted code can run.** Any dependency on module scope (helpers, constants, enums, classes, closure state), on common runtime globals (`crypto`, `URL`, `TextEncoder`, `setTimeout`, `Request`, `structuredClone`), or on function hoisting makes every execution silently `unsupported`. Both anonymous **and named** default exports never execute. A directory where nothing executes exits **0** with the action still labeled `FULL` (V-03).
- **The published npm package is commit `71d78a1`.** I rebuilt that commit and it is byte-identical to the tarball once line endings are ignored. It lacks Selective Runtime Verification **and** the Phase 23 precision fixes: a route-handler classifier and test-directory exclusion. Those fixes landed in a commit labeled `docs:` (`bba5bc7`). The published CLI reproduces the exact false-positive classes the README says were eliminated (V-04).
- **The weekly CI benchmark runs on HEAD-equivalent code and has 26 unreviewed findings in 11 clusters.** By my assessment, at most **1** cluster (clerk `syncKeylessConfigAction`) looks like a plausible input-dependent application defect. The corpus's designated **route-handler negative control (`dubinc/dub-api`) fails**: 4 SIS002 false positives, because route-handler detection depends on the audit-root-relative path (V-07).

Platform and build results: Linux x64 with Node 24 works **without `--no-node-snapshot`**. The CI artifact shows isolates actually executing code and producing runtime failures (SUPPORTED). macOS is unverified. A fresh clone **fails 5 of 24 test files (33 failing tests, 3 suites that don't load)** until `npm run build` runs (CONFIRMED). The build is deterministic, but its byte output depends on the checkout's line-ending settings, because there's no `.gitattributes`.

---

## 2. Phase 1 finding validation matrix

| Phase 1 item | Claim (abbreviated) | Phase 2 result | Phase 2 ID |
| :--- | :--- | :--- | :--- |
| Exec 1, D1 | npm 0.1.0 lacks prefix/preludes | **CONFIRMED and expanded.** It also lacks the Phase 23 precision fixes; byte-equivalent to `71d78a1`. | V-04 |
| Exec 2, §7.2, D13 | 9 TPs are one defect | **CONFIRMED and corrected.** It's one cluster, and that cluster is a harness artifact (missing argument 1), not an established defect. | V-01, V-05 |
| Exec 3, R1 | Un-clonable return becomes SIS003 | **CONFIRMED and expanded.** Also Symbol returns, `Promise<fn>`, objects with own function properties, dynamic `import()`, and OOM. | V-02 |
| R2 | Spoofed timeout message becomes SIS004 | **CONFIRMED.** The original message is also overwritten, destroying provenance. | V-06 |
| R3 | `NEXT_REDIRECT` substring counts as passed | **CONFIRMED.** Also: an error carrying a genuine `digest` but a different message is reported as a **failure**. | V-06 |
| R4 | All `ReferenceError`s suppressed | **CONFIRMED**, including an explicit `throw new ReferenceError(...)`. | V-06 |
| Exec 4, R5 | Module helper/constant use silently unexecuted | **CONFIRMED and expanded** to enums, classes, closure state, globals, and hoisting inside PREFIX. | V-03 |
| R6 | Aliased export never runs | **CONFIRMED** | V-03 |
| R7 | Anonymous default export never runs | **CONFIRMED and expanded.** Named default exports also never run (0 executions). | V-03 |
| Exec 5, R8 | Only parameter 0 fuzzed | **CONFIRMED.** It also *creates* false SIS003s and is the root cause of the benchmark TPs. | V-01 |
| R9 | `unsupportedActions` never incremented | **CONFIRMED** (always 0, even when an action has 0 executions). | V-03 |
| R10 | One finding per failing payload | **CONFIRMED.** 10 findings collapse to 2 root causes in the fingerprint probe. | V-05 |
| Exec 6, S3 | `@/` aliases unresolved; prop taint missed | **CONFIRMED** even with a `tsconfig.json` `paths` entry present. A relative-import control is detected, which isolates the cause. | V-09 |
| Exec 7, S1 | `db`/`client` name heuristic causes FPs | **CONFIRMED and expanded.** `clientId`, `feedback`, `dbResult`, `clients`, and `sandbox` are all flagged. | V-10 |
| S2 | Unresolved identifiers counted "verified safe" | SUPPORTED (`serializability.ts:143`); `verifiedSafe` increments in probes | V-10 |
| S4 | Candidate actions in utility files | **CONFIRMED** (non-`"use server"` `src/utils/upload.ts` flagged; also seen in CI on midday) | V-15 |
| S5 | Async helper in server component treated as action return | **CONFIRMED.** The genuine leak at the JSX sink is missed while the helper line is reported. | V-14 |
| S6 | Local function prop judged serializable | **CONFIRMED** (`onPick={handle}` not flagged) | V-14 |
| S7 | Nested JSX drops env | SUPPORTED (source). Not isolated by probe. | V-14 |
| S8 | Taint statement coverage gaps | **CONFIRMED** (`try`, conditional JSX, `const { X } = process.env`, `??` all missed) | V-14 |
| S9 | Prefix scanner treats property names as dependencies | **CONFIRMED** (`x.db` and a local `kv` force STATIC_ONLY) | V-13 |
| S10 | UTF-8 vs UTF-16 offsets | **CONFIRMED and expanded.** Wrong **line** numbers, and a BOM off-by-one. | V-12 |
| §2.2 | Single-file mode skips data-flow/prop/return | **CONFIRMED** (same file: directory mode finds a taint violation; single-file finds none) | V-20 |
| §2.8 | SARIF relative to audit root; no fingerprints | **CONFIRMED** (`og/route.tsx` URI; no `partialFingerprints` in `src/output/`) | V-17 |
| §2.7, D9 | Exit code 3 unreachable | **CONFIRMED** (no `new ExecutionError` in `src/`) | V-16 |
| D10 | SIS005 never emitted | **CONFIRMED** (0 producers) | V-16 |
| D2 | `--runs` default mismatch | **CONFIRMED** (25 payloads per action without `--runs`; `requestedRuns` reported as 100) | V-19 |
| §5.1 | `ora` unused | **CONFIRMED** (0 imports in `src/`, `benchmarks/`, `test/`) | V-25 |
| §5.1 | "No prebuild for Alpine/musl" | **REJECTED.** isolated-vm 7.0.1 ships musl prebuilds for linux-x64 and linux-arm64. | V-R1 |
| Header | Local `master` identical to `origin/main` | **REJECTED (stale ref).** Remote is +2 non-code commits. | V-R2 |
| §5.2, Unknown 6 | Fresh clone tests fail before build | **CONFIRMED and expanded** (also `performance.test.ts` and `release.test.ts`) | V-11 |
| Unknown 2 | `--no-node-snapshot` may be required | **Linux x64: not required in practice (SUPPORTED by CI). macOS: UNVERIFIED.** | §6 |
| Unknown 5 | Are the 24 framework artifacts still emitted? | **SUPPORTED: no.** `dubinc/dub` emits 0 findings in CI at HEAD. A new artifact class (dynamic import) has appeared instead. | V-02 |
| Unknown 7 | Prefix soundness | **CONFIRMED defect** (hoisted function cut away; helpers missing) | V-03 |
| Unknown 3 | Payload reachability | **Partially resolved.** Isolate transfer is faithful (own `__proto__`, `-0`, `NaN`, `undefined` members, sparse arrays). Whether real Server Action reply decoding can deliver these values is still UNVERIFIED. | §12 |
| — | Cumulative SWC span drift across print/transform calls (tested hypothesis) | **REJECTED.** Spans unchanged after 50 interleaved cycles. | V-R3 |
| §2.4 | Workflow input injection | SUPPORTED (static). Not executed, as instructed. | V-18 |
| §2.9 | `compatibility` ↔ `prefix` cycle; duplicated pipeline; two visitors | SUPPORTED (source, and an import-graph scan in Phase 1) | V-25 |

---

## 3. Independently reproduced defects

Format: **ID — title** · Severity · Confidence · Evidence label. Line numbers are at `585af3d`.

### V-01 — Only argument 0 is supplied; multi-parameter actions produce fabricated SIS003s · **P0** · High · CONFIRMED

- **Source:** `src/index.ts:118-120`, `:457-459` (only the first `server-action-argument` target is used). `src/runtime/worker.ts:58-64` (`return await ${actionName}(__sisPayload)`). `src/payload/targets/extractor.ts:36-53` (per-parameter targets are created and then ignored).
- **Root cause:** the harness models a Server Action as a unary function. React's `useActionState` / form-action convention is `(prevState, payload)`, and SIS never passes argument 1, so it is always `undefined`.
- **Reproduction:**
  1. Probe `p2/full/c08_two_params.ts`: `act(state, x)` dereferences `x` → 5 of 5 executable payloads `failed: TypeError`, giving 5 SIS003 findings.
  2. Probe `p2/fp`: a commerce-shaped action gives 9–11 findings, all on `parameter: prevState`.
  3. CI artifact for run `40292039378`: commerce finding `"parameter":"prevState"`, `"payload":{"__proto__":{"polluted":true}}`, message "Cannot destructure property 'merchandiseId' of 'payload' as it is undefined." The pinned source confirms the signature: `vercel/commerce@3761e52 components/cart/actions.ts`, `updateItemQuantity(prevState: any, payload: {…})` with `const { merchandiseId, quantity } = payload;` as the first statement.
- **Actual:** crashes caused by SIS omitting arguments are reported as "verified" runtime exceptions, attributed to whichever input SIS happened to fuzz.
- **Expected:** every declared parameter gets a value. Defaults should be shape-valid; fuzz one parameter at a time while the others hold valid baselines. If an omitted argument causes the crash, the finding must say so explicitly (as a separate "missing-argument robustness" class) and must not attribute it to the fuzzed parameter's payload.
- **Impact:** it fabricates findings in common Next.js action shapes, and it is the root cause of 100% of the benchmark's "confirmed true positives."
- **Correction:** multi-argument harness, with per-parameter fuzzing against baseline values for the rest. Record `arguments[]` in provenance.
- **Regression test:** a two-parameter action whose body only dereferences parameter 1 must yield 0 SIS003 when parameter 1 receives a shape-valid baseline, and the reported `parameter` must equal the parameter whose mutation triggered the crash.

### V-02 — SIS/isolate infrastructure errors are classified as application runtime exceptions · **P0** · High · CONFIRMED

- **Source:** `src/runtime/worker.ts:71-75` (`copy: true` result transfer inside the same `try` as candidate execution), `:103-110` (catch-all becomes `failed`), `:112-119`.
- **Root cause:** a single `try/catch` covers candidate execution, result cloning, and isolate disposal. The classification has no notion of where an error came from.
- **Reproduction** (`p2/runtime/verdicts.mjs`, which calls `runInIsolate` directly):

  | Candidate behavior | Status | Error |
  | :--- | :--- | :--- |
  | `return () => 1` | `failed` | `TypeError: () => 1 could not be cloned.` |
  | `return { cb() {} }` | `failed` | `TypeError: cb() {} could not be cloned.` |
  | `return Symbol('s')` | `failed` | `TypeError: Unsupported type` |
  | `return Promise.resolve(() => 1)` | `failed` | `TypeError: () => 1 could not be cloned.` |
  | `await import('./x')` | `failed` | `Error: Not supported` |
  | OOM under memory limit | `failed` | `Error: Isolate was disposed during execution due to memory limit` |
  | `throw { code: 42 }` | `failed` | isolated-vm-authored text ("An object was thrown … not an instance of Error") replaces the app's value |

  Live in CI: `shadcn-ui/ui apps/v4/lib/blocks.ts getAllBlocks` gives **8× SIS003 `Error: Not supported`**. The first statement is `await import("@/registry/__index__")` (source fetched at `460ad60`).
- **Actual:** SIS003 "verified" findings for conditions SIS itself created.
- **Expected:** these outcomes should be classified as `harness-error` / `unsupported` with a reason. The value an action returns should be serialized **inside** the isolate (for example with a structured-clone check or a Flight-compatibility check) and reported as data, never as a thrown error. OOM should be a separate resource outcome labeled with the configured limit.
- **Impact:** it directly violates the README's core trust rule (`README.md:197`), and it's present in active CI output.
- **Correction:** separate the execution phases (compile, run, settle, transfer). Tag errors by phase. Serialize the action's return value inside the isolate. Treat `import()` and dynamic `require` as dependencies in prefix analysis.
- **Regression tests:** one fixture per row above. Each must produce **no** SIS003 and must produce an explicit unsupported or harness reason.

### V-03 — FULL/PREFIX labels are asserted without proving the extracted code is executable · **P0** · High · CONFIRMED

- **Source:**
  - `src/runtime/executor.ts:130-141`: only the action node is printed.
  - `:50-78`: alias. The harness calls the exported name while the code defines the local name.
  - `:80-103` and `:163-165`: default exports. The synthetic node fails and a silent `return null` follows.
  - `:261`: `unsupportedActions` is never incremented.
  - `:270-277`: failed extractions are dropped uncounted.
  - `:307-309`: `execution-error` is folded into `unsupported`.
  - `src/runtime/prefix.ts:452-465`, `:501-502`: the prefix is sliced by statement index, ignoring hoisting.
  - `src/runtime/compatibility.ts:136-161`: a denylist of names. There is no model of which globals the isolate actually provides.
- **Root cause:** an execution mode is a *prediction* from a syntactic denylist scan. It is never checked against what actually happened at runtime, and nothing computes the set of bindings the function needs.
- **Reproduction** (`p2/full/run.mjs`, 6 payloads per action):

  | Shape | Mode reported | Executions |
  | :--- | :--- | :--- |
  | module helper / class / closure `let` / `crypto.randomUUID()` | FULL | 5/5 `unsupported:ReferenceError` |
  | module constant | FULL | crashes only on inputs that fail *before* the constant is read; valid inputs give `ReferenceError` |
  | aliased export | FULL | 5/5 `ReferenceError` |
  | anonymous default / **named** default | FULL | **0 executions, uncounted** |
  | calls a sibling exported action | FULL | 5/5 `ReferenceError` |
  | PREFIX whose prefix calls a module helper | PREFIX | 5/5 `ReferenceError` |
  | PREFIX using a function declared later in the body (hoisted) | PREFIX | 5/5 `ReferenceError` |

  Globals missing in the isolate (each gives `unsupported:ReferenceError`): `setTimeout`, `URL`, `TextEncoder`, `Request`, `structuredClone`, `crypto`. `console` is present.

  CLI: a directory containing only `act()` calling a module helper gives exit **0**, `executions: 0`, `unsupportedExecutions: 25`, action `FULL`, `unsupportedActions: 0`.
- **Actual:** "FULL" today means "no denylisted identifier was seen in the action's own AST." It does **not** mean the code ran, that its bindings were present, or that any payload reached the end of the function.
- **Expected:** a mode contract based on what was observed (see the proposal below), with vacuous runs surfaced and not counted as clean.
- **Impact:** false assurance. Users get "clean" results for code that was never exercised. In typical real-world code this is likely the dominant outcome, though how dominant is unmeasured.
- **Correction:** compute each action's free variables. Bundle pure module-scope declarations transitively. Classify the action from the bindings that remain unresolved. Model the globals the isolate provides. Post-classify the mode from the execution histogram.
- **Regression tests:** each row above must either execute (status `passed` or `failed`, never `unsupported`) or be labeled with a non-executing mode that names the unresolved bindings. A directory with zero completed executions must not exit 0 silently; the exact behavior needs a maintainer decision (Decision 4).

**Proposed execution-mode contract** (for maintainer decision):

| Mode | Must hold |
| :--- | :--- |
| `FULL` | Every free variable of the action is resolved: bundled pure module declarations, provided isolate globals, or declared preludes. At least one payload executed to completion or raised an error attributed to the candidate. |
| `PREFIX` | The executed prefix is closed under hoisting and has resolved bindings. The cut point and the reason are recorded. Same execution requirement as FULL. |
| `ATTEMPTED_UNRESOLVED` (new) | Static analysis predicted the action runnable, but every execution hit an unresolved binding or a harness error. Reported as **not verified**, with the binding names. |
| `STATIC_ONLY` | No execution was attempted. The reason is a concrete dependency, not a name match. |
| `UNSUPPORTED` / `NOT_EXTRACTED` | Discovered but not extractable. Always counted and reported. |

### V-04 — Published npm package diverges from repository HEAD and README · **P1** · High · CONFIRMED

- **Evidence:**
  - Registry: `versions: ["0.1.0"]`, published 2026-09-10T21:22:32Z, `gitHead: 71d78a1`, **no provenance attestation**, 1 registry signature, 271 files.
  - `git archive 71d78a1` rebuilt with `tsc` gives `dist/`, `package.json`, and `README.md` **identical to the tarball** modulo CRLF (`diff -rq --strip-trailing-cr`).
  - `71d78a1..HEAD` touches 30 `src/` files (+2014/−130) in two commits: `aee77fd` (Selective Runtime Verification) and **`bba5bc7` "docs: …", which actually adds `src/boundary/classifier.ts` (216 lines), test-directory exclusion, and cloud-SDK gating.**
  - There are no tags, local or remote, and no GitHub releases.
- **Behavioral gap:** I ran the same fixture through the published CLI and the HEAD CLI (`p2/fx-release`):
  - **Published:** SIS002 on an OG `route.tsx` `GET`, and SIS002 on `playwright/fixtures.ts`, the exact FP classes the README says were fixed. The action using `cookies()` was not executed.
  - **HEAD:** neither FP. The action runs in FULL mode.
- **Expected:** the README describes what `npx @aashirzayd/sis` delivers, or clearly marks unreleased behavior. Versions and tags should match published artifacts.
- **Impact:** users of the only published version get the pre-fix precision profile while reading post-fix claims. Benchmark claims (Phase 23+) aren't reproducible with the published package.
- **Correction:** release decision (Decision 1). Tag `v0.1.0` at `71d78a1`. Publish from CI with `--provenance`. Use conventional commit types accurately.
- **Regression test:** a release-job check that `npm pack` output equals the CI build of the tagged commit, and that the package version is greater than the last published version.

### V-05 — Benchmark finding identity and precision overstate evidence · **P1** · High · CONFIRMED

- **Source:** `benchmarks/reviews.ts:87-110` (the fingerprint hashes `payloadId`, `strategy`, `category`), `:371-373` (precision = TP/(TP+FP), with `FRAMEWORK_ARTIFACT` excluded), `benchmarks/orchestrator.ts:59` (`verifiedFindings: findings.length`, i.e. raw instances).
- **Reproduction** (`p2/fp/fp.mts`, using the real `findingToReviewRecord`):
  - Identical config gives identical fingerprints (10/10).
  - `--runs 12` gives a superset (10/10 retained).
  - **A seed change retains 1/10.**
  - 10 findings correspond to only 3 distinct (action, line, message) triples and 2 root causes. The clerk-shaped action alone yields separate fingerprints for "…is undefined." and "…is null."
- **Historical store (43 records), my clustering:** 16 location/signature clusters, attributable to 4 SIS root causes:
  - route-handler misclassification: 6 FP
  - client-boundary / prop misclassification: 3 FP
  - unsuppressed framework `ReferenceError`: 24 artifacts across 3 actions
  - the V-01 harness artifact: 9 "TP", 1 cluster
- **Current CI (26 raw):** 11 clusters (§8).
- **Impact:** reported precision ("100% emitted", "50% lifetime") is computed over duplicated, payload-level instances. Excluding framework artifacts removes SIS defects from the denominator. Fingerprints can't serve as defect identities across configurations.
- **Correction:** adopt the four-level taxonomy in §8. Fingerprint at the cluster level. Report precision per cluster and per independent defect, with artifacts counted as SIS false alarms.
- **Regression test:** two seeds over the same corpus produce the same cluster fingerprints. N failing payloads for one crash produce exactly one cluster.

### V-06 — Verdicts are derived from error-message substrings · **P1** · High · CONFIRMED

- **Source:** `src/runtime/worker.ts:82-88` (timeout detection by substring, then the message is **overwritten**), `:89-93` (redirect and notFound by substring), `:94-102` (every `ReferenceError` becomes `unsupported`).
- **Reproduction** (`verdicts.mjs`):
  - `throw new Error('Script execution timed out')` → `timeout`.
  - `throw new TypeError('upstream: Script execution timed out after 5s')` → `timeout`, with the message replaced by "…after 50ms execution budget."
  - `throw new Error('NEXT_REDIRECT is how I hide bugs')` → `passed`.
  - An error with `digest = 'NEXT_REDIRECT;/a'` but a different message → `failed` (a false positive for re-thrown redirects).
  - A `undefinedThing` typo → `unsupported`.
  - An explicit `throw new ReferenceError('domain ref missing')` → `unsupported`.
  - Genuine sync and async timeouts → `timeout` (correct; the isolated-vm deadline does cover execution after `await`).
- **Expected:** classify timeouts by the isolate's termination signal (catch at the `script.run` boundary and distinguish by error identity). Classify redirect and notFound by the prelude marker or `digest`. Classify `ReferenceError` as unsupported **only** when the missing name is in the action's computed unresolved-binding set (V-03).
- **Impact:** both false negatives (real bugs hidden) and false positives, plus loss of error provenance.
- **Regression test:** each of the eight cases above with its expected status, and the original message preserved in the output.

### V-07 — Route-handler exemption depends on audit-root-relative paths; the corpus negative control fails · **P1** · High · CONFIRMED

- **Source:** `src/boundary/classifier.ts:54-61` (regex requires an `app/` segment), `src/boundary/returns.ts:36-41` (exemption), `src/boundary/visitor.ts:213-224` (other exported async functions become "candidate" actions). Paths are relative to the audit root (`src/discovery/scanner.ts:95`).
- **Reproduction:** auditing `p2/static/api` (`og/route.tsx` exporting `GET` that returns `new ImageResponse(...)`) gives SIS002 "Server Action "GET" returns non-serializable value." In CI, `dubinc/dub-api` has `targetDir: apps/web/app/api`, and the corpus notes describe it as a slice that "verif[ies] negative control filters". It produces **4 SIS002 FPs** (`og/analytics`, `og/avatar/[[...seed]]`, `og/program/categories`, `og/program`).
- **Expected:** route-handler classification uses the path relative to the project root (the nearest `next.config.*` / `package.json`), not the audit root. CI should fail when a designated negative control produces findings.
- **Impact:** a known-fixed FP class regresses whenever users audit a subdirectory, and the benchmark's own guard didn't catch it.
- **Regression test:** auditing `app/api` and `app` must give identical route-handler classifications, with 0 findings for the OG fixture.

### V-08 — Action discovery misses common export shapes · **P1** · High · CONFIRMED

- **Source:** `src/parser/boundary-visitor.ts:124-133` (indexes only top-level `async function` declarations), `:166-183` (initializers must be an arrow or function expression), `:40-42` (only module-level `"use server"`).
- **Reproduction** (`p2/full`): `const act = async () => {}; export { act };` → **NOT DISCOVERED**. `export const act = withAuth(async (x) => {...})` (the higher-order wrapper pattern used by `next-safe-action` and similar libraries) → **NOT DISCOVERED**. Inline `"use server"` actions nested in components are not discovered for execution (Phase 1, capability #4).
- **Impact:** silent false negatives. Neither runtime nor return analysis sees these actions.
- **Correction:** resolve export specifiers to any binding kind, unwrap call-expression initializers whose argument is a function, and unify with `NextBoundaryVisitor`.
- **Regression test:** each shape is discovered with the correct name and executes.

### V-09 — Path aliases (`tsconfig` `paths`, `@/*`) unresolved · **P1** · High · CONFIRMED

- **Source:** `src/dataflow/resolver.ts:32-34` returns `undefined` for every non-relative specifier. There are no `tsconfig` references in `src/`.
- **Reproduction:** `p2/static/alias` (with a `tsconfig.json` mapping `@/*`) gives **0 prop edges and 0 findings** for `<Card secret={process.env.STRIPE_SECRET_KEY} />`. The identical relative-import control `p2/static/rel` gives 1 edge and 1 SIS001.
- **Classification:** genuine false negative. Cross-module taint and prop serialization are blind for alias imports, which are the default style in `create-next-app`.
- **Regression test:** the alias fixture yields the same findings as the relative control.

### V-10 — Identifier-name heuristic creates SIS002 errors; unresolved names count as "verified safe" · **P1** · High · CONFIRMED

- **Source:** `src/boundary/serializability.ts:136` (substring match on `db`/`prisma`/`client`/`connection`), `:143` (fallback `serializable`).
- **Reproduction** (`p2/static/heur`): returning `clientId`, `feedback`, `dbResult`, `clients`, or `sandbox` gives 5× SIS002 "Database connection / server-only instance". The control `value` isn't flagged.
- **Classification:** genuine false positives at `error` severity, which drive exit 1. The fallback also inflates `verifiedSafeProps`.
- **Correction:** remove the name heuristic. Use type information or import provenance (a value created by an ORM client import), or return `unknown`.
- **Regression test:** none of the five names are flagged; an actual `new PrismaClient()` return is.

### V-11 — Tests depend on generated `dist/`; there is no CI test gate · **P1** · High · CONFIRMED

- **Reproduction:** `git clone` of `585af3d` into scratch, linked `node_modules`, `npx vitest run` without building:
  - **Test Files 5 failed | 19 passed; Tests 33 failed | 272 passed (305)**.
  - `benchmark.test.ts`, `ground-truth.test.ts`, and `performance.test.ts` fail to load: `Cannot find module '../dist/index.js'` from `benchmarks/orchestrator.ts:6`, `benchmarks/reviews.ts:6`, and `test/helpers/perf-harness.ts`.
  - `cli.test.ts` has 31 failures and `release.test.ts` 2, all `ENOENT dist/cli.js`.
  - After `tsc`: 24/24 files, 340/340 tests pass.
- **Also:** the only workflow is the benchmark (dispatch plus weekly cron). `package.json` has no `pretest` or `prepublishOnly`, and `prepack` builds but doesn't test, so a package can be published with failing tests.
- **Correction:** a `pretest` build, or import `src/` via Vitest. Add a push/PR workflow (§11).
- **Regression test:** CI job "fresh clone → `npm ci` → `npm test`" without a prior build.

---

## 4. Root-cause analysis

The 20+ symptoms trace back to seven architectural root causes:

| # | Root cause | Symptoms |
| :- | :--- | :--- |
| RC-1 | **Unary invocation model.** A Server Action is assumed to be `f(payload)`. | V-01; the benchmark TP cluster; `parameter` misattribution. |
| RC-2 | **No error-provenance model.** One `try/catch` covers compile, run, settle, and transfer; verdicts come from message text. | V-02, V-06; OOM, import, and clone errors as SIS003; message overwrite. |
| RC-3 | **Execution mode is a syntactic prediction, never reconciled with observed outcomes.** A denylist of names, with no free-variable analysis and no model of isolate globals. | V-03, V-13; vacuous FULL; false STATIC_ONLY on `x.db`; mislabeled reasons. |
| RC-4 | **Path semantics relative to the audit root.** Path-based conventions are evaluated on audit-root-relative paths. | V-07, V-17 (SARIF URIs), V-15 (`app/**` server-component heuristic). |
| RC-5 | **Module resolution limited to relative specifiers.** | V-09; missing prop edges; missing cross-file taint; incomplete module graph. |
| RC-6 | **Two divergent definitions of "action" and "client module."** `BoundaryVisitor` vs `NextBoundaryVisitor`; client-ness isn't propagated through imports. | V-08, V-15, V-14. |
| RC-7 | **Finding identity = execution instance.** No clustering; fingerprints include payload-ordering fields. | V-05, V-17 duplicate SARIF results, benchmark precision inflation. |

---

## 5. Related defects discovered in Phase 2

### V-12 — Source locations wrong after non-ASCII text, including wrong lines · **P2** · High · CONFIRMED
- **Source:** `src/parser/location.ts:13-49` maps SWC UTF-8 byte offsets onto UTF-16 indices.
- **Probe:** `p2/loc/loc.mjs`, measuring the reported location of the action identifier.

  | Preceding content | Expected | Reported |
  | :--- | :--- | :--- |
  | 6 accented chars | 3:23 | 3:29 |
  | 4 CJK chars | 3:23 | 3:31 |
  | 3 emoji | 3:23 | 3:29 |
  | **40 CJK chars** | **4:23** | **5:48** (wrong line) |
  | string literal `"ñññññ"` | 3:23 | 3:28 |
  | **BOM** | 3:23 | **3:22** |
  | CRLF | 3:23 | 3:23 (OK) |
- **Impact:** wrong SARIF regions, wrong prefix line ranges (`verifiedPrefix`), wrong `stoppedAt.line`, and wrong benchmark fingerprints (line is a fingerprint input). Presentation-level, but it also corrupts identity.
- **Correction:** build the line table over UTF-8 byte offsets (`Buffer.byteLength` per line), or convert byte offsets to UTF-16 once. Handle the BOM explicitly.
- **Test:** the table above as a parameterized test.

### V-13 — Prefix dependency scanner over-approximates, and reasons are mislabeled · **P2** · High · CONFIRMED
- **Source:** `src/runtime/prefix.ts:82-107` (every `Identifier` node, including member properties and object keys), `:41-45` (non-framework imports default to `"cloud-sdk"`), `:40` (`startsWith("next")`).
- **Probe results:**
  - `x.db` → STATIC_ONLY (`db`/unsupported-runtime).
  - A local `const kv = …` → STATIC_ONLY.
  - A relative `./lib` import → STATIC_ONLY with reason `cloud-sdk`.
  - `next-auth` → `framework-boundary`.
  - In CI, commerce's `getCart` (from `lib/shopify`, a project module) is labeled `cloud-sdk`.
- **Test:** property access and local shadowing don't stop execution; reasons match the import kind.

### V-14 — Taint and prop analysis: missed leaks and misplaced reports · **P2** · High · CONFIRMED
- **Source:** `src/taint/analyzer.ts:103-159`, `src/taint/sources.ts:48-105`, `src/boundary/props.ts:58-61`, `:386-393`, `src/dataflow/analyzer.ts:570-590`.
- **Probe** (`p2/static2`):
  - Secrets inside `try`, conditional JSX, `const { AUTH_SECRET } = process.env`, and `?? ""` are **all missed**. Only direct JSX use is found.
  - In a server component, `const k = await getKey(); <Card label={k} />` (the real leak, line 6) is **missed**. Instead, SIS001 is reported at the helper `getKey` (line 2) with "reaches client-side code".
  - `<Card onPick={handle} />` with a plain local function is **not** flagged.
- **Test:** each pattern produces exactly one finding at the sink location.

### V-15 — Client boundary isn't inherited through imports; utilities are treated as actions · **P2** · High · CONFIRMED
- **Source:** `src/boundary/classifier.ts:26-48`, `:200-207`; `src/boundary/props.ts:34-37`; `src/boundary/visitor.ts:213-224`.
- **Probe** (`p2/static/inherit`, `util`):
  - A component imported **only** by a `"use client"` module, using a custom hook, passing `onClick` to a client child → SIS002 FP.
  - A non-`"use server"` `src/utils/upload.ts` returning `new Promise(...)` → SIS002 "Server Action … Class instance new Promise()". (An `async` function returning a Promise is fine; the Promise is awaited.)
- **Live in CI:** midday gives 3 FPs of these classes (`enablebanking-connect.tsx`, `gocardless-connect.tsx`, `utils/upload.ts`).
- **Test:** client-ness propagates through the import graph; only real actions are judged under Flight return rules; `Promise` returns are unwrapped.

### V-16 — Exit-code contract inconsistencies · **P2** · High · CONFIRMED
- **Source:** `src/cli.ts:207-215`, `src/index.ts:614-630`.
- **Probe** (`p2/exit`):
  - A directory where **every file fails to parse** → exit **0** (JSON shows `analysisErrors: 1`, `filesAnalyzed: 0`). A single unparseable file → exit 2.
  - A directory with only unexecutable actions → exit 0 (V-03).
  - A single `.md` file → exit 0.
  - `--runs 1.9` is accepted as 1 (`parseInt`). `--seed 1e20` is accepted silently.
  - Exit 3 is unreachable. SIS005 has no producer.
- **Test:** an exit-code matrix covering these cases.

### V-17 — SARIF unsuitable for code-scanning ingestion · **P2** · High · CONFIRMED
- **Source:** `src/output/sarif.ts:25-37` (URI relative to the audit root with `%SRCROOT%`); no `partialFingerprints`; one result per failing payload.
- **Effect:** misplaced GitHub annotations when auditing a subdirectory, and alert churn between runs.

### V-18 — Benchmark workflow: input interpolation into shell, implicit token scope · **P2** · Medium · SUPPORTED (not executed)
- **Source:** `.github/workflows/benchmark.yml:43-48`. `github.event.inputs.repo`, `runs`, and `seed` are interpolated directly into a `run:` script. There's no `permissions:` block, and `actions/checkout@v4` persists credentials by default.
- **Exploitability:** `workflow_dispatch` requires write access, so this is defense-in-depth rather than an external attack path. The repository's default token permissions **could not be read**: the `gh` identity `NomiqAI` returned HTTP 403, so the token's actual scope is UNVERIFIED.
- **Correction:** pass inputs through `env:` and validate them (`^[0-9]+$`, an allowlist of corpus names). Add `permissions: contents: read` and `persist-credentials: false`.

### V-19 — Default `--runs` and seed semantics don't match the docs · **P2** · High · CONFIRMED
- `src/payload/strategies/index.ts:33` (25), `src/payload/synthesis.ts:18` (100), `src/index.ts:146` (reports 100). The README and `src/cli.ts:45` say 10. The README says the seed defaults to `Date.now()`; the code leaves it unseeded. Probe: 175 payloads for 7 actions.

### V-20 — Single-file mode silently omits analysis stages · **P2** · High · CONFIRMED
- `src/index.ts:73-336` vs `:638-702`. Same fixture: directory mode gives SIS001; `audit app/page.tsx` gives none, with no notice.

### V-21 — Platform admissibility wider than prebuilt support · **P2** · Medium · SUPPORTED
- `engines: >=24.0.0` (inherited from isolated-vm). isolated-vm prebuilds exist only for ABI 137 (Node 24) and 147, on darwin-arm64, linux-x64/arm64 (glibc and musl), and win32-x64. **Node 25 and darwin-x64 / win32-arm64 need a native toolchain at install time.** The CI log shows the isolated-vm install script running (`node-gyp-build … || node-gyp rebuild`).

### V-22 — Benchmark aggregation semantics and documentation tests are weak · **P2** · High · CONFIRMED
- `benchmarks/orchestrator.ts:40-42`: `runtimeCompatibleCandidates` counts FULL **labels**, not executions. `:56`: `runtimeFailures` counts executions. `:59`: `verifiedFindings` counts raw instances.
- `test/docs.test.ts:133-136` asserts README `toContain(String(n))` for small integers such as `"9"` and `"20"`, which any README trivially satisfies.
- The committed `latest.json` (5 repos, Windows, 9 findings) doesn't match the CI artifact (16 repos, Linux, 26 findings). The CI results aren't committed or reviewed.

### V-23 — Prelude semantics · **P3** · Medium · SUPPORTED
- Bound by name regardless of import source (`src/runtime/preludes/index.ts:33-35`). `cookies()` returns a fresh empty store per call (`cookies.ts:28-29`). A digest-carrying redirect is misclassified (V-06).

### V-24 — Unhandled rejection semantics · **P3** · Low · CONFIRMED behavior, semantics UNVERIFIED
- A fire-and-forget `Promise.reject(new Error('lost'))` after which the action returns normally is reported as `failed`. Whether that is an application defect is a policy question (Decision 6).

### V-25 — Maintainability · **P3** · High · CONFIRMED / SUPPORTED
- `ora` unused. Version hardcoded in 3 places. Placeholder modules shipped. A `compatibility` ↔ `prefix` value cycle. Duplicated single-file and directory pipelines. Commit `bba5bc7` mislabeled `docs:`. No `.gitattributes`, so byte-level build output depends on `core.autocrlf` (two builds of the same checkout hash identically, `49641d02…`; they differ from the local `dist/` only by CR).

### Rejected / corrected Phase 1 claims

- **V-R1:** "No prebuild for Alpine/musl" is **REJECTED**. musl prebuilds exist for linux-x64 and linux-arm64.
- **V-R2:** "local `master` identical to `origin/main`" is **REJECTED**. The local `origin/main` ref was stale; remote `main` is `cbd7d8e` (+2 commits: `CODE_OF_CONDUCT.md`, issue templates; no code).
- **V-R3:** cumulative SWC span drift across interleaved `parse`/`printSync`/`transformSync` is **REJECTED** (unchanged after 50 cycles). Location errors come only from V-12.
- **Phase 1's "1 unique true defect"** for commerce is **corrected**. It's one cluster whose crash SIS induced by omitting an argument (V-01). Whether a real client can trigger the same crash, by deliberately calling the action with one argument, is a reachability question SIS didn't establish.

---

## 6. Platform compatibility investigation

| Platform | Evidence | Status |
| :--- | :--- | :--- |
| **Windows x64, Node 24.19** | Full test suite passes. Every probe in this report ran here without `--no-node-snapshot`. Thousands of isolates created and disposed; OOM recovery works. | **CONFIRMED** |
| **Linux x64 (ubuntu-24.04), Node 24.21** | GitHub Actions run `40292039378` (2026-10-26, `cbd7d8e`): `npm ci` and the build succeeded; 16/16 repos completed; **19 runtime failures and 6 FULL-labeled actions** in the artifact. Isolates compiled and executed code that threw. That is direct evidence of working execution without `--no-node-snapshot`. Five consecutive weekly runs succeeded. | **SUPPORTED** (third-party run, not reproduced by me). Only the benchmark ran; **the test suite has never run on Linux**. |
| **Linux arm64 / musl** | Prebuilds present (ABI 137, glibc and musl). | UNVERIFIED |
| **macOS arm64** | Prebuild present. No execution evidence. | **UNVERIFIED** |
| **macOS x64, Windows arm64, Node 25** | No prebuild; requires node-gyp and a compiler. | UNVERIFIED; install friction expected |
| **`--no-node-snapshot` requirement** | isolated-vm README: "must pass … for Node 20.x or later". It isn't needed for the operations SIS uses on Windows or Linux x64 under Node 24, but neither the upstream rationale (snapshot-related crashes) nor long-run stability has been tested. | Partially resolved |

**Why Linux wasn't verified locally:** WSL Ubuntu and Docker are available on this machine, but WSL has no Node, and running SIS there requires Linux-native `@swc/core` binaries via `npm ci`. Both are forbidden in this phase.

**Proposed reproducible CI test:** a matrix of `{ubuntu-latest, ubuntu-24.04-arm, macos-14, macos-13, windows-latest} × {node 24, node 26}`, plus `{node 24} × {--no-node-snapshot on/off}`. Steps: `npm ci && npm run build && npm test`, plus a smoke test that runs `node dist/cli.js audit test/fixtures/runtime-safe-action.ts --json` and asserts `executions > 0`. Add an `alpine` container job.

---

## 7. Fresh-clone testing investigation

| Question | Answer | Evidence |
| :--- | :--- | :--- |
| Does `npm test` work before `npm run build`? | **No.** 5/24 files fail, 33 tests fail, 3 suites don't load. | Fresh clone in scratch, §V-11 |
| Which tests rely on `dist/`? | `cli.test.ts`, `release.test.ts` (direct); `benchmark.test.ts`, `ground-truth.test.ts` (via `benchmarks/*.ts` → `../dist/index.js`); `performance.test.ts` (via `test/helpers/perf-harness.ts` → `../../dist/index.js`) | Load errors |
| Does it pass after a build? | Yes: 24/24, 340/340 | Same clone |
| Are builds reproducible? | Deterministic for a given checkout (identical tree hash across two builds). **Byte output varies with line-ending checkout**: no `.gitattributes`, `core.autocrlf=true` here. The published tarball has LF, local builds have CRLF. Content is identical. | `p2/dist-a` vs rebuild; tarball diff |
| Can CI run without local state? | The build plus benchmark can (proven by the Actions runs). The test suite can, **but only if a build step runs first**, and no workflow does that. Tests also left the working tree clean, so they don't write into the repo. | Actions log; `git status` after tests |

---

## 8. Benchmark integrity assessment

### 8.1 Proposed four-level taxonomy

| Level | Definition | Identity key | Use |
| :--- | :--- | :--- | :--- |
| **Payload observation** | One execution of one action with one argument vector, and its outcome | `(action, argsHash, seed)` | Internal; shrinking input |
| **Finding instance** | One emitted record (today's granularity: one per failing observation) | Today's fingerprint | Raw-output debugging only |
| **Root-cause cluster** | Instances with the same `(repo, commit, file, action, rule, error constructor, crash site)`. The message is normalized (null/undefined merged, quoted values elided), and payload fields are excluded. | Cluster fingerprint | **The unit SIS should report and fingerprint** |
| **Independent application defect** | A human-adjudicated cluster that (a) reproduces with every parameter supplied per the framework's calling convention, (b) isn't attributable to SIS harness or emulation behavior, and (c) would need its own code fix | Reviewer-assigned defect ID | **The unit for precision and for public claims** |

### 8.2 Applying it

| Data set | Instances | Clusters | Independent application defects (auditor assessment) |
| :--- | :-: | :-: | :--- |
| Historical ground truth (43 records) | 43 | 16 | **0 established.** The single TP cluster is the V-01 harness artifact. The 9 FP clusters trace to 2 SIS root causes (route-handler and modal/prop classification). The 5 artifact clusters trace to 1 SIS root cause (unsuppressed framework `ReferenceError`, since changed). |
| Active CI, `cbd7d8e`, Linux (26) | 26 | 11 | **≤ 1 plausible:** clerk `syncKeylessConfigAction` destructures `args` with no guard (single parameter; 2 instances, null and undefined). Not independently reviewed. Remaining clusters: commerce = V-01 artifact; shadcn ×8 = V-02 artifact; dub-api ×4 = V-07 FP; midday ×3 = V-15 FP. |

### 8.3 Methodology observations

- Review records name processes (`ground-truth-pilot`, `ground-truth-phase-24`), not reviewers. There's no evidence of the dual-review/κ protocol described in `BLIND_REVIEW_PROTOCOL.md`. The κ = 0.94 figure appears only inside a design document's mock dashboard (`phase-27-architecture.md:219-247`).
- Precision excludes `FRAMEWORK_ARTIFACT` from the denominator (`reviews.ts:371-373`). Because artifacts are SIS defects, this favors SIS.
- Historical (43 records, 5 repos, a pre-HEAD engine) and active results (26 unreviewed, 16 repos) are mixed in public claims. The active results aren't committed.
- **A defensible restatement on current evidence:** "Across the historical and current benchmark runs, SIS has not yet produced an independently confirmed application defect. One current cluster (clerk) is a plausible candidate pending review."

---

## 9. Release integrity assessment

| Aspect | Finding |
| :--- | :--- |
| Published version | `0.1.0` only, from `71d78a1` (2026-09-10). |
| Artifact fidelity | Rebuilding `71d78a1` reproduces the tarball exactly, modulo CRLF. No tampering indicators. |
| Provenance | **None.** No `dist.attestations`. Published manually (not from CI). |
| Missing from release | Selective Runtime Verification (`prefix.ts`, preludes, execution provenance in JSON/SARIF) **and** the Phase 23 precision work (`classifier.ts`, route-handler exemption, test-directory exclusion, cloud-SDK gating). |
| Behavioral consequence | The published CLI emits route-handler and playwright FPs that HEAD doesn't, and doesn't run actions that use `cookies()` (V-04 probe). |
| Versioning | `package.json`, `src/cli.ts:37`, and `src/output/schema.ts:8` all say `0.1.0` at HEAD despite +2014 lines of behavior change. No tags, no GitHub releases, `CHANGELOG.md` only has "Preparation". |
| Files allowlist | `files: ["dist"]`. Correct, but it ships placeholder modules and source maps without sources. |
| Gating | `prepack` builds but doesn't test. No `prepublishOnly`. No release workflow. |
| README scope | Describes HEAD behavior and benchmark numbers produced by HEAD (or by intermediate engine states), while instructing `npx @aashirzayd/sis`, which installs the pre-fix engine. |

---

## 10. Prioritized remediation sequence

Ordered by risk to users' trust, then by dependency (later items build on earlier ones).

1. **Stop over-claiming (documentation only, immediately).** Correct the README benchmark headline (§8.3 restatement), mark unreleased features, and fix D2/D3 defaults text. No code risk. Unblocks honest communication while the fixes land.
2. **Error-provenance model (RC-2 → V-02, V-06).** Phase-tagged execution, return-value serialization inside the isolate, verdicts by error identity. This is a prerequisite for trusting any SIS003/SIS004.
3. **Multi-argument harness (RC-1 → V-01).** Depends on 2 for clean classification of the omitted-argument case.
4. **Execution closure and observed-mode contract (RC-3 → V-03, V-13).** Free-variable analysis, bundling pure module declarations, an isolate-globals model, hoisting-aware prefixes, post-hoc mode reconciliation, and a vacuous-run policy (Decision 4).
5. **Finding clustering and identity (RC-7 → V-05, V-17).** Cluster fingerprints in core output (JSON and SARIF `partialFingerprints`), then re-baseline the benchmark at the cluster and defect level.
6. **Release (V-04, V-11, V-18, V-25).** Fix `pretest`, add the CI test matrix (§6), harden the workflow, add a release workflow with provenance, tag `v0.1.0` at `71d78a1`, and bump the version per Decision 1. Can run in parallel with 2–5, but the *publish* step waits for them.
7. **Path semantics and resolution (RC-4, RC-5 → V-07, V-09, V-17).** Project-root detection, `tsconfig` `paths`, repo-relative SARIF URIs. Turn the negative control into a CI gate.
8. **Discovery and boundary unification (RC-6 → V-08, V-15, V-14, V-20).** One action model and transitive client propagation; run data-flow in single-file mode.
9. **Precision cleanups (V-10, V-12, V-16, V-19, V-22).** Remove the name heuristic, fix the offset mapping, fix the exit-code matrix, and strengthen doc tests.
10. **Maintainability (V-23 – V-25).**

---

## 11. Regression test requirements

Every remediation should land with a test that fails on `585af3d`. Minimum set:

| Area | Test | Fails today because |
| :--- | :--- | :--- |
| Harness | Two-parameter action dereferencing param 1 → 0 SIS003 with a valid baseline; the mutated parameter is reported | V-01 |
| Provenance | Return fn / own-fn object / Symbol / `Promise<fn>` / `import()` / OOM / thrown plain object → no SIS003, explicit reason | V-02 |
| Verdicts | Spoofed timeout text, `NEXT_REDIRECT` in a message, digest-only redirect, typo `ReferenceError`, explicit `ReferenceError` → correct status, original message preserved | V-06 |
| Closure | Helper / const / enum / class / closure / `crypto` / alias / anon default / named default / sibling call / hoisted function in prefix → executes or is labeled `ATTEMPTED_UNRESOLVED` with bindings | V-03 |
| Accounting | `unsupportedActions` equals the number of non-executing discovered actions; a vacuous directory isn't reported as clean | V-03, V-16 |
| Discovery | `const` + `export {}`; HOF wrapper; nested inline `"use server"` | V-08 |
| Resolution | `@/*` alias fixture gives the same findings as the relative control | V-09 |
| Paths | Audit `app/api` vs `app` → identical route-handler classification; SARIF URIs repo-relative | V-07, V-17 |
| Precision | Names `clientId`, `feedback`, `dbResult`, `clients`, `sandbox` not flagged | V-10 |
| Taint | `try`, conditional JSX, env destructuring, `??`, a value from a call flowing into a client prop → 1 finding at the sink | V-14 |
| Boundaries | A component imported only by a client module is client; utility file not an action; Promise return OK | V-15 |
| Locations | Unicode/BOM table (§V-12) | V-12 |
| Identity | Cluster fingerprint stable across seeds and `--runs`; N payloads → 1 cluster | V-05 |
| CLI | Exit-code matrix (§V-16) | V-16 |
| Build | Fresh clone → `npm ci && npm test` with no prior build | V-11 |
| Release | `npm pack` of the tagged commit equals the CI build; version > published | V-04 |
| Benchmark | Negative-control repos must produce 0 findings, else CI fails | V-07, V-22 |

---

## 12. Outstanding questions

1. **Reachability:** can React's Server Action reply decoding deliver an own `__proto__` key, `-0`, sparse arrays, or a *missing* argument to an action invoked by a crafted request? This determines whether V-01-class crashes and prototype payloads describe real attack surface. UNVERIFIED.
2. **macOS and arm64 runtime behavior**, and long-run stability without `--no-node-snapshot` (§6).
3. **Default GitHub Actions token permissions** for this repository (needs owner access).
4. **True executed-action ratio on the corpus.** It needs per-action execution histograms, which `latest.json` doesn't record. V-03 suggests it is low.
5. **Clerk cluster adjudication** by an independent reviewer.
6. **Whether the historical 43 records should be re-run at HEAD** with clustering before any precision is published again.

---

## ENGINEERING DECISIONS REQUIRED

These need maintainer approval before implementation:

1. **Release strategy.** Choose between (a) publishing the current HEAD now as `0.2.0` with known defects documented, (b) holding releases until remediation items 2–5 land, or (c) deprecating `0.1.0` with a notice. Also decide whether to retro-tag `v0.1.0` at `71d78a1` and whether to require CI-only publishing with `--provenance`.
2. **Public benchmark claims.** Approve withdrawing or restating "9 confirmed true positives / 100% emitted precision" now, before the fixes land, and adopt the four-level taxonomy (§8.1) as the reporting standard. Decide whether `FRAMEWORK_ARTIFACT` counts as a false positive in precision.
3. **Multi-argument harness semantics.** For `(prevState, payload)` actions, what baseline values should non-fuzzed parameters get (inferred shape, `undefined`, `null`, or framework-specific defaults)? Should a crash caused by a *missing* argument be a reportable finding class (for example "argument-arity robustness"), and at what severity?
4. **Execution-mode contract and vacuous runs.** Approve the observed-mode contract (V-03). Decide the exit code and severity when zero actions execute: warning plus exit 0, or a distinct exit code. Decide whether `ATTEMPTED_UNRESOLVED` blocks CI.
5. **Module bundling scope.** How far should SIS go to make actions executable: only pure module-level declarations, also same-project relative imports, or an esbuild-style bundle with stubs? There's a trade-off between coverage and the "no fabricated mocks" principle.
6. **Verdict policy edge cases.** Decide on (a) unhandled rejections from fire-and-forget promises, (b) intentional validation `throw`s (`throw new Error("Invalid input")`), (c) OOM under SIS's 128 MB limit (should it be a finding, and should the limit be configurable from the CLI?).
7. **Severity model.** Should static heuristic findings stay `error` and trigger exit 1, or should only runtime-confirmed clusters be `error`?
8. **Platform support statement.** Which platforms and Node versions to officially support (and test in CI), whether to narrow `engines` to prebuilt ABIs, and whether to set `--no-node-snapshot` in the CLI launcher.
9. **Workflow policy.** Approve input validation, `permissions: contents: read`, `persist-credentials: false`, and making negative-control failures fatal.
10. **Single-file mode.** Should it run the cross-module stages over its import closure, or warn that they were skipped?

---

## Appendix A — Probe inventory

All probes live in the session scratchpad under `p2/`, outside the repository. They use the HEAD scratch build unless noted.

| Probe | Purpose | Key result |
| :--- | :--- | :--- |
| `rel71/` + `pub/` | `git archive 71d78a1` rebuilt vs registry tarball | Identical modulo CRLF |
| `fx-release/` | Published CLI vs HEAD CLI | Published: route + playwright FPs; HEAD: neither |
| `linux-artifact/`, `linux-run.log` | CI run `40292039378` artifact/log (read only) | 16 repos, 26 findings, 11 clusters, Linux execution |
| `runtime/verdicts.mjs` | 32 controlled candidates plus OOM through `runInIsolate` | V-02, V-06, V-03 globals |
| `runtime/fidelity.mjs` | Payload transfer fidelity | Faithful |
| `full/` (26 files) | Execution-mode integrity per action shape | V-03, V-08, V-13 |
| `static/`, `static2/` | Alias, route-under-api, name heuristic, inheritance, utility, taint patterns | V-07, V-09, V-10, V-14, V-15, V-20 |
| `loc/loc.mjs`, `loc/drift.mjs` | Unicode/BOM/CRLF locations; span drift | V-12; V-R3 |
| `exit/` | CLI exit-code matrix | V-16 |
| `fresh/` | Fresh clone before/after build; build determinism | V-11; §7 |
| `fp/fp.mts` | Fingerprint stability using the real `findingToReviewRecord` | V-05 |

Third-party sources read via the GitHub API at pinned commits: `vercel/commerce@3761e52 components/cart/actions.ts`, `shadcn-ui/ui@460ad60 apps/v4/lib/blocks.ts`, `midday-ai/midday@e27b704 apps/dashboard/src/{utils/upload.ts, components/enablebanking-connect.tsx}`, `clerk/javascript@d79852e packages/nextjs/src/app-router/keyless-actions.ts`.
