"use server";

export async function processOrder(payload: { id: string }) {
  if (!payload || !payload.id) {
    return { status: "missing_id" };
  }
  return { status: "processed", orderId: String(payload.id) };
}
