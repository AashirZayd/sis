"use server";

// Phase 2 V-03: module-scope helpers and constants are not bundled into the isolate.
const PRECISION = 2;

function format(value: number) {
  return value.toFixed(PRECISION);
}

export async function formatAmount(input: { amount: number }) {
  return format(input.amount);
}
