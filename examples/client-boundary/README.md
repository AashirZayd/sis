# Defensive Client Boundary & Server Action Example

This example demonstrates a properly defended Server Action invoked from a Client Component.

## Source Code

- [`actions.ts`](./actions.ts): A Server Action performing defensive input validation on its arguments.
- [`FeedbackForm.tsx`](./FeedbackForm.tsx): A Client Component that safely invokes the Server Action.

## Run Audit

```bash
npx @aashirzayd/sis audit examples/client-boundary
```

## What SIS Finds

1. **Defensive Validation**: The action throws an explicit error when unexpected inputs are received and handles missing comments safely.
2. **Fuzzing Exploration**: SIS fuzzes `rating` with boundary numbers (`0`, `-0`, `NaN`, `Infinity`, `6`) and verifies that invariants are maintained without uncaught crashes.
