"use server";
import { formatItem14 } from "../../lib/util14.js";
export async function handleAction14(input: { id: number; name: string }) {
  if (input.id <= 0) throw new Error("Invalid id");
  return { formatted: formatItem14(input.id), name: input.name.trim() };
}
