"use server";

export async function validateToken(payload: unknown) {
  if (typeof payload === "string" && payload.length > 0) {
    return { valid: true };
  }
  return { valid: false };
}
