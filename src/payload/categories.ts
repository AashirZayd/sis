import type { PayloadCategory } from "./types.js";
import { formatPayloadValue } from "./display.js";

export const PAYLOAD_CATEGORIES: readonly PayloadCategory[] = [
  "nullish",
  "empty",
  "numeric-extreme",
  "prototype-sensitive",
  "deep-nested",
  "serialization-trap",
  "primitive-mismatch",
] as const;

export const CATEGORY_LABELS: Record<PayloadCategory, string> = {
  "nullish": "Nullish value or wrapper",
  "empty": "Empty primitive, array, or object",
  "numeric-extreme": "Numeric extreme, NaN, or boundary hazard",
  "prototype-sensitive": "Prototype-sensitive key hazard",
  "deep-nested": "Deeply nested object or array structure",
  "serialization-trap": "Serialization-sensitive non-JSON trap",
  "primitive-mismatch": "Unexpected primitive type mismatch",
};

/**
 * Produces a concise diagnostic description of a generated payload.
 */
export function describePayload(category: PayloadCategory, value: unknown): string {
  const preview = formatPayloadValue(value);
  return `${CATEGORY_LABELS[category]} (${preview})`;
}
