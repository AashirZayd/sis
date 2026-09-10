"use server";
import { formatItem04 } from "../../lib/util04.js";
export async function handleAction04(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem04(input.id), name: input.name.trim() };
}
