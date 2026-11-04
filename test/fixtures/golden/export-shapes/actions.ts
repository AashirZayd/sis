"use server";

// Phase 2 V-03 / Phase 4 V-27: aliased and default exports.
async function internalTotal(input: { amount: number }) {
  return input.amount.toFixed(2);
}

export { internalTotal as total };

export default async function (input: { amount: number }) {
  return input.amount.toFixed(2);
}
