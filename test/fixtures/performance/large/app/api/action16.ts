"use server";
import { formatItem16 } from "../../lib/util16.js";
export async function handleAction16(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem16(input.id), name: input.name.trim() };
}
