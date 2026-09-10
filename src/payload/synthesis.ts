import fc from "fast-check";
import { masterPayloadArbitrary } from "./generators.js";
import { describePayload, PAYLOAD_CATEGORIES } from "./categories.js";
import type {
  GeneratedPayload,
  PayloadCategory,
  PayloadSynthesisOptions,
  PayloadSynthesisResult,
} from "./types.js";

/**
 * Synthesizes adversarial payloads for candidate Server Actions using fast-check.
 * Guarantees deterministic output when an explicit seed is provided.
 */
export function synthesizePayloads(
  options: PayloadSynthesisOptions = {}
): PayloadSynthesisResult {
  const requestedRuns = options.runs ?? 100;
  const sampleParams: fc.Parameters<unknown> = {
    numRuns: requestedRuns,
  };

  if (options.seed !== undefined) {
    sampleParams.seed = options.seed;
  }

  const sampled = fc.sample(masterPayloadArbitrary, sampleParams) as import("./generators.js").CategoryPayloadCandidate[];

  const categoriesCount: Record<PayloadCategory, number> = {
    "nullish": 0,
    "empty": 0,
    "numeric-extreme": 0,
    "prototype-sensitive": 0,
    "deep-nested": 0,
    "serialization-trap": 0,
    "primitive-mismatch": 0,
  };

  const payloads: GeneratedPayload[] = sampled.map((candidate, index) => {
    categoriesCount[candidate.category] =
      (categoriesCount[candidate.category] || 0) + 1;

    return {
      id: index + 1,
      category: candidate.category,
      value: candidate.value,
      description: describePayload(candidate.category, candidate.value),
    };
  });

  return {
    payloads,
    requestedRuns,
    generatedRuns: payloads.length,
    categories: categoriesCount,
    seed: options.seed,
  };
}
