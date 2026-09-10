# Interprocedural Taint Flow Example

This example demonstrates how SIS performs interprocedural data-flow analysis to detect sensitive environment secrets leaking across Client/Server boundaries.

## Source Code

- [`session.ts`](./session.ts): Helper module accessing `process.env.AUTH_SECRET` and returning it inside an object structure.
- [`Profile.tsx`](./Profile.tsx): A Client Component (`"use client"`) importing and rendering the profile data into JSX.

## Run Audit

```bash
npx sis audit examples/taint
```

## What SIS Finds

1. **Multi-Hop Secret Flow**: `process.env.AUTH_SECRET` $\to$ `getSessionSecret` $\to$ `getUserProfile` $\to$ `ProfileView` JSX sink.
2. **Rule Triggered**: `SIS001: taint-violation`.
3. **Remediation**: Ensure secret server-side tokens remain strictly within server modules and are never passed to Client Components.
