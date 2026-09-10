"use server";
import { formatItem01 } from "../../lib/util01.js";
export async function handleAction01(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem01(input.id), name: input.name.trim() };
}
