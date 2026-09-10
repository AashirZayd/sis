import { getBaseVal as prev } from "./step1.js";
export function getBaseVal(x: number): number { return prev(x) + 1; }
