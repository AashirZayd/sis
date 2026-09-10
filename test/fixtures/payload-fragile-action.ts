"use server";

export async function executeTransfer(payload: {
  amount: number;
}) {
  return payload.amount.toFixed(2);
}
