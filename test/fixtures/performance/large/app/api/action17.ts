"use server";
import { formatItem17 } from "../../lib/util17.js";
export async function handleAction17(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem17(input.id), name: input.name.trim() };
}
