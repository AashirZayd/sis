"use server";

export interface TransferPayload {
  amount: number;
  recipientId: string;
}

// Fragile candidate server action that crashes on null/undefined or missing fields
export async function executeTransfer(payload: TransferPayload) {
  // Deliberate invariant violation when payload is null or amount is missing/not a number
  const formattedAmount = payload.amount.toFixed(2);
  return {
    success: true,
    transferId: `tx_${payload.recipientId}_${formattedAmount}`,
  };
}
