"use server";
import { formatItem11 } from "../../lib/util11.js";
export async function handleAction11(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem11(input.id), name: input.name.trim() };
}
