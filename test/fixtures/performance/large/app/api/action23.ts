"use server";
import { formatItem23 } from "../../lib/util23.js";
export async function handleAction23(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem23(input.id), name: input.name.trim() };
}
