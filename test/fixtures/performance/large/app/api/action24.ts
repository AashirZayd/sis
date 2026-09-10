"use server";
import { formatItem24 } from "../../lib/util24.js";
export async function handleAction24(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem24(input.id), name: input.name.trim() };
}
