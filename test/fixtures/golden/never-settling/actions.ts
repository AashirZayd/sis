"use server";

// Phase 4 V-26: awaiting a promise that never settles used to hang SIS forever,
// because V8's CPU timeout does not cover idle waiting. Added after change S-0.
export async function waitForApproval(input: { id: string }) {
  await new Promise(() => {});
  return input.id;
}
