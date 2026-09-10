"use server";

export async function submitOrder(orderId: string, quantity: number) {
  if (quantity <= 0) throw new Error("Invalid quantity");
  return { orderId, status: "confirmed" };
}
