"use server";
import { formatItem02 } from "../../lib/util02.js";
export async function handleAction02(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem02(input.id), name: input.name.trim() };
}
