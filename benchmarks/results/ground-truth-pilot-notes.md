# Ground-Truth Validation Pilot: Engine Limitations & Architecture Notes

**Document Status**: Human-Review Pilot Analysis (Phase 22)  
**Corpus**: 5 pinned real-world Next.js repositories (`shadcn-ui/taxonomy`, `leerob/site`, `vercel/commerce`, `dubinc/dub`, `mickasmt/next-saas-stripe-starter`)  
**Sample Size**: 10 findings evaluated (5 `SIS002`, 5 `SIS003`)  
**Pilot Precision**: **33.3%** ($2 / (2 + 4)$ over binary classifications; 1 unreachable, 3 framework artifacts excluded)

---

## Executive Summary

During Phase 22, 10 deterministic findings produced by SIS across the benchmark corpus were manually investigated by human review. The review inspected source code, execution contexts, network boundaries, and framework conventions at pinned commits.

Of the 10 findings:
- **2 True Positives (`TRUE_POSITIVE`)**: Missing defensive input validation at public Server Action boundaries in `vercel/commerce` (`components/cart/actions.ts#L54`). Unconditionally destructuring `payload` outside `try/catch` causes uncaught `TypeError` crashes when invoked with empty/nullish arguments.
- **4 False Positives (`FALSE_POSITIVE`)**: Safe patterns misclassified by static rules, primarily Route Handlers returning standard Web API `Response` objects and an implicit Client Component passing callback props.
- **1 Unreachable (`UNREACHABLE`)**: Playwright test fixture in `playwright/api/fixtures.ts` that is dead code relative to client network traffic.
- **3 Framework Artifacts (`FRAMEWORK_ARTIFACT`)**: Isolated V8 execution failures caused by un-mocked external SDKs (`@/lib/upstash` Redis and `@ai-sdk/rsc`) rather than defects in application logic.

This pilot identified **4 core engine limitations** to be addressed in subsequent SIS development phases.

---

## 1. Route Handler Misclassification (`SIS002`)

### Problem
Exported HTTP route handlers (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) located in `app/**/route.ts` or `app/**/route.tsx` were evaluated against React Flight RPC serialization rules (`SIS002`).

### Observed Findings
- `c39ca66764d41da4`: `shadcn-ui/taxonomy` (`app/api/webhooks/stripe/route.ts#L70`)
- `0f4dc5c476d30776`: `mickasmt/next-saas-stripe-starter` (`app/api/webhooks/stripe/route.ts#L76`)
- `29e87e4da896d3bd`: `dubinc/dub` (`app/api/og/analytics/route.tsx#L121`)

### Code Example
```typescript
// app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  // ...
  return new Response(null, { status: 200 }); // Web API Response
}
```

### Analysis & Root Cause
Next.js App Router Route Handlers communicate via standard HTTP requests and responses. Returning `new Response(...)` or `new ImageResponse(...)` is fully valid Web API semantics. React Flight serialization constraints only apply to React Server Actions (`"use server"`) and Server-to-Client Component prop boundaries. Flagging a `Response` object as non-serializable in a Route Handler is a false positive.

### Planned Engine Improvement
- Refine static boundary detection in `src/rules/serialization.ts`:
  - Exclude files matching `**/route.ts` and `**/route.tsx` from React Flight serialization rules.
  - Check for standard HTTP method names (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`) in Route Handlers and treat their returns under HTTP Response semantics rather than Flight protocol.

---

## 2. Non-Production Test File Scanning (`SIS002`)

### Problem
Files in testing and end-to-end fixture directories were scanned as potential Server Actions.

### Observed Finding
- `3d7a805fc6c00f5c`: `dubinc/dub` (`playwright/api/fixtures.ts#L78`, `createBearerApiClient`)

### Code Example
```typescript
// playwright/api/fixtures.ts
export function createBearerApiClient(...) { ... }
```

### Analysis & Root Cause
Test helper utilities in `playwright/` export functions that return complex objects, mocks, or API client instances. These functions are never deployed or exposed over the network to web browsers in production. Flagging them as invariant violations creates noise for developers.

### Planned Engine Improvement
- Add default ignore patterns to SIS file discovery:
  - Exclude `playwright/`, `e2e/`, `cypress/`, `__tests__/`, `test/`, and `tests/` directories unless explicitly configured via `--include-tests`.
  - Exclude files with `.test.ts`, `.spec.ts`, `.test.tsx`, `.spec.tsx`.

---

## 3. Implicit Client Component Prop Boundary (`SIS002`)

### Problem
A component utilizing React client-side hooks (`useState`, `useRouter`) without a top-level `"use client"` string literal was misidentified as a React Server Component passing a non-serializable callback prop.

### Observed Finding
- `a3d2599493cc79a3`: `dubinc/dub` (`ui/modals/add-workspace-modal.tsx#L57`)

### Code Example
```tsx
// ui/modals/add-workspace-modal.tsx
// (No top-level "use client" directive in this file; inherited from parent modal wrapper)
export function AddWorkspaceModal() {
  const router = useRouter();
  // ...
  return (
    <CreateWorkspaceForm
      onSuccess={(slug) => {
        router.push(`/${slug}`);
      }}
    />
  );
}
```

### Analysis & Root Cause
In React Server Components, passing a function callback (`onSuccess={...}`) across the Server-to-Client boundary is invalid because functions cannot be serialized across the Flight protocol. However, in this case, `AddWorkspaceModal` is itself a Client Component (invoked within a client modal provider and calling client hooks). Because the file did not declare `"use client"` at line 1, the AST analyzer treated it as a Server Component.

### Planned Engine Improvement
- Enhance AST heuristics:
  - If a component file calls standard React client hooks (`useState`, `useEffect`, `useRouter`, `useParams`, `useSearchParams`, `useFormState`), infer that the file operates in client scope even if the directive is missing at the top of that specific file.
  - Future work: construct a component dependency graph to propagate `"use client"` context downward from parent imports.

---

## 4. External Library Compatibility Gate Gaps (`SIS003`)

### Problem
Functions importing cloud SDKs or singleton clients (`@/lib/upstash` Redis client, `@ai-sdk/rsc`) bypassed the Compatibility Gate and threw artificial `ReferenceError` crashes during V8 isolate fuzzing.

### Observed Findings
- `69467cae947cf138`: `dubinc/dub` (`lib/actions/partners/force-withdrawal.ts#L41`)
- `ba9ad4d3f2e2fcec`: `dubinc/dub` (`lib/actions/partners/force-withdrawal.ts#L41`)
- `b03911739869bf77`: `dubinc/dub` (`lib/ai/generate-csv-mapping.ts#L8`)

### Code Example
```typescript
// lib/actions/partners/force-withdrawal.ts
import { redis } from "@/lib/upstash";
// ...
await redis.set(`withdrawal:${partnerId}`, "pending");
```

### Analysis & Root Cause
In `isolated-vm`, `redis` and `createStreamableValue` are not bound in the sandbox context. When executed, V8 throws `ReferenceError: redis is not defined` or `createStreamableValue is not a function`. SIS reported these as `SIS003` runtime exceptions. These crashes do not reflect application input handling defects; they are artifacts of testing code in an isolated V8 sandbox without the underlying cloud services or polyfills.

### Planned Engine Improvement
- Extend the `CompatibilityGate` static analyzer:
  - Detect imports from un-mocked external services and cloud data layers (e.g. Upstash, Redis, AI SDK, Stripe, Prisma, Supabase) and skip runtime fuzzing if mock stubs are unavailable.
  - Expand the isolate environment prelude (`src/runtime/isolate-prelude.ts`) with no-op proxy mocks for common ecosystem singletons.
