"use server";
import { formatItem13 } from "../../lib/util13.js";
export async function handleAction13(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem13(input.id), name: input.name.trim() };
}
