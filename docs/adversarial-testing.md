# Adversarial Testing & Speculative Fuzzing

Fuzz testing has historically been associated with native C/C++ binaries, byte arrays, and network protocol decoders. Applying fuzzing effectively to TypeScript and Next.js applications requires a specialized, boundary-aware approach.

SIS introduces **Speculative Invariant Synthesis**: combining static AST shape inference with property-based adversarial payload generation and delta-debugging failure minimization.

---

## Why Generic Fuzzers Fail on Web Applications

Traditional fuzzers (AFL, libFuzzer, or blind random generators) treat inputs as raw byte streams. When pointed at a TypeScript function expecting a typed object, a blind fuzzer spends millions of cycles generating malformed byte arrays that fail before exercising meaningful application logic.

Conversely, standard property-based testing libraries (such as QuickCheck or `fast-check`) require developers to manually write custom generators (`fc.record({ ... })`) for every single function they want to test.

**SIS bridges this gap autonomously**:
1. It analyzes the AST to **infer** expected parameter shapes automatically.
2. It synthesizes adversarial edge cases targeted specifically at discovered Next.js boundary semantics.
3. It executes candidates in a zero-privilege V8 isolate without requiring developer-written test harnesses.

---

## Speculative Shape Inference

Before generating payloads, SIS inspects how a candidate function uses its parameters:

- **TypeScript Type Annotations**: Inspects parameter types (primitives, unions, interfaces, type references).
- **Parameter Destructuring**: Identifies expected keys:
  ```typescript
  export async function processOrder({ orderId, items, customer: { email } }: OrderInput) { ... }
  ```
  SIS infers that the root argument is an object with `orderId`, `items`, and a nested `customer` object containing `email`.
- **Property Accesses**: Traces `param.field` accesses inside the function body.

From this AST evidence, SIS builds an internal shape model for each candidate action.

---

## Targeted Mutation Strategies

Using `fast-check` and specialized heuristic generators, SIS synthesizes inputs across seven hazard classes:

| Strategy | Synthesized Inputs | Target Invariants |
| :--- | :--- | :--- |
| **Nullish Hazards** | `null`, `undefined`, sparse arrays `[,]` | Unchecked property access, missing null guards |
| **Numeric Extremes** | `0`, `-0`, `NaN`, `Infinity`, `-Infinity`, `Number.MAX_SAFE_INTEGER + 1`, `Number.MIN_VALUE` | Precision loss, division by zero, float formatting crashes |
| **Prototype Hazards** | `{ __proto__: { admin: true } }`, `{ constructor: { prototype: { polluted: true } } }` | Prototype pollution, key pollution in object merges |
| **Deep Nesting** | Multi-level nested objects and arrays | Call-stack overflow, deep destructuring failures |
| **Serialization Traps** | Custom class instances, closures, symbols | React Flight wire transfer incompatibilities |
| **Primitive Mismatches**| `"42"` instead of `42`, `[]` instead of `{}`, `true` instead of `"true"` | Weak equality bugs, type confusion |
| **Boundary Strings** | Empty string `""`, whitespace, massive strings, injection patterns | String trimming, regex catastrophic backtracking |

---

## Linear Budgeting: $O(T \cdot N)$ Scaling

In complex codebases with dozens of Server Actions, running combinatorial mutations across all parameters would cause execution time to explode exponentially.

SIS enforces a strictly bounded linear budget model:

$$\text{Total Payloads} = T \times N$$

Where:
- $T$ = Number of discovered candidate targets (actions)
- $N$ = Synthesized runs per target (configured via `--runs`, default: 10)

This prevents accidental combinatorial explosion, ensuring that a 100-target project with `--runs 10` executes exactly 1,000 synthesized payloads in predictable wall-clock time (~3.5 seconds).

---

## Zero-Privilege Isolate Execution

Executing synthesized payloads against application code must never compromise the host machine. SIS executes candidate functions inside `isolated-vm`:

- **No Host Access**: The V8 isolate has no access to Node.js `process`, `fs`, `child_process`, `net`, `fetch`, or host environment variables.
- **Enforced Execution Deadlines**: Every payload execution is constrained to a strict CPU timeout (configured via `--timeout`, default: 20ms).
- **Infinite Loop Defense**: If an action enters an infinite loop (`while(true)`), the isolate cleanly aborts and reports `SIS004: timeout`.

Framework-dependent functions requiring live request context (`cookies()`, database connections) are routed to static-only verification via the **Compatibility Gate**, ensuring sandbox isolation without executing host dependencies.

---

## Failure-Preserving Delta-Debugging Shrinking

Raw property-based inputs that trigger errors are often large, noisy, and difficult to diagnose:

```json
{
  "orderId": "ord_98234",
  "items": [{ "sku": "A1", "price": 10, "meta": { "internal": true } }],
  "customer": { "email": "user@example.com", "profile": { "age": 28, "role": null } },
  "notes": "urgent delivery"
}
```

When an uncaught exception is detected, SIS captures its **Failure Signature** (function name + error constructor + message pattern) and triggers an automatic delta-debugging engine:

1. Systematically removes non-essential keys.
2. Simplifies complex objects into empty objects or scalars.
3. Re-executes the candidate payload inside the isolate.
4. If the simplified input triggers the **identical failure signature**, the smaller input is retained.
5. If the simplified input passes or causes a different error, it is discarded.

The result is a **Minimal Reproducible Failure**:

```json
{ "customer": { "profile": { "role": null } } }
```

Showing developers exactly what caused the crash with up to 95% noise reduction.

---

## Related Guides

- [Testing Next.js Server Actions](./server-actions-testing.md)
- [React Flight Serialization Boundaries](./serialization-boundaries.md)
- [Static Secret Taint Analysis](./taint-analysis.md)
- [Architecture Specification](./architecture.md)
- [Frequently Asked Questions](./faq.md)
