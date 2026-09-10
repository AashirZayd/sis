# React Flight Serialization Boundary Example

This example illustrates React Server Component (RSC) boundary rules under React Flight serialization semantics.

## Source Code

- [`ServerCard.tsx`](./ServerCard.tsx): A Server Component that passes an event handler (`onSelect`) as a prop into a Client Component.
- [`ClientCard.tsx`](./ClientCard.tsx): A Client Component (`"use client"`).

## Run Audit

```bash
npx sis audit examples/serialization
```

## What SIS Finds

1. **Serialization Violation**: React Flight does not allow ordinary server-side functions or closures to cross into Client Components unless they are explicitly marked as Server Actions (`"use server"`).
2. **Rule Triggered**: `SIS002: serialization-violation`.
3. **Remediation**: Remove server-side event handlers or convert the handler into a dedicated Server Action with `"use server"`.
