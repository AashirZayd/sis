"use server";
import { formatItem15 } from "../../lib/util15.js";
export async function handleAction15(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem15(input.id), name: input.name.trim() };
}
