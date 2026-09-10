"use server";

export interface SafePayload {
  id?: string;
}

// Resilient candidate server action designed to handle edge cases safely
export async function safeLookup(payload: SafePayload | null | undefined) {
  if (!payload || typeof payload !== "object" || typeof payload.id !== "string") {
    return { success: false, error: "Invalid payload: id must be a string" };
  }

  return { success: true, id: payload.id.trim() };
}
