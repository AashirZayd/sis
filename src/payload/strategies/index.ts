import type { GeneratedPayload, PayloadSynthesisResult, PayloadCategory } from "../types.js";
import { synthesizePayloads } from "../synthesis.js";
import { describePayload } from "../categories.js";
import type { FuzzTarget } from "../targets/types.js";
import { synthesizeArgumentVariants } from "./action-arguments.js";
import { selectVariantsUnderBudget } from "./budgeting.js";

export * from "./mutations.js";
export * from "./action-arguments.js";
export * from "./serialization.js";
export * from "./budgeting.js";

export interface BoundaryFuzzOptions {
  runs?: number;
  seed?: number;
}

export interface BoundaryPayloadSynthesisResult {
  payloads: GeneratedPayload[];
  target: FuzzTarget;
  boundaryDirectedCount: number;
  genericFallbackCount: number;
  strategiesUsed: string[];
}

/**
 * Synthesizes boundary-aware payloads for an explicit fuzz target.
 */
export function synthesizeBoundaryPayloads(
  target: FuzzTarget,
  options: BoundaryFuzzOptions = {}
): BoundaryPayloadSynthesisResult {
  const budget = options.runs ?? 25;
  const strategiesUsedSet = new Set<string>();

  if (target.kind === "server-action-argument") {
    const rawVariants = synthesizeArgumentVariants(target);
    const budgeted = selectVariantsUnderBudget(rawVariants, budget, options.seed);

    if (budgeted.length > 0) {
      const payloads: GeneratedPayload[] = budgeted.map((v, index) => {
        strategiesUsedSet.add(v.strategy);
        return {
          id: index + 1,
          category: v.category,
          value: v.value,
          description: `${v.strategy}: ${v.description}`,
          fuzzTarget: target.kind,
          strategy: v.strategy,
          invariant: target.invariants[0] ?? "runtime-safety",
          parameter: target.parameterName,
        } as GeneratedPayload;
      });

      let genericCount = 0;
      if (payloads.length < budget) {
        const remaining = budget - payloads.length;
        const generic = synthesizePayloads({
          runs: remaining,
          seed: options.seed !== undefined ? options.seed + 1 : undefined,
        });
        for (const gp of generic.payloads) {
          payloads.push({
            id: payloads.length + 1,
            category: gp.category,
            value: gp.value,
            description: gp.description,
            fuzzTarget: target.kind,
            strategy: "generic-fallback",
            invariant: target.invariants[0] ?? "runtime-safety",
            parameter: target.parameterName,
          });
        }
        genericCount = generic.payloads.length;
        if (genericCount > 0) {
          strategiesUsedSet.add("generic-fallback");
        }
      }

      return {
        payloads,
        target,
        boundaryDirectedCount: budgeted.length,
        genericFallbackCount: genericCount,
        strategiesUsed: Array.from(strategiesUsedSet),
      };
    }
  }

  // Fallback to generic generator if no boundary variants were generated
  const generic = synthesizePayloads(options);
  const payloads: GeneratedPayload[] = generic.payloads.map((p) => ({
    ...p,
    fuzzTarget: target.kind,
    strategy: "generic-fallback",
    invariant: target.invariants[0] ?? "runtime-safety",
    parameter: target.parameterName,
  }));

  return {
    payloads,
    target,
    boundaryDirectedCount: 0,
    genericFallbackCount: payloads.length,
    strategiesUsed: ["generic-fallback"],
  };
}
