# SIS — Phase 4: Implementation Readiness & Design Challenge

| | |
| :--- | :--- |
| **Baseline** | `585af3d` (unchanged) |
| **Inputs** | Phase 1 (`audit/PHASE-1-REPOSITORY-INTELLIGENCE.md`), Phase 2 (`…/PHASE-2-FINDINGS-VALIDATION.md`, defect IDs `V-xx`), Phase 3 (`…/PHASE-3-REMEDIATION-DESIGN.md`, sections `§4.A`–`§4.F`, changes `R-*/A-*/B-*/C-*/D-*`, decisions `D1`–`D13`) |
| **Date** | 2026-11-01 |
| **Mode** | Read-only. No source, test, dependency, lockfile, or benchmark-data changes. |
| **Method** | Design review against source, plus **empirical probes of the Phase 3 runtime assumptions**. The probes ran raw `isolated-vm` 7.0.1 (the repo's installed copy, Node v24.19.0, Windows x64) and the HEAD scratch build. All probe code lives in the session scratchpad (`p4/`), outside the repository. |

Evidence labels follow Phase 2: **CONFIRMED** means reproduced in this phase, **SUPPORTED** means strong evidence without reproduction, **UNVERIFIED** means not enough evidence.

---

## 0. Summary of the challenge

Phase 3's direction holds: an outcome model with provenance, closure-based execution plans, cluster-level identity, project-root-relative paths, and gated releases. But **six of its load-bearing runtime assumptions are false**, and these have to be corrected before anyone implements Workstream A:

| # | Phase 3 assumption | Probe result | Status |
| :- | :--- | :--- | :--- |
| DF-1 | "Any host-side rejection of `script.run` is an isolate-level event, because app throws are caught by the envelope" (§4.A.5, rule 3) | A **fire-and-forget rejection** (`Promise.reject(...)` not awaited) rejects `run()` with the *application's* error **after** the envelope completed. Phase 3 rule 3c would classify it as `harness-error`. | **CONFIRMED false** |
| DF-2 | "The isolated-vm `timeout` bounds every execution" (§4.A.5, timeout identification) | `await new Promise(() => {})` **never settles and uses no CPU**, so the timeout never fires and `run()` hangs indefinitely. **Current SIS hangs the same way**: `runInIsolate` was still pending after 5 s with `timeoutMs: 20`. | **CONFIRMED false; new defect V-26** |
| DF-3 | "Capturing `JSON.stringify` before candidate code runs protects the envelope" (§4.A.2) | `Object.prototype.toJSON = () => "PWNED"` makes the captured `stringify` emit `"PWNED"`. A null-prototype envelope also leaks if it's built with `for…in`, because inherited enumerable keys are copied. | **CONFIRMED false** |
| DF-4 | "A closure-held `Symbol` tag is unforgeable" (§4.A.3) | Candidate code reads the symbol from a caught SIS redirect error with `Object.getOwnPropertySymbols`, copies it onto its own error, and that error then classifies as SIS-tagged. | **CONFIRMED false** |
| DF-5 | "Phase/state can be tracked through globals such as `__sisPhase`" (implicit in §4.A.1) | Candidate code redefines the global as an accessor. The harness's own write then throws inside the harness, and the host read fails ("Property is getter"). | **CONFIRMED false** |
| DF-6 | "A timeout means the action timed out" | A returned `Proxy` whose trap loops times out while the runtime adopts or inspects the *result*, after the action body has returned. A thenable `get` trap runs during `await`. | **CONFIRMED; needs phase attribution** |

What did hold up:

- V8 termination **can't be caught** by candidate `try/catch` (CONFIRMED).
- After a timeout the isolate isn't disposed, and phase information can still be retrieved (CONFIRMED).
- OOM ⇒ `isolate.isDisposed === true` (CONFIRMED).
- Stack overflow is a normal catchable `RangeError` (CONFIRMED).
- Microtask-only infinite loops **are** bounded by the timeout (CONFIRMED).

A **hardened envelope** defeated every attack tried (§1.3). It uses a host `ivm.Callback` captured into a closure and deleted from `globalThis`, `WeakSet` identity for SIS-created errors, intrinsics captured first, and a fixed-shape null-prototype record built with captured `Object.keys`. It also survived post-capture poisoning of `Object.keys`, `Object.create`, and `JSON.stringify` (CONFIRMED).

I also found **structural flaws** in Workstreams B, C, D, and E that would reintroduce the defects Phase 2 found (§2–§5). The most important:

- **The multi-argument harness would recreate the commerce artifact** whenever a baseline is itself invalid. That happens whenever a parameter's type is a named interface, because named types infer to `unknown` (`src/payload/targets/inference.ts:187-202`), so the baseline is `undefined`. Phase 3 has no rule against reporting crashes that don't depend on the input (§2.6).
- **Phase 3's own ordering would cause a large false-positive regression in between changes.** It switches `ReferenceError → app-exception` (A-2/A-3) before sentinels exist (B-3) (§7.1).
- **Exit code 4 (and the existing 3) collide with Node.js's reserved process exit codes** (§5.6).

---

## 1. Runtime outcome architecture

### 1.1 Mutual exclusivity, completeness, ordering

| Property | Phase 3 | Assessment | Correction |
| :--- | :--- | :--- | :--- |
| **Mutual exclusivity** | Achieved by ordered rules | Mostly sound. **But `not-attempted` isn't an execution outcome.** It's a payload *disposition* decided before execution, and mixing it into `ExecutionOutcome` lets accounting double-count | Move `not-attempted` to `PayloadDisposition = "executed" \| "not-attempted:<reason>"`. `ExecutionOutcome` exists only for executed payloads |
| **Completeness** | 10 kinds | **Missing:** (a) `app-stalled`: pending forever without CPU (DF-2); (b) `completed` in **PREFIX** scope, which isn't completion of the action; (c) failures during **module initialization** of bundled code; (d) failures while **adopting or inspecting the result** (DF-6); (e) unhandled rejections alongside a completed or failed envelope (DF-1) | Add `app-stalled`. Add `scope: "action" \| "prefix"`. Add phase `module-init` and `result`. Make `unhandledRejections` a *qualifier* on any envelope outcome, not a separate kind |
| **Ordering** | Disposal → timeout → harness | Rule 3b uses `elapsed ≥ 0.9·budget` as a guard. Probe: a 20 ms budget actually terminated at **34.8 ms**, so the guard works but is redundant once phases are reported. Rule 3c is wrong (DF-1) | Order below (§1.2), keyed on host-observed signals and **host-received phase reports**, not elapsed time |
| **Resistance to misclassification** | Message-free, symbol tags | DF-3, DF-4, DF-5 defeat it | Hardened envelope (§1.3) |

### 1.2 Revised classification (owner: `src/runtime/outcome.ts`, a pure function)

The host collects a `RawIsolateResult` (owner: `src/runtime/worker.ts`):

```ts
interface RawIsolateResult {
  setupError?: unknown; compileError?: unknown;      // host-observed, before execution
  runRejection?: { message: string; isTimeout: boolean }; // isTimeout: rejection from run() while no envelope and isolate alive
  disposed: boolean;                                 // isolate.isDisposed after settle/abort
  wallDeadlineExceeded: boolean;                     // host timer fired; isolate was disposed by the host
  phases: Phase[];                                   // received through the closure-captured ivm.Callback, in order
  envelope?: string;                                 // delivered through the same callback BEFORE the IIFE returns
  unhandledRejections: number;                       // run() rejected after envelope delivery, or counted by the in-isolate shim
  elapsedMs: number;
}
type Phase = "module-init" | "execute" | "result" | "serialize" | "done";
```

Rules, applied in order:

```
1. setupError                                → sandbox-error            (owner: worker; environment/isolate creation)
2. compileError                              → harness-error            (SIS generated invalid code)
3. wallDeadlineExceeded                      → app-stalled              (last phase must be module-init|execute|result)
4. disposed (not by host)                    → memory-exhausted         {phase: last reported phase}
5. runRejection.isTimeout:
     last phase ∈ {module-init}              → app-timeout {phase:"module-init"}  (bundled initializer; not the action body)
     last phase = execute                    → app-timeout
     last phase = result                     → completed {scope, result:"inspection-timeout"}
     last phase ∈ {serialize, done}          → harness-error
6. envelope present → parse with host JSON.parse; unparseable → harness-error
     ok                                      → completed {scope, value}
     thrown & envelope.sisKind (identity-checked in isolate)
                                             → unresolved-binding | unsupported-operation | control-flow
     thrown & digest NEXT_* & plan imports matching next/navigation export
                                             → control-flow
     thrown otherwise                        → app-exception {phase: "module-init" | "execute"}
   + if runRejection && !isTimeout           → unhandledRejections += 1   (qualifier; DF-1)
7. no envelope, runRejection non-timeout     → app-exception {phase:"execute", via:"unhandled-rejection"} if last phase=execute, else harness-error
```

**Ownership:**

| Layer | Owns |
| :--- | :--- |
| In-isolate harness (generated by `worker.ts`) | Catching throws; SIS identity check (`WeakSet`); value description; reporting phases and envelope through the captured callback |
| Host worker (`worker.ts`) | Isolate lifecycle, the `timeout` option, the **wall-clock deadline** (new, fixes DF-2), observing disposal, collecting `RawIsolateResult` |
| Classifier (`outcome.ts`) | The mapping above, with no I/O |
| Planner (`plan.ts`) | Static unsupported operations, `not-attempted` dispositions, sentinel lists |
| Accounting (`accounting.ts`) | Per-action status (`EXECUTED` / `PARTIAL` / …) |
| Finding assembly (`src/index.ts`) | Finding vs diagnostic, the **input-dependence gate** (§2.6), and clustering hand-off |

### 1.3 Hardened envelope requirements (replacing Phase 3 §4.A.2–A.3)

Each requirement was validated by probes in `p4/hardened*.mjs` and `p4/ident.mjs`:

1. **Host channel.** The host sets `globalThis.__sisReport = new ivm.Callback(fn)`. The harness's first statement copies it into a closure constant and `delete`s the global. Phases **and the envelope string** are sent through it. Redefining the global afterwards has no effect (CONFIRMED). The envelope reaches the host even if `run()` later rejects (DF-1) or times out during result handling (DF-6).
2. **Identity, not tags.** SIS-created errors (preludes, sentinels) are added to a closure-held `WeakSet`. A copied symbol doesn't classify; re-throwing the genuine object does (CONFIRMED).
3. **Intrinsics captured first and never re-read:** `Object.keys`, `Object.create`, `JSON.stringify`, `String`, `Array.isArray`, `Reflect.ownKeys`, `WeakSet.prototype.has`, bound via `Function.prototype.call.bind` where needed. Post-capture poisoning has no effect (CONFIRMED).
4. **Fixed-shape records.** Envelope objects are `Object.create(null)` with explicit field assignment (no `for…in`, no spreading). Values are primitives or nested fixed-shape records only (CONFIRMED against `Object.prototype.toJSON` / `Array.prototype.toJSON` poisoning).
5. **Result inspection is bounded and attributed.** Describing a returned value can run user code (Proxy traps, getters, `then`). It happens in phase `result`, so a timeout there classifies as `completed` with `inspection-timeout` (DF-6). The description uses `Reflect.getOwnPropertyDescriptor` (no getter invocation, though Proxy traps still fire) and a key-count cap.
6. **Wall-clock deadline** (new, DF-2). The host runs a `setTimeout(wallMs)`, with default `wallMs = max(10·timeoutMs, 1000)`. When it fires, the host calls `isolate.dispose()`, records `wallDeadlineExceeded`, and classifies the result as `app-stalled`. This is a **separate safety fix needed now**, because current SIS can hang indefinitely (V-26).

### 1.4 Adversarial tests, one or more per outcome

All are additions to the Phase 3 T-A tests, in `test/runtime-outcomes.test.ts`.

| Outcome | Adversarial test(s) | Must not be classified as |
| :--- | :--- | :--- |
| `completed` | return Proxy with a looping `ownKeys`/`get` trap; return a thenable whose `then` throws; return an object with a getter that throws; `Object.prototype.toJSON` poisoning before return | app-timeout, app-exception, harness-error |
| `app-exception` | `throw new Error("Script execution timed out")`; `throw new Error("NEXT_REDIRECT")`; `throw` a copy of a SIS error's symbols (DF-4); `throw` a non-Error (`"s"`, `{}`, `null`); typo `ReferenceError` **after** B-3; `RangeError` stack overflow; error thrown from a `finally` that replaces a sentinel throw | timeout, control-flow, unsupported |
| `app-timeout` | sync loop; loop after `await`; microtask loop; loop inside the candidate's own `try/catch`; loop in a bundled module initializer (`phase: module-init`) | app-exception, completed |
| `app-stalled` (new) | `await new Promise(() => {})`; awaiting a never-resolving prelude stub | hang (the test must finish under the wall limit), app-timeout |
| `control-flow` | prelude `redirect()`; re-throw of the *same* redirect object; digest-only error **with** a matching `next/navigation` import | app-exception |
| `control-flow` (negative) | digest-only error **without** the import; user `Error("NEXT_REDIRECT")`; forged symbol | control-flow |
| `memory-exhausted` | growth loop under `memoryLimitMb: 16`; OOM during result inspection (phase recorded) | app-exception |
| `unresolved-binding` | reach a sentinel through a call, a read, and `typeof`; a candidate that catches the sentinel error and re-throws a *different* error (that must be `app-exception`, documented) | app-exception |
| `unsupported-operation` | `await import()`; `eval`; `new Function`; `with` (sloppy-mode module? → planner marks it STATIC_ONLY) | app-exception |
| `harness-error` | an intentionally invalid harness (test-only hook); envelope corruption via a test hook | app finding of any kind |
| `sandbox-error` | isolate creation with an invalid memory limit (test hook) | app finding |
| unhandled-rejection qualifier | `Promise.reject()` without await, then `return 1` → `completed` + `unhandledRejections: 1` | harness-error (DF-1) |
| partial (accounting) | an action with 3 payloads: completed, unresolved-binding, app-exception → `PARTIAL` | `EXECUTED` |
| prefix scope | a PREFIX plan whose prefix completes → `completed {scope:"prefix"}`; never counted as action-level completion | FULL verification |

---

## 2. FULL execution semantics

### 2.1 Is dependency resolution sufficient? **No. It's necessary but not sufficient.**

Resolving every free variable guarantees the code can **run**. It doesn't guarantee the code runs **the same way it does in production**. The remaining gaps:

| Concern | Phase 3 handling | Gap found | Required rule |
| :--- | :--- | :--- | :--- |
| **Module initialization** | Pure-initializer bundling in source order | Initializers run *before* the envelope's `try` (Phase 3 A.2 step 3), so a throw there escapes the envelope | Module-init runs inside the envelope under `phase: module-init`. Failures there are **not** attributed to any payload (§2.6) |
| **Classes treated as always pure** (B.5) | "function, class → yes" | **False.** `static {}` blocks, static field initializers, `extends <expr>`, and decorators all execute code at definition time. Probe: a class with `static { globalThis.side = 1 }` is discovered and would be bundled unconditionally | Classes are pure only if: no `static` blocks, no static initializers other than pure expressions, `extends` refers to a resolved pure class or nothing, no decorators |
| **Import side effects** | Imports unresolved in phase 1 | Correct for bindings, but `import "./polyfill"` (side-effect-only import) changes globals in production and SIS ignores it | Any side-effect-only import downgrades FULL → `FULL_WITH_IGNORED_IMPORTS`, reported as a plan caveat (reason `side-effect-import`) |
| **Export aliases** | Invoke the local binding | Correct | — |
| **Default exports** | `const __sis_default = <function expression>` | **Incomplete.** Probe: `export default act;` (identifier) and `export default wrapper(async …)` are **not discovered at all**. `export { act as default }` is discovered as `default` | Resolve `ExportDefaultExpression` identifiers to their declaration. Treat a call-expression default like an HOF export (D11) |
| **Re-exports** | Not addressed | Probe: `export { act } from "./impl"` and `export * from "./impl"` in a `"use server"` file are **not discovered** | Discover them as actions with plan `NOT_EXTRACTED: re-export` (counted), until cross-module bundling exists (D5) |
| **Circular imports** | Not addressed | Only matters once relative-import bundling exists (D5). Module-level declaration cycles inside a single file are fine in source order | If D5 extends bundling, require ESM-faithful ordering or downgrade to STATIC_ONLY on cycles |
| **Mutable module state** | Fresh per payload (`moduleStateReset`) | Correct as disclosed. It means **state-dependent bugs can't be found**, and crashes that need prior calls won't reproduce | Keep it, and add the caveat in output |
| **Closures** | Free-variable analysis | Correct, provided closures over **module-level impure state** are sentinels | — |
| **Hoisting** | Function declarations hoist into the prefix | Correct. `var` hoisting gives `undefined` (fine). TDZ for `let`/`const` used before the cut is a real application `ReferenceError` and must stay `app-exception` | Test it |
| **Global availability** | Probed set | Correct approach. The probe must also capture **non-enumerable** names (`Reflect.ownKeys`, as designed) and must run under the same isolate options as executions | — |
| **Framework bindings (preludes)** | Import-bound, counted as resolved | **FULL with preludes is emulated, not production-equivalent.** For example, the empty cookie store makes `cookies().get("cart").value` throw for **every** input (an emulation artifact) | Mode `FULL` + `emulated: ["cookies", …]`. Crashes that occur identically for all payloads fall under §2.6 |
| **Multiple parameters** | Per-parameter mutation with baselines | **Baseline poisoning**: named-interface types infer to `unknown` (`inference.ts:187-202`), so the baseline is `undefined`, so mutating *another* parameter crashes on the bad baseline. **That's the commerce artifact again.** | §2.6 input-dependence gate, plus shape inference for same-module interfaces and type aliases (`TsInterfaceDeclaration`, `TsTypeAliasDeclaration`) |
| **Parameter defaults** | Baseline `undefined` lets the default apply | Correct | — |
| **Execution accounting** | `EXECUTED` if all outcomes are in the verified group | An action whose every payload throws at statement 1 counts as "EXECUTED" while exercising one line | §2.2 |

### 2.2 Exact conditions to claim FULL verification

A finding report or summary may say **"FULL verification"** for an action only if **all** of the following hold:

1. **Plan:** `mode = FULL`. Every free variable is resolved (module, probed global, import-bound prelude, parameter, or local). There are no unsupported-operation nodes, no unresolved wrapper, and no `re-export`.
2. **Module init:** every bundled initializer completed (no `phase: module-init` outcome other than `completed`).
3. **Baseline execution:** the **baseline argument vector** (every parameter at its baseline, nothing mutated) was executed and reached `completed` or `control-flow` at action scope.
4. **Coverage evidence:** ≥ 1 payload reached `completed` or `control-flow` at **action scope**. Exceptions alone aren't evidence that the action was exercised.
5. **No incomplete outcomes on the baseline.**
6. **Disclosures** are attached: `emulated[]` (preludes in use), `moduleStateReset: true`, `ignoredImports[]`.

Otherwise the action is reported with the strongest status it supports:

| Condition | Reported as |
| :--- | :--- |
| Plan FULL, baseline fails with an input-independent signature | `FULL_PLANNED · BASELINE_FAILED`. Findings for this action are diagnostics only (§2.6) |
| Plan FULL, some payloads incomplete | `PARTIAL` (with the verified fraction) |
| Plan FULL, all payloads incomplete | `NOT_VERIFIED` (+ binding names) |
| A closed prefix exists, the remainder unresolved | `PREFIX`; completion is `scope: prefix` only |
| Unresolved before any statement, or an unsupported construct (`eval`, `with`, unresolved HOF wrapper, re-export) | `STATIC_ONLY` |
| No executable node can be produced | `UNSUPPORTED` / `NOT_EXTRACTED` (always counted) |
| Side-effect imports present | `FULL` with caveat `side-effect-import` (otherwise as above) |

### 2.3 Downgrade triggers (FULL → PREFIX / STATIC_ONLY / UNSUPPORTED)

- **→ PREFIX:** an unresolved binding or unsupported operation first appears at statement *k* > 0, with all hoisted function declarations resolvable or sentinel-able.
- **→ STATIC_ONLY:**
  - an unresolved binding in statement 0 or in a parameter default;
  - an impure module initializer the action depends on;
  - an impure class (§2.1);
  - an unresolved HOF wrapper (D11);
  - `eval`, `with`, or `new Function` anywhere in the body;
  - dynamic `import()` before any resolvable statement;
  - a `FormData` parameter (existing rule, `src/runtime/prefix.ts:207-229`), until a FormData baseline exists.
- **→ UNSUPPORTED / NOT_EXTRACTED:** a re-export or `export *` (until D5); generator actions; syntax the planner doesn't model (TS namespaces with runtime bodies, decorators on the action).

### 2.4 Execution accounting (refinement of Phase 3 §4.B.9)

Add **`baselineStatus`** per action, and distinguish **`EXECUTED_COMPLETING`** (≥ 1 action-scope completion) from **`EXECUTED_EXCEPTIONS_ONLY`**. Only the former counts toward "verified actions" in the coverage ratio. The second is reported but not counted as coverage.

### 2.5 Exit codes for zero verification

These are unchanged in spirit from Phase 3: inconclusive must not be 0. The **numeric value** is challenged in §5.6.

### 2.6 New rule: the input-dependence gate (prevents V-01-class artifacts)

A runtime exception (SIS003) is reported as a **finding** only if there is **differential evidence**: within the same action and plan, at least one other executed payload (normally the baseline) reached a *different* outcome signature. If every executed payload, including the baseline, produces the **same** signature, the failure doesn't depend on the input. It's reported as diagnostic **SIS109 `input-independent-failure`**: likely harness, emulation, or module-init behavior, needing review.

This single rule would have suppressed:
- the commerce cluster (all 9 payloads, same crash);
- the shadcn dynamic-import cluster (all 8 payloads, same error);
- any empty-cookie-store emulation artifact.

It does **not** suppress genuine validation gaps, where the baseline passes and a mutated input crashes. The cost is that genuine "always crashes" bugs are surfaced only as diagnostics. That's acceptable: SIS's claim is input-driven verification, and input-independent crashes are better caught by ordinary tests. **New decision D14.**

---

## 3. Benchmark fingerprinting

### 3.1 Phase 3's cluster key tested against the required scenarios

Phase 3 key: `(repo, commit, file, action, rule, outcome kind, error constructor, crash site, normalized message)` with value elision (§4.C.2).

| Scenario | Phase 3 behavior | Correct behavior | Verdict / fix |
| :--- | :--- | :--- | :--- |
| Same bug, different payload | Same crash site + elided message → 1 cluster | 1 cluster | **OK** |
| Same bug, different source location (missing validation crashes at line 3 when `x` is null and at line 4 when `x.a` is null) | 2 clusters | 2 clusters, **1 defect** (human merge) | **OK**, and it's why the defect level exists. Mandatory human review |
| Different bugs in the same function, same line, same constructor (`x.a.b` → reading `a` vs `b`) | Elision of quoted literals turns `'a'` and `'b'` into `'…'` → **merged wrongly** | 2 clusters | **Fix:** elide only *payload-derived* values. Keep quoted identifiers that appear in the crash-site source text |
| Different functions, same underlying cause (shared helper `parse()` crashes; called from 3 actions) | `action` is in the key → 3 clusters, crash site the same | 1 cluster with 3 entry points | **Fix:** when the crash site is in shared (bundled) code, key on the crash site and list entry actions as cluster members |
| Different repositories with duplicated code (templates: taxonomy and next-saas-stripe-starter both carry Stripe webhook routes) | Separate clusters per repo | Separate clusters; **flag as a possible clone** | Add `codeCloneKey = sha256(normalized function source)`. Clusters sharing a clone key are presented together; a human decides whether they're independent |
| **Same repository audited twice** (`dubinc/dub` with `targetDir apps/web` and `dubinc/dub-api` with `apps/web/app/api`, same URL and commit; probe of `corpus.json`) | The key uses the corpus *entry name*, so the same file gives 2 clusters, double-counted | 1 cluster | **Fix:** key on `(url, commit, repo-relative path)`, never the entry name. Aggregate across overlapping entries by de-duplicating files |
| Multiple framework artifacts (`createStreamableValue` unresolved in 3 actions) | Per-action diagnostics | One **SIS-root-cause** group | Diagnostics cluster on `(diagnostic code, binding/op name, import source)` across the corpus |
| SIS-generated infrastructure failures | Diagnostics, not findings | Same | **OK**, but the benchmark must *report* diagnostic clusters, so SIS defects stay visible instead of being silently filtered |

### 3.2 Where automatic clustering is reliable, and where human review is mandatory

| Reliable automatically | Human review mandatory |
| :--- | :--- |
| Collapsing payload variants at the same crash site | Assigning `TRUE_POSITIVE` (any defect claim) |
| Collapsing seed and run-count variation | Merging clusters into one defect (different crash sites) |
| Collapsing null/undefined message variants | Deciding reachability (can a real client send this input or arity?) |
| Grouping diagnostics by binding or operation | Clone and template independence across repositories |
| De-duplicating overlapping corpus entries | Distinguishing emulation artifacts from real bugs when the input-dependence gate passed |

### 3.3 Rules preventing false precision claims (binding for README, docs, and release gate G9)

1. Precision is computed **only** over clusters reviewed by **named** reviewers. The reviewed fraction is shown next to it.
2. Fewer than **20** reviewed clusters: publish **counts only**, no percentage. Otherwise publish a 95% **Wilson interval** with the point estimate.
3. `FALSE_POSITIVE`, `FRAMEWORK_ARTIFACT`, `HARNESS_ARTIFACT`, and `UNREACHABLE` are all **negatives**.
4. No precision over a subset selected after seeing the results (no "emitted precision" over a filtered phase).
5. Self-review is disclosed. If reviewer = author, the figure is labeled "author-reviewed".
6. Historical-engine and current-engine results are never pooled.
7. No recall on real-world corpora. Seeded-defect detection rates (D12) are labeled synthetic.
8. Defect counts come from `defectId`s, never from clusters or instances.

---

## 4. Route-handler detection

### 4.1 Project-root-relative approach: findings

| Case | Phase 3 rule | Challenge | Required refinement |
| :--- | :--- | :--- | :--- |
| Nested audit directories (`apps/web/app/api`) | Walk up to `next.config.*` / `package.json` with `next` | Sound. It fixes the reproduced `dub-api` FP class (V-07) | Stop at the **git root**. Record the chosen root in output |
| `src/app` | `appDirs = [root/app, root/src/app]` | **Next.js ignores `src/app` when a root `app/` exists.** Treating both as routable can exempt files Next.js doesn't route | Choose `app/` if present, else `src/app/`. The other one is non-routable |
| **Private folders** `_name/` | Regex allows any segment | `app/_lib/route.ts` isn't routed by Next.js, yet Phase 3 would **exempt** it, which could hide findings | Exclude segments starting with `_` from routability (route groups `(x)`, `@slot`, and `[param]` stay routable) |
| Custom `pageExtensions` | Fixed `route.(js\|jsx\|ts\|tsx)` | Projects with `pageExtensions: ["page.tsx", "api.ts"]` name routes `route.api.ts`. Missed, or mis-exempted | Parse `next.config.*` statically with SWC for a literal `pageExtensions` array. If it's absent or dynamic, use the default and mark confidence MEDIUM |
| Monorepos / multiple apps | Per-file nearest root | Sound. Risk: a workspace root `package.json` with `next` hoisted claims files in `packages/*` | Prefer `next.config.*` over `package.json` evidence. Only treat `package.json` as a root if it contains an `app/` or `pages/` dir |
| Ambiguous roots (no config, fixtures) | Fallback LOW + SIS108 | Sound | Add `--project-root` (Phase 3 has it) and make LOW-confidence exemptions **visible** (§4.2) |
| Unusual exports (`export const GET = withAuth(h)`, `export { handler as GET }`, `export default`) | Exempt HTTP-method names | `export default` in `route.ts` isn't a handler. Next.js only routes named HTTP methods | Exempt exactly the exported names in `HTTP_ROUTE_METHODS` (`src/boundary/classifier.ts:12-20`), whatever the binding shape |
| Server Actions in route files (inline `"use server"` inside a handler file, or module `"use server"`) | Directive wins | Sound. Inline actions defined in a route file must still be discovered (Phase 3 V-08 / B-5) | Test it explicitly |
| Case sensitivity (`Route.ts` on Windows) | Regex has no `i` flag (good) | The current regex uses `/i` (`classifier.ts:58-59`) | Keep it case-sensitive, matching Next.js |

### 4.2 Ensuring exemptions can't hide Server Action findings

An export is exempt from Flight return rules **only if all** of these hold:

1. The file is **routable** per the refined rules above (root `app` choice, no `_` segments, `pageExtensions`).
2. The module has **no** module-level `"use server"` directive.
3. The export's **name** is in `HTTP_ROUTE_METHODS`.
4. The exemption covers **only** Flight-return serialization (SIS002 return rule). Taint, runtime execution of inline actions, and prop analysis still run.

**Every exemption is visible.** Each run emits diagnostic `SIS110 route-handler-exemption` (level `note`) per file, listing the exempted exports and the project root used. Benchmark negative controls check the exemptions, not just the finding count.

**Known recall gap to document, not fix in this reset:** HTTP response leakage, such as `NextResponse.json({ key: process.env.SECRET })` in a route handler, is covered by no SIS rule. Exemption doesn't cause it, but users might assume coverage.

---

## 5. Release and CI architecture

### 5.1 Tag-triggered publishing, provenance, approval

- **Sound,** with refinements:
  - Use **npm trusted publishing (OIDC)** so no long-lived `NPM_TOKEN` exists. Provenance is then generated by the registry flow.
  - Protect `v*` tags with a repository ruleset. Gate publishing behind the `npm-publish` environment with required reviewers.
  - Split jobs: `build-verify` (`contents: read`), `publish` (`id-token: write` only), and `github-release` (`contents: write` only).
- **Ownership blocker:** trusted publishing and environment protection must be configured by the package and repository **owner** (`AashirZayd`). The `gh` identity used during this audit is `NomiqAI` and couldn't read repository Actions settings (Phase 2 V-18). This is a **maintainer action**.

### 5.2 Tarball inspection and consumer smoke tests

- **Sound.** One addition: `npm install ./sis.tgz` resolves dependencies **fresh** within the caret ranges, which is good because it's the real consumer experience, but it isn't reproducible. Run **both** a lockfile-faithful smoke test (`npm ci` in the repo, then `node dist/cli.js`) and a fresh-resolution consumer smoke test. Record the resolved `@swc/core` and `isolated-vm` versions in the release notes.
- SIS's AST code is tightly coupled to the `@swc/core` AST shape, so consider **exact pins** for `@swc/core` and `isolated-vm` (new decision **D15**).

### 5.3 Node 24 and 26; native dependencies

- `isolated-vm` 7.0.1 prebuilds are for ABI 137 (Node 24, confirmed locally) and ABI 147. **The ABI 147 → Node major mapping is UNVERIFIED in this audit.** CI must print `process.versions.modules` and choose the prebuild path explicitly, not assume it.
- **macOS x64.** Phase 3 listed `macos-13`. GitHub's Intel macOS runner images have been on a retirement path, so their availability must be checked when CI is written. If none is available, macOS x64 is simply **unsupported/untested**. Don't substitute a Rosetta claim.
- **`--no-node-snapshot`.** Keep Phase 3's two-way test. Add a **long-run soak** (≥ 10 000 isolate create/dispose cycles) on Linux, because the upstream warning concerns crashes that a short benchmark might not trigger.

### 5.4 Workflow permissions and injection

- Sound. Add **`actionlint`** and a workflow security linter (for example `zizmor`) as a CI step. Forbid `pull_request_target`. Pin actions by SHA. Set `persist-credentials: false` everywhere.
- The benchmark's `repo` input should be `type: choice`, **generated** from `corpus.json` with a drift check, and still validated in a script.

### 5.5 Circular dependencies between release gates and CI (found)

| Cycle | Explanation | Resolution |
| :--- | :--- | :--- |
| **G3 ↔ README** | G3 requires README platform list **=** green CI cells *for the tagged commit*. CI results only exist after the commit, and fixing the README needs a new commit, whose CI then must re-run | Gate on **README ⊆ green cells** of the release-candidate commit. Generate the platform table into `docs/platforms.json` from the CI run of the RC commit; the README renders it |
| **G9 ↔ README / CHANGELOG** | The benchmark must run at the release commit, but the reviewed cluster results must be written into the README and CHANGELOG, which creates a new commit | Introduce an **engine-equivalence check**: the release commit may differ from the benchmarked commit **only** in documentation paths. The gate compares git tree hashes of `src/`, `package.json`, `package-lock.json`, and `benchmarks/*.ts` |
| **R-6 ↔ C-3 (human review)** | The publish step waits on a human review, which can stall releases indefinitely | Allow publishing with clusters explicitly listed as `NEEDS_REVIEW` (G9 already allows this). It may never publish precision figures without review (§3.3) |
| **G5 ↔ test migrations** | G5 requires tests that "fail on `585af3d`". Once merged they can't be re-verified to fail without checking out the old commit | CI job `regression-proof` checks out `585af3d` with the new tests and asserts the listed tests **fail** there (run on demand, not on every PR) |

### 5.6 Exit code 4 handling (challenged)

- **Node.js reserves process exit codes** for its own failures: 1 (uncaught fatal exception), 3 (internal JS parse error), **4 (internal JS evaluation failure)**, 5, 6, 7, 9, 10, 12, 13, 14, and >128 for signals.
  - SIS's existing **1 (findings)** is indistinguishable from an uncaught crash.
  - Its documented **3 (engine failure)** and the proposed **4 (inconclusive)** collide with Node-internal meanings.
- **Recommendation:**
  - Keep 0 / 1 / 2. Moving 1 would break every existing CI integration.
  - Install `process.on("uncaughtException" | "unhandledRejection")` handlers in `src/cli.ts` that map SIS crashes to the engine-failure code, so 1 means findings.
  - Move **engine failure** and **inconclusive** to unreserved values: for example **70 (engine failure)**, after sysexits `EX_SOFTWARE`, and **78 (inconclusive)**. The exact values are a decision (**D16**).
  - Document in the README the exit codes Node.js itself can produce.
- **SARIF upload workflows:** `sis audit --sarif > out.sarif` followed by `upload-sarif` would skip the upload on a non-zero exit. Requirements:
  - SIS must **write complete output before exiting** for every exit code except usage errors.
  - Docs must show `continue-on-error: true` or `--allow-inconclusive` for upload jobs.
  - SARIF must carry `invocations[0].exitCode` and `executionSuccessful`.

---

## 6. Review of the engineering decisions

Phase 3's final table omitted **D2** and **D8** (both defined in Phase 2) and added **D5b**. All of them are reviewed here, plus three new decisions from this phase (D14–D16).

| # | Original question | Phase 3 default | Independent recommendation | Rationale | Consequences | Blocks implementation? |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **D1** | Release strategy; 0.1.0 handling | Retro-tag `v0.1.0`; no publish until gates pass; deprecate 0.1.0 after 0.2.0 | **Agree.** Also publish nothing from local machines from now on (`prepublishOnly` guard) | `71d78a1` reproduces the tarball exactly (Phase 2), so a retro-tag is truthful | Users keep getting 0.1.0 until 0.2.0; README must say so (R-0) | Blocks **R-6 only** |
| **D2** | Restate public benchmark claims now; adopt the 4-level taxonomy; count artifacts as FP | *(omitted; body text implies yes)* | **Restate now (R-0) and adopt the taxonomy plus the §3.3 rules** | Current public claims don't match the evidence (Phase 2 V-01, V-05) | Headline numbers fall; trust rises | Blocks **R-0** (wording approval) |
| **D3** | Baselines for non-fuzzed params; arity findings | Shape-valid baselines; arity opt-in, tagged, `warning` | **Agree, plus the D14 input-dependence gate** and same-module interface/type-alias inference | Without the gate, named-interface baselines recreate the commerce artifact (§2.1) | Fewer, better-attributed findings | Blocks **B-4** |
| **D4** | Vacuous runs: exit code | Exit 4 + `--allow-inconclusive` | **Agree in principle; change the number (D16)** | Node reserves 4 (§5.6) | CI scripts must handle the new code | Blocks **B-6c** |
| **D5** | Bundling scope | Pure module declarations only | **Agree, with a stricter purity definition** (classes per §2.1; side-effect imports become caveats) | Static blocks and decorators break the "classes are pure" assumption (probe) | Coverage lower than hoped; measured via accounting | Blocks **B-3b** |
| **D5b** | Shims for absent globals (`crypto`, `URL`, `TextEncoder`) | Not in 0.2.0 | **Agree.** Revisit with corpus coverage data from B-6b | Shims are mocks. Coverage data should justify each one | `crypto.randomUUID` actions stay `NOT_VERIFIED` | No |
| **D6** | OOM, unhandled rejections, validation throws | Diagnostics; validation throws stay SIS003 | **Agree on OOM and rejections.** Validation throws: **agree, subject to D14** | An input-dependent validation throw is real boundary evidence; input-independent ones are gated | — | Blocks **A-3** (diagnostic codes) |
| **D7** | Static findings and exit 1 | Keep exit 1 | **Disagree, partially.** Keep exit 1 for SIS001 (secret flow). Make **SIS002 `warning`** until V-10/V-15 land | SIS002 has the highest reproduced FP rate (name heuristic, transitive client, utilities) | Fewer CI failures from heuristic findings | Blocks **B-6c** |
| **D8** | Platform support statement; `engines`; `--no-node-snapshot` | *(omitted; body: claims follow green CI; narrow `engines` later)* | **Support = green CI cells only.** `engines` stays `>=24` until Node 26 is proven. Don't set `--no-node-snapshot` by default until the soak test (§5.3) | Evidence-based claims | README platform table becomes generated | Blocks **R-5 wording** |
| **D9** | Workflow policy | Least privilege, SHA-pinned, negative controls fatal | **Agree, plus `actionlint`/workflow linter and OIDC trusted publishing** | Defense in depth | — | Blocks **R-5** |
| **D10** | Single-file mode | Run cross-module stages over the import closure | **Agree, in two steps:** first emit an explicit notice (cheap, in B-6a); closure analysis after V-09 alias resolution | Without alias resolution, the import closure is mostly empty in real apps | — | No |
| **D11** | HOF-wrapped actions | Execute only if the wrapper resolves; never bypass silently | **Agree** | Bypassing auth wrappers would misrepresent security semantics | `next-safe-action` users get STATIC_ONLY | Blocks **B-5** |
| **D12** | Seeded-defect synthetic suite | Yes, labeled synthetic | **Agree;** the suite also provides the regression oracle for the D14 gate | Only defensible denominator for detection rates | Extra fixtures to maintain | No |
| **D13** | Source maps in the package | Drop `*.map` (or ship `src/`) | **Drop `*.map`** | Maps without sources add size and no value | Stack traces point to `dist/` | Blocks **R-1** (files list) |
| **D14** *(new)* | Report input-independent runtime failures as findings? | — | **No. Diagnostic SIS109, with a review prompt** | Differential evidence is the core of input-driven verification (§2.6) | Genuine always-crashing bugs become diagnostics | Blocks **A-3 / B-4** |
| **D15** *(new)* | Pin `@swc/core` / `isolated-vm` exactly? | — | **Pin `@swc/core` exactly** (AST shape coupling); keep `isolated-vm` caret within the major, smoke-tested | Caret drift silently changes AST shapes for consumers | Manual bumps via a Renovate PR | Blocks **R-6** |
| **D16** *(new)* | Exit-code numbering | — | Keep 0/1/2; engine failure **70**; inconclusive **78**; map uncaught SIS crashes to 70 | Avoid Node-reserved codes (§5.6) | Breaking change vs the documented 3 | Blocks **B-6c** |

---

## 7. Implementation sequencing review

### 7.1 Problems in the Phase 3 plan

| # | Problem | Evidence | Fix |
| :- | :--- | :--- | :--- |
| S-1 | **Count mismatch.** Phase 3 says "18 small changes". The plan actually lists **20** (R-0, R-1, R-2, R-5, R-6, A-1…A-4, B-1…B-6, C-1…C-3, D-1, D-2). §4.E.2 refers to an **"R-3"** that doesn't exist | Phase 3 §4.E.2, §13 | Renumbered plan in §9 |
| S-2 | **Interim false-positive regression.** A-2/A-3 implement rule 6e (`ReferenceError → app-exception`) before B-3 installs sentinels. In between, every unbundled helper or constant `ReferenceError` (Phase 2: the dominant case) becomes a SIS003 finding | Phase 3 §4.A.5 rule 6e vs B-3 ordering | Until sentinels land, classify untagged `ReferenceError` as `unresolved-binding (unattributed)`, which is the current legacy behavior. Flip the rule **in the same change** that installs sentinels |
| S-3 | **Hang fix missing.** V-26 (indefinite hang) isn't in Phase 3 | §0 DF-2 | New change **S-0** in batch 1; legacy-compatible (no new outcome needed yet) |
| S-4 | **Location fix deferred too late.** V-12 (UTF-8 offsets) is in the "deferred backlog", but line numbers are inputs to cluster fingerprints (C-1) | Phase 3 §13 backlog note | Move V-12 **before** C-1 |
| S-5 | **Characterization baseline missing.** Without golden outputs captured *before* behavior changes, unintended changes can't be told apart from intended ones | — | New change **R-2b**: golden JSON/SARIF/exit-code snapshots of current behavior for fixtures; each later change updates the snapshots with a V-ID justification |
| S-6 | **B-3 too large.** It combines export fixes, planner, bundling, sentinels, and prefix hoisting | Phase 3 B-3 file list | Split into **B-3a** export fixes (alias, default identifier, named default), **B-3b** planner + pure bundling, **B-3c** sentinels + `ReferenceError` flip (S-2), **B-3d** hoisting-aware prefix |
| S-7 | **B-6 too large.** It combines pipeline unification (refactor), accounting, and exit-code policy | Phase 3 B-6 | Split into **B-6a** pipeline unification (behavior-neutral, guarded by R-2b snapshots), **B-6b** accounting, **B-6c** exit codes (after D4/D16/D7) |
| S-8 | **C-1 too large.** It needs source maps for crash sites | Phase 3 §4.C.2 | Split into **C-1a** clustering with action-line crash site (plus §3.1 key fixes), **C-1b** source-mapped crash sites |
| S-9 | **A-4 before A-3** is fine, but A-4 changes `getExternalModuleBindings` (`prefix.ts:29-62`), which B-3b then replaces | Phase 3 A-4/B-3 | Merge A-4's import-binding part into B-3b. Keep A-4 for prelude tagging only (WeakSet identity, §1.3) |
| S-10 | **The D-2 corpus change edits `benchmarks/corpus.json`** (negative-control field) and is mixed with classifier code | Phase 3 D-2 | Move the corpus change into C-2, with the negative-control enforcement it needs |
| S-11 | **Input-dependence gate missing** (§2.6) | — | Add it to **B-4** (it needs baselines) |
| S-12 | **Feature flag `SIS_PLANNER=legacy`** keeps two execution engines alive in a verification tool | Phase 3 B-3 rollback | Acceptable for one minor, **only** if CI runs both modes against the R-2b snapshots. Otherwise drop it and roll back by revert |

### 7.2 High-risk migrations and required compatibility tests

| Migration | Risk | Required compatibility test |
| :--- | :--- | :--- |
| Legacy `RuntimeStatus` → `OutcomeKind` | 63 assertions across 7 test files; library consumers | Mapping table test (`toLegacyStatus`) plus R-2b snapshots; every inverted assertion cites a V-ID |
| JSON v1 → v2 | Downstream parsers | `--format json-v1` golden test identical to the R-2b snapshot, except the documented semantic changes |
| SARIF per-instance → per-cluster, repo-relative URIs | GitHub alert churn | SARIF schema validation; snapshot; a migration note |
| Exit codes (D16) | CI breakage | Exit-code matrix test; README table |
| Multi-argument harness | Payload sets change; seeds no longer comparable across versions | Seed-stability test *within* the version; changelog note |
| Planner replacing the denylist | Coverage changes, sometimes in surprising directions | Execution-integrity fixtures (Phase 2 c01–c26 plus §2 shapes); corpus coverage report before and after |

### 7.3 Rollback requirements

Every change must be revertible by a single `git revert` without data migration. Benchmark history is append-only and never rewritten. Output-format changes keep the old format behind a flag for one minor version. No change may ship a migration of `benchmarks/reviews/ground-truth.json`.

---

## 8. Release gates G1–G12: preserved, with amendments

| Gate | Status | Amendment |
| :- | :--- | :--- |
| G1 | Keep | — |
| G2 | Keep | — |
| G3 | **Amend** | README platform list **⊆** green cells of the RC commit, generated from `docs/platforms.json` (§5.5) |
| G4 | Keep | — |
| G5 | **Amend** | Add the `regression-proof` job (§5.5) and the §1.4 adversarial outcome tests |
| G6 | Keep | — |
| G7 | **Amend** | Both lockfile-faithful and fresh-resolution smoke tests (§5.2); record resolved native dependency versions |
| G8 | Keep | — |
| G9 | **Amend** | Engine-equivalence check (tree hashes) instead of an "at release commit" run; §3.3 precision rules enforced |
| G10 | **Amend** | OIDC trusted publishing; attestation verified after publish |
| G11 | **Amend** | `actionlint` plus a workflow security linter; no `pull_request_target` |
| G12 | Keep | The environment requires a reviewer other than the tag author, if more than one maintainer exists |
| **G13** *(new)* | Add | Wall-clock deadline test: no audit of the adversarial fixture set can exceed its bound (V-26) |
| **G14** *(new)* | Add | Input-dependence gate: the seeded-defect suite (D12) passes, and the commerce-shaped and dynamic-import fixtures yield no SIS003 |

---

## 9. Final recommendations

### 9.1 Final architecture recommendation (for maintainer approval)

**Approve the Phase 3 architecture with these mandatory amendments:**

1. **Runtime (A).**
   - Adopt the **hardened envelope** (§1.3): a closure-captured `ivm.Callback` channel, `WeakSet` identity, intrinsics captured first, fixed-shape null-prototype records.
   - Add the **wall-clock deadline**, the `app-stalled` outcome, `scope`, the `module-init`/`result` phases, and the unhandled-rejection qualifier.
   - Use the revised classification order (§1.2), with **`not-attempted` moved to payload disposition**.
2. **Execution (B).**
   - Adopt the stricter **FULL verification conditions** (§2.2), including the baseline execution and action-scope completion requirements.
   - Use a stricter purity definition for classes, side-effect-import caveats, and full export-shape coverage (default identifiers, default HOF, re-exports, `export *`).
   - Add the **input-dependence gate** (§2.6, D14).
3. **Benchmark (C).** Phase 3's four levels, with the **corrected cluster key** (§3.1: payload-only elision, shared crash sites, URL+commit identity, clone keys, diagnostic clusters) and the **§3.3 precision rules**.
4. **Routing (D).** Project-root resolution, with Next.js-faithful routability (root-`app` precedence, private folders, `pageExtensions`), name-only HTTP exemptions, and a **visible SIS110** for every exemption.
5. **Release/CI (E/F).**
   - Phase 3's pipeline, with OIDC trusted publishing, split job permissions, the gate amendments (§8), and resolution of the gate cycles (§5.5).
   - **Exit codes outside Node's reserved set** (D16).

### 9.2 Decisions requiring maintainer approval

**Before batch 1:**
- D2: wording of the R-0 restatement.
- D8: the platform statement wording.
- D9: workflow policy.
- D13: the `files` list in R-1.

**Before later batches:**
- D1, D3, D4, D5, D6, D7, D11, D14, D15, D16.
- D5b, D10, and D12 are non-blocking, with defaults as recommended.
- A **maintainer with owner rights** (`AashirZayd`) must configure npm trusted publishing, the `npm-publish` environment, and tag protection.

### 9.3 Exact implementation sequence

Each line is one PR. `→` marks a dependency.

| # | Change | Depends on |
| :- | :--- | :--- |
| 1 | **R-0** documentation honesty notice | D2 |
| 2 | **R-1** hygiene (single-source version, `.gitattributes`, remove `ora`, `files` list) | D13 |
| 3 | **R-2a** test independence from `dist/` | — |
| 4 | **R-2b** golden characterization snapshots (JSON v1, SARIF, exit codes) of current behavior | R-2a |
| 5 | **S-0** wall-clock deadline (V-26), mapped to legacy `execution-error` | R-2b |
| 6 | **R-5** CI matrix + workflow hardening + `actionlint` | R-2a, D8, D9 |
| 7 | **L-1** UTF-8 location fix (V-12) | R-2b |
| 8 | **A-1** outcome types + pure classifier (revised rules §1.2) | — |
| 9 | **A-2** hardened envelope worker; **untagged `ReferenceError` stays `unresolved-binding (unattributed)`** (S-2) | A-1, S-0 |
| 10 | **A-4** prelude identity tagging (WeakSet) | A-2 |
| 11 | **A-3** consume outcomes; diagnostics SIS101–SIS107; SIS003/004 narrowed | A-2, D6 |
| 12 | **B-1** closure analysis | — |
| 13 | **B-2** isolate-globals probe | — |
| 14 | **B-3a** export-shape fixes (alias, default identifier/named/anonymous, re-export counted) | A-3 |
| 15 | **B-3b** planner + strict pure bundling + import-bound preludes | B-1, B-2, B-3a, D5 |
| 16 | **B-3c** sentinels + flip untagged `ReferenceError` → `app-exception` | B-3b |
| 17 | **B-3d** hoisting-aware prefix | B-3b |
| 18 | **B-4** multi-argument harness + baselines (incl. interface/type-alias inference) + **input-dependence gate** | B-3c, D3, D14 |
| 19 | **B-5** unified discovery (HOF, `export {}` const, default HOF) | B-3b, D11 |
| 20 | **B-6a** pipeline unification (behavior-neutral; snapshots unchanged) | R-2b |
| 21 | **B-6b** accounting (§2.4) | B-6a, A-3, B-3c |
| 22 | **B-6c** exit codes (D16) + uncaught-handler mapping + D7 severities | B-6b, D4, D7, D16 |
| 23 | **D-1** project-root resolver (refined §4.1) | — |
| 24 | **D-2** routability + per-name exemption + SIS110 | D-1 |
| 25 | **C-1a** clustering (corrected key) + JSON v2 + SARIF notifications/fingerprints | A-3, B-4, L-1 |
| 26 | **C-1b** source-mapped crash sites | C-1a, B-3b |
| 27 | **C-2** benchmark cluster model, precision rules, corpus negative controls, URL+commit de-duplication | C-1a, D-2 |
| 28 | **C-3** historical correction overlay + re-baseline (**human review**) | C-2, B-4, R-0 |
| 29 | **R-6** release workflow (dry-run first; publish after G1–G14) | R-1, R-5, B-6c, C-1a, D-2, D1, D15; publish also needs C-3 |

### 9.4 First implementation batch

**Batch 1 = items 1–7:** R-0, R-1, R-2a, R-2b, S-0, R-5, L-1.

Rationale: none of these changes SIS's finding semantics except S-0 (a safety guard that maps to an existing non-finding status) and L-1 (location correctness). Together they establish the safety net the rest of the plan depends on: honest docs, test independence, characterization snapshots, CI on three OSes, no indefinite hangs, and correct lines.

### 9.5 Acceptance criteria for batch 1

| Item | Acceptance criteria (all must hold) |
| :--- | :--- |
| **R-0** | README and `docs/benchmark.md` no longer state "9 confirmed true positives" or "100% emitted precision" without the historical/pre-correction qualifier and a link to Phase 2. Selective Runtime Verification is marked unreleased (npm 0.1.0 lacks it). `--runs`/seed defaults are described as implemented (25 / unseeded). `benchmarks/KNOWN_LIMITATIONS.md:35,40` corrected. `git diff --stat` touches only `*.md`. Existing `test/docs.test.ts` passes. |
| **R-1** | `node dist/cli.js --version`, `TOOL_VERSION`, and `package.json` agree (new test). `npm ls ora` is empty. `.gitattributes` present, and a build on a `core.autocrlf=true` checkout produces LF output (byte-identical tree hash to a Linux build). `npm pack --dry-run` lists no `dist/analyzer|fuzzer|sandbox` and no `*.map` (per D13). All 340 existing tests pass. |
| **R-2a** | In a fresh clone with **no** `dist/`, `npm ci && npm test` passes 24/24 files (Phase 2 reproduced 5 failing). No test reads a `dist/` from the working tree: integration tests use a temp build dir (verified by deleting `dist/` before running). |
| **R-2b** | Golden snapshots committed for at least: `test/fixtures/project`, `test/fixtures/next-boundaries`, `test/fixtures/real-world/runtime`, plus new fixtures reproducing Phase 2 cases (two-param action, return-function action, dynamic-import action, helper-dependent action, aliased/default exports, unicode-prefixed action, route handler under `app/api`). Snapshots normalize timing fields only. They capture **current (defective)** behavior, labeled with the V-IDs expected to change them. |
| **S-0** | A never-settling `await` fixture completes in < `wallMs` + 500 ms. Status is the existing `execution-error` (not a finding). Exit code unchanged from the R-2b snapshot for other fixtures. Isolate is disposed (no leaked handles: the process exits naturally). Test added to `test/runtime.test.ts`. |
| **R-5** | `ci.yml` runs on push and PR with workflow-level `permissions: contents: read`, SHA-pinned actions, `persist-credentials: false`. **Required (blocking):** ubuntu-latest and windows-latest × Node 24, plus the `fresh-clone` job. **Non-blocking observation jobs:** ubuntu arm, macOS arm, Node 26, `--no-node-snapshot` on/off, Alpine. Each prints `process.versions.modules`. `benchmark.yml` has no `${{ inputs.* }}` inside `run:`, and inputs are validated by a script with a unit test rejecting `$(id)`, `;`, newline, and quote payloads. `actionlint` passes. README platform text unchanged except "tested in CI: …" sourced from green required jobs. |
| **L-1** | The Phase 2 location table (accents, CJK, emoji, 40-CJK line shift, `ñ` literal, BOM, CRLF) reports expected `line:column` for all rows (new parameterized test). `verifiedPrefix` and `stoppedAt.line` use the same mapping. R-2b snapshots change **only** in location fields of the unicode fixture. |

### 9.6 Unresolved risks

1. **Coverage collapse.** Once FULL means proven execution, real-world verification coverage may be very low (Phase 2 V-03 suggests so; not measured). SIS's runtime value proposition then depends on D5/D5b expansions not yet designed in detail.
2. **The input-dependence gate (D14) may hide real always-failing bugs.** It's mitigated by diagnostics, but it's a deliberate recall trade-off.
3. **Proxy traps and thenables run user code during result handling.** Inspection timeouts are attributed correctly, but inspection can't be made side-effect-free in pure JS.
4. **Bundled code semantics differ from production** (fresh module state, no side-effect imports, emulated preludes). Disclosed, not eliminated.
5. **Native dependency matrix.** The ABI 147 mapping, macOS x64 runner availability, Alpine/musl runtime behavior, and `--no-node-snapshot` long-run stability are all **UNVERIFIED**.
6. **Owner-only configuration** (npm trusted publishing, environments, tag rulesets, Actions default permissions) can't be verified or performed with the access used in this audit.
7. **Human review capacity.** C-3 and every defect claim need named reviewers. Without them SIS can only publish counts, not precision.
8. **Reachability of fuzzed inputs** through React's Server Action reply decoding (Phase 2 §12 Q1) is still unanswered. Even gated SIS003 findings may describe inputs a real client can't send.
9. **Exit-code renumbering (D16)** breaks the documented contract (3) for any existing integrator.
10. **The design is unimplemented.** None of the proposed behavior has been verified end to end. The probes validate only the isolated-vm primitives the design relies on.

---

## Appendix A — Probe inventory (scratchpad `p4/`, outside the repository)

| Probe | Validates | Result |
| :--- | :--- | :--- |
| `envelope.mjs` | Phase 3 envelope assumptions, 13 adversarial cases | DF-1 … DF-6. Timeout uncatchable; post-timeout state readable; OOM → disposed; stack overflow catchable; microtask loop bounded; 20 ms budget terminated at 34.8 ms |
| `hang-current.mjs` | Current SIS `runInIsolate` with a never-settling `await` | Still pending after 5 000 ms with `timeoutMs: 20` → **V-26** |
| `hardened.mjs`, `hardened2.mjs` | Callback channel, WeakSet identity, fixed-shape envelope | Forgery defeated; re-throw recognized; global hijack ineffective; `toJSON` poisoning defeated once `for…in` was replaced by captured `Object.keys` |
| `ident.mjs` | Post-capture poisoning of `Object.keys`, `Object.create`, `JSON.stringify` | No effect |
| `shapes/s.mjs` | Discovery of export shapes at HEAD | `export default ident`, `export default HOF()`, `export {} from`, `export *` **not discovered**; `export { act as default }` discovered as `default`; sync exports not discovered (correct: Next.js requires async) |
| `corpus.json` read | Corpus overlap | `dubinc/dub` (`apps/web`) and `dubinc/dub-api` (`apps/web/app/api`): same URL and commit, so nested double coverage |

### New defects recorded in this phase

- **V-26 (P1, CONFIRMED):** an action awaiting a never-settling promise hangs SIS indefinitely (`src/runtime/worker.ts:71-75`, no host deadline).
- **V-27 (P1, CONFIRMED):** discovery misses `export default <identifier>`, `export default <call>(…)`, `export { x } from`, and `export *` in `"use server"` modules (`src/parser/boundary-visitor.ts:138-215`).
- **V-28 (P2, SUPPORTED):** benchmark corpus entries overlap (same URL and commit, nested `targetDir`), so aggregates can double-count files (`benchmarks/corpus.json`, `benchmarks/orchestrator.ts:80-95`).
- **V-29 (P3, CONFIRMED):** Phase 3 document inconsistencies (change count, missing R-3, omitted D2/D8). Corrected here.
