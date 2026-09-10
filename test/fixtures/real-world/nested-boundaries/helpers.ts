export function calculateDiscount(price: number): number {
  return price * 0.1;
}

export async function fetchInventory(itemId: string) {
  return { itemId, inStock: true };
}

export async function inlineServerAction(itemId: string) {
  "use server";
  return { itemId, reserved: true };
}
