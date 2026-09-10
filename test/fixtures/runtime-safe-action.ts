"use server";

export async function safeLookup(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("id" in payload)
  ) {
    return { ok: false };
  }

  return { ok: true };
}
