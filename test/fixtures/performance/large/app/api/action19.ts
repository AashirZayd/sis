"use server";
import { formatItem19 } from "../../lib/util19.js";
export async function handleAction19(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem19(input.id), name: input.name.trim() };
}
