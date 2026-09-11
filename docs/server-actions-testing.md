# Testing Next.js Server Actions: Edge Cases, Fuzzing & Runtime Verification

Testing modern Next.js Server Actions requires a fundamentally different mindset than testing conventional Node.js API routes or pure functions.

In Next.js App Router applications, Server Actions are async functions marked with `"use server"` that can be invoked directly across the network by client components, HTML forms, or third-party callers. Because they sit directly on the network boundary, Server Actions must be defended against untrusted, un-sanitized, and malformed inputs.

---

## Why Conventional Unit Tests Miss Boundary Bugs

Standard developer-written unit tests (using Vitest, Jest, or Mocha) focus on the **happy path** and expected business logic:

```typescript
// pricing.ts
"use server";

export async function calculateDiscount(price: number, discountRate: number) {
  return Number((price * (1 - discountRate)).toFixed(2));
}

// pricing.test.ts
test("calculates valid 20% discount", async () => {
  const result = await calculateDiscount(100, 0.2);
  expect(result).toBe(80);
});
```

The test passes. But in production, the function receives inputs serialized over the wire from untrusted clients. What happens when:
- `discountRate` is `null` or `undefined`?
- `discountRate` is `NaN`, `-0`, `Infinity`, or `-Infinity`?
- `price` is passed as a string or object?
- `toFixed()` is invoked on a non-finite number, throwing `RangeError: toFixed() digits argument must be between 0 and 100`?

Conventional tests validate **developer assumptions**, not **boundary realities**.

---

## The Spectrum of Server Action Edge Cases

When auditing Server Actions, SIS systematically synthesizes inputs from seven critical hazard categories:

### 1. Nullish & Incomplete Shapes
TypeScript types are erased at compile time. At runtime, an argument typed as `{ user: { id: string } }` can be received as `null`, `undefined`, or `{ user: null }`. Unchecked property access immediately throws:
```text
TypeError: Cannot read properties of null (reading 'id')
```

### 2. Numeric Singularities
JavaScript numbers have several hazard states that evade simple truthiness checks:
- `0` vs `-0` (affects division: `1 / 0` is `Infinity`, while `1 / -0` is `-Infinity`)
- `NaN` (`NaN !== NaN`, so equality guards fail)
- `Infinity` and `-Infinity` (overflow arithmetic)
- `MAX_SAFE_INTEGER + 1` (precision loss in financial/database IDs)

### 3. Prototype-Sensitive Payloads
Objects parsed from untrusted payloads can carry `__proto__` or `constructor.prototype` keys. When merged or queried without defensive checks, these can alter prototype chain properties across the runtime context.

### 4. Deep Destructuring Hazards
Complex function signatures using parameter destructuring crash before entering the function body if the root argument is `null` or `undefined`:
```typescript
export async function updateProfile({ user: { id, name } }: ProfileInput) {
  // If invoked with null, crashes with TypeError before this line executes!
}
```

### 5. Secret-Tainted Data Leakage
Server Actions frequently query databases or server-only session stores. If private environment credentials (`process.env.AUTH_SECRET`) flow into the return value of a Server Action, they become visible in the client network response.

---

## How SIS Verifies Server Actions

SIS combines static AST analysis with isolated dynamic verification:

1. **AST & Boundary Discovery**: Uses `@swc/core` to discover exported functions with module-level or inline `"use server"` directives.
2. **Speculative Shape Inference**: Inspects parameter destructuring, property accesses, and TypeScript type signatures to determine the expected structural envelope.
3. **Property-Based Synthesis**: Uses `fast-check` to generate boundary-directed mutations (extremes, nulls, prototype pollutions, type swaps).
4. **Isolated V8 Execution**: Candidate functions that are sandbox-compatible are executed inside an `isolated-vm` isolate with strict CPU timeouts (default: 20ms).
5. **Delta-Debugging Shrinking**: When a synthesized input throws an uncaught exception, SIS automatically strips irrelevant fields to produce the minimal reproducible payload.

---

## Framework-Dependent Actions & The Compatibility Gate

Not every Server Action can or should be executed in an isolated V8 sandbox. Actions that rely on live Next.js request context:
- `cookies()` from `next/headers`
- `headers()` from `next/headers`
- `redirect()` and `notFound()` from `next/navigation`
- Live database ORM connections (Prisma, Drizzle, Mongoose)

SIS classifies these actions as **static-only**. They are analyzed statically for secret taint, directive correctness, and React Flight serializability, but bypassed from isolate execution to prevent false-positive crashes.

---

## Remediation Best Practices

1. **Always Validate at the Boundary**: Validate inputs at the very top of the action using a runtime schema validator such as Zod, ArkType, or Valibot:
   ```typescript
   "use server";
   import { z } from "zod";

   const InputSchema = z.object({
     price: z.number().positive().finite(),
     discountRate: z.number().min(0).max(1),
   });

   export async function calculateDiscount(rawInput: unknown) {
     const parsed = InputSchema.safeParse(rawInput);
     if (!parsed.success) {
       throw new Error("Invalid discount parameters");
     }
     const { price, discountRate } = parsed.data;
     return Number((price * (1 - discountRate)).toFixed(2));
   }
   ```
2. **Defend Destructuring Defaults**: Provide explicit default fallback objects for destructured parameters:
   ```typescript
   export async function update({ user = {} }: Input = {}) { ... }
   ```
3. **Never Return Private State**: Return only the exact public fields intended for client rendering.

---

## Related Guides

- [React Flight Serialization Boundaries](./serialization-boundaries.md)
- [Adversarial Testing & Speculative Fuzzing](./adversarial-testing.md)
- [Static Secret Taint Analysis](./taint-analysis.md)
- [Architecture & Pipeline Specification](./architecture.md)
- [Frequently Asked Questions](./faq.md)
