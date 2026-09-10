"use server";
import { formatItem09 } from "../../lib/util09.js";
export async function handleAction09(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem09(input.id), name: input.name.trim() };
}
