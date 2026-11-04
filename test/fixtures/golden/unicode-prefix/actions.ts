"use server";

// Ünïcödé prefix: 漢字 and emoji 🚀 shift UTF-8 byte offsets (Phase 2 V-12).
const label = "ñandú 🚀";

export async function describe(input: { amount: number }) {
  return label + input.amount.toFixed(1);
}
