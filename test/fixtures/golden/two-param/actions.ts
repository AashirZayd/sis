"use server";

// Phase 2 V-01: only argument 0 is synthesized; `payload` is always undefined.
export async function updateQuantity(prevState: unknown, payload: { id: string; quantity: number }) {
  const { id, quantity } = payload;
  return { id, quantity };
}
