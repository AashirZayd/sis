"use server";

export async function transferFunds(payload: { amount: number; recipientId: string }) {
  if (!payload.recipientId || payload.recipientId.length === 0) {
    throw new Error("Recipient ID required");
  }
  return { formatted: payload.amount.toFixed(2), recipient: payload.recipientId };
}

export async function processHeavyBatch(payload: { items: any[]; freeze?: boolean }) {
  if (payload.freeze) {
    while (true) {}
  }
  return { processed: payload.items.length };
}

export async function syncDatabase(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user;
}
