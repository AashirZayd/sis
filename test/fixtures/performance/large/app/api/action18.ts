"use server";
import { formatItem18 } from "../../lib/util18.js";
export async function handleAction18(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem18(input.id), name: input.name.trim() };
}
