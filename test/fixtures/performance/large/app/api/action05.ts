"use server";
import { formatItem05 } from "../../lib/util05.js";
export async function handleAction05(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem05(input.id), name: input.name.trim() };
}
