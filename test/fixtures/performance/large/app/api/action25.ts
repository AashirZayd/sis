"use server";
import { formatItem25 } from "../../lib/util25.js";
export async function handleAction25(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem25(input.id), name: input.name.trim() };
}
