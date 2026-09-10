"use server";
import { formatItem08 } from "../../lib/util08.js";
export async function handleAction08(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem08(input.id), name: input.name.trim() };
}
