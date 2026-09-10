"use server";
import { formatItem21 } from "../../lib/util21.js";
export async function handleAction21(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem21(input.id), name: input.name.trim() };
}
