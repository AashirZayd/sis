"use server";
import { formatItem03 } from "../../lib/util03.js";
export async function handleAction03(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem03(input.id), name: input.name.trim() };
}
