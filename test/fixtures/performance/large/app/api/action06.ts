"use server";
import { formatItem06 } from "../../lib/util06.js";
export async function handleAction06(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem06(input.id), name: input.name.trim() };
}
