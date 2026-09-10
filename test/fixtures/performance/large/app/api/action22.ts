"use server";
import { formatItem22 } from "../../lib/util22.js";
export async function handleAction22(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem22(input.id), name: input.name.trim() };
}
