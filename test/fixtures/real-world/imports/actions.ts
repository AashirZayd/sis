"use server";

import { calculateTax } from "./lib/helper.js";
import { formatCurrency } from "./utils/index.js";
import { missingExternal } from "./non-existent-module.js";

export async function checkout(subtotal: number) {
  const tax = calculateTax(subtotal);
  const formatted = formatCurrency(subtotal + tax);
  return { formatted, tax };
}
