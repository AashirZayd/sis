# Phase 25.5 Adversarial Validation & Semantic Soundness Audit

## Executive Summary

Following the forensic audit of the selective prefix slicer in Phase 25.5A, Phase 25.5B converts empirical observations and edge cases into permanent adversarial regression coverage. The audit specifically probed AST boundaries, control flow structures, expression trees, parameter initializers, framework preludes, and sandbox isolation guarantees.

Across all evaluated scenarios, the prefix slicer and isolated runtime environment **fail closed under the tested cases**. Unsupported host dependencies, unbundled module-scope helpers, parameter defaults referencing host globals, and post-boundary side effects are either statically categorized as `STATIC_ONLY`, safely excised prior to runtime evaluation, or trapped cleanly inside isolated-vm without yielding spurious runtime exception findings (SIS003).

> [!NOTE]
> This analysis provides **adversarial regression coverage** for tested AST configurations and runtime invariants. It does not claim formal mathematical verification of arbitrary JavaScript program semantics.

---

## Adversarial Invariants & Regression Coverage

A dedicated test suite (`test/selective-runtime-adversarial.test.ts`) adds 23 permanent regression tests covering 9 semantic verification categories:

### 1. AST Traversal & Expression Depth (12 Probe Dimensions)
The SWC AST traversal was tested against deep, nested, and compound syntactic constructs:
- **Destructuring**: Standard (`const { a } = payload`) and nested destructuring with aliasing and rest elements (`const { a, b: { c: localC }, ...rest } = payload`) are preserved in prefix execution.
- **Payload-Derived Values**: String operations (`payload.value.toLowerCase().trim()`) execute safely in isolated-vm against valid payloads and fail deterministically (`TypeError`) on nullish inputs.
- **Expression-Embedded Unsupported Calls**: Unsupported dependencies embedded in conditional ternary branches (`cond ? val : db.get()`), template literals (`` `${db.prefix}${val}` ``), computed property keys (`{ [db.key]: val }`), and nested arrow function declarations (`() => db.get()`) are recursively identified, causing the action to fail closed as `STATIC_ONLY`.
- **Compound Statements**: `try/finally` compound statements referencing unsupported APIs in either the `try` or `finally` block are treated conservatively as atomic units, halting prefix slicing at statement 0 (`STATIC_ONLY`).
- **TypeScript Annotations**: SWC type annotations (`payload: { id: string }`, `Promise<{ ok: boolean }>`) are stripped cleanly without triggering false dependency detections.
- **Empty Action Bodies**: Zero-statement bodies (`export async function action(payload) {}`) evaluate in `FULL` mode without errors.

### 2. Code-After-Boundary Guarantee
- **Mandatory Invariant**: Code residing lexically after an unsupported dependency must never execute under any circumstance.
- **Verification**: In actions containing:
  ```ts
  "use server";
  export async function action(payload) {
    const value = payload.value;
    await db.save(value);
    throw new Error("POST_BOUNDARY_EXECUTED");
    globalThis.__POST_BOUNDARY = true;
  }
  ```
  The AST slicer physically excises `db.save(...)`, the post-boundary `throw`, and the global mutation from the candidate AST node, terminating the sliced function with a synthetic return sentinel (`return { __sis_prefix_complete: true };`).
- **Result**: Post-boundary code is physically absent from the isolate script and cannot execute.

### 3. Default-Parameter Guarantee
- **Mandatory Invariant**: Parameter initializers execute before the function body; an unsupported call in a default parameter cannot be bypassed by slicing body statements.
- **Verification**: Actions with parameter defaults referencing host globals or external packages (e.g. `payload = db.get()` or `config = process.env.CONF`) are audited prior to statement analysis.
- **Result**: The slicer immediately marks the action as `STATIC_ONLY`, candidate extraction returns `null`, and no isolate execution occurs.

### 4. Fail-Closed Module Helper Limitation
- **Behavior**: In-file helper functions defined at the module scope outside the exported action (e.g. `function validate(v) { return v.trim(); }`) are not currently bundled into the candidate function module.
- **Fail-Closed Guarantee**: When the extracted candidate executes in isolated-vm, calling `validate()` triggers a V8 `ReferenceError: validate is not defined`. SIS traps unhandled `ReferenceError` inside isolated-vm and classifies the result as `status: "unsupported"`, discarding the run rather than flagging it as an application bug (SIS003).
- **Classification**: This is an intentional **coverage limitation**, not a soundness bug.

### 5. Conservative Shadowing Behavior
- **Behavior**: If an action declares a local identifier or import that shadows a host global name (e.g. `const db = { save: () => {} }; db.save();`), `UNSUPPORTED_HOST_GLOBALS.has("db")` conservatively treats it as an unsupported dependency.
- **Result**: The action is classified as `STATIC_ONLY`.
- **Principle**: `STATIC_ONLY > unsound execution`. Shadowed identifiers never lead to unverified or unsafe execution.

### 6. Runtime Provenance
- All verified prefix executions consistently report:
  - `executionMode: "PREFIX"`
  - `verifiedPrefix`: `{ startLine, endLine }`
  - `stoppedAt`: `{ dependency, reason, line }`
  - `runtimeProvenance`: synchronized with the finding and action summary.

### 7. Prelude Framework Flow Control
- **`redirect()` & `notFound()`**: Next.js server actions frequently invoke `redirect()` or `notFound()` on valid authorization or validation states. The deterministic preludes throw synthetic `NEXT_REDIRECT` and `NEXT_NOT_FOUND` control errors, which are intercepted in `runInIsolate` and marked as `status: "passed"` rather than application failures.
- **Cache Preludes**: `revalidatePath()`, `revalidateTag()`, and `unstable_noStore()` execute deterministically as in-memory no-ops.
- **Cookies & Headers**: In-memory mock stores provide case-insensitive header matching and cookie CRUD operations.

### 8. Payload Integrity
- **Mandatory Invariant**: Fuzz payload objects passed by the host engine must not be mutated by isolate execution.
- **Verification**: Transferred payloads are cloned via `ivm.ExternalCopy(payload).copyInto()`. Mutations performed by action code inside the sandbox (`delete`, property reassignment, array modification) only affect the isolate-internal copy.
- **Result**: Host-side payload objects remain 100% unmutated across execution cycles.

### 9. Semantic Determinism
- Repeated executions of the adversarial test suite confirm identical execution modes, retained statement counts, `stoppedAt` boundaries, failure signatures, and provenance metadata across runs.

---

## Benchmark Stability & Baseline Verification

The pinned 5-repository benchmark baseline established in Phase 25 was verified:
- **Repositories**: 5/5 succeeded.
- **Files Analyzed**: 3,804 across 1,730 server boundaries.
- **Server Actions**: 20 discovered (18 `STATIC_ONLY`, 2 `sandbox-compatible` / `prefix-compatible`).
- **Confirmed True Positives**: All 9 findings in `vercel/commerce` (`components/cart/actions.ts` `updateItemQuantity`) remain 100% detected.
- **Historical Precision**: 0 false positives, 0 framework artifacts, 0 analysis errors.

---

## Remaining Limitations

1. **Module-Scoped Helper Inlining**: Functions calling module-scoped helper functions cannot currently execute in `PREFIX` or `FULL` mode because helper declarations are not extracted into the isolated-vm harness. They fail closed as `unsupported`.
2. **Top-Level Block Granularity**: Slicing operates at the top-level body statement array. Control flow branches (`if`, `switch`, `try`) containing an unsupported API call are treated as atomic units and cannot be partially sliced.
3. **Conservative Global Shadowing**: Local variables matching unsupported host global names (e.g. `db`, `prisma`, `redis`) trigger static-only fallback.
