"use server";
import { formatItem20 } from "../../lib/util20.js";
export async function handleAction20(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem20(input.id), name: input.name.trim() };
}
