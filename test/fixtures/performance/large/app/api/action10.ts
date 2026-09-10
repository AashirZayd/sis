"use server";
import { formatItem10 } from "../../lib/util10.js";
export async function handleAction10(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem10(input.id), name: input.name.trim() };
}
