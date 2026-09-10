"use server";
import { formatItem07 } from "../../lib/util07.js";
export async function handleAction07(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem07(input.id), name: input.name.trim() };
}
