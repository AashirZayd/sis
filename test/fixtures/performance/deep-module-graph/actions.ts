"use server";
import { getBaseVal } from "./step10.js";
export async function computeDeepChain(n: number) {
  return { result: getBaseVal(n) };
}
