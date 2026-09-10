"use server";
import { formatItem12 } from "../../lib/util12.js";
export async function handleAction12(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem12(input.id), name: input.name.trim() };
}
