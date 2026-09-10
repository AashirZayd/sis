"use server";

export async function calculateTotal(items: { price: number; quantity: number }[]) {
  // Edge cases missed: null/undefined input, missing item properties, non-numeric values
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
