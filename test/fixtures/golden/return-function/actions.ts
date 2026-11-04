"use server";

// Phase 2 V-02: a non-clonable return value is reported as an application exception.
export async function makeCallback(input: { label: string }) {
  return () => input;
}
