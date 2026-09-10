# Basic Server Action Example

This example demonstrates how SIS discovers a candidate Server Action, infers parameter shapes, and synthesizes adversarial payloads to uncover unhandled edge cases.

## Source Code

[`actions.ts`](./actions.ts) exports an async function marked with `"use server"`. It assumes `items` is an array of objects containing numeric `price` and `quantity` properties.

## Run Audit

```bash
npx sis audit examples/basic-action/actions.ts
```

## What SIS Finds

1. **Nullish Payloads**: When passed `null` or `undefined`, `items.reduce` throws `TypeError: Cannot read properties of null (reading 'reduce')`.
2. **Minimal Reproducer**: SIS automatically delta-debugs the failing input and produces the minimal reproducible failure (`null`).
3. **Rule Triggered**: `SIS003: runtime-exception`.
