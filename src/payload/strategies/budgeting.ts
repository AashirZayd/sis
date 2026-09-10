import type { MutationVariant } from "./mutations.js";
import type { FuzzTarget } from "../targets/types.js";

export interface BudgetAllocation {
  targetId: string;
  allocatedRuns: number;
}

/**
 * Budgeting algorithm:
 * Distributes the global `runs` budget across all discovered targets without Cartesian explosion.
 *
 * 1. Let N = number of targets.
 * 2. Each target receives a proportional quota: baseQuota = Math.max(1, Math.floor(totalRuns / N)).
 * 3. Upper bound per target is clamped to Math.min(baseQuota, 50) to prevent single-target dominance.
 * 4. Payloads are selected deterministically using seeded permutation if count exceeds quota.
 */
export function allocateBudgets(
  targets: FuzzTarget[],
  totalRuns = 100
): Map<string, number> {
  const allocations = new Map<string, number>();
  if (targets.length === 0) return allocations;

  const perTarget = Math.max(1, Math.floor(totalRuns / targets.length));
  const clampedQuota = Math.min(perTarget, 50);

  for (const target of targets) {
    allocations.set(target.id, clampedQuota);
  }

  return allocations;
}

/**
 * Deterministically trims and orders variants to fit the target's allocated budget.
 */
export function selectVariantsUnderBudget(
  variants: MutationVariant[],
  budget: number,
  seed?: number
): MutationVariant[] {
  if (variants.length <= budget) {
    return [...variants];
  }

  // If seed is provided, perform deterministic pseudo-random sub-selection
  if (seed !== undefined) {
    const indices = Array.from({ length: variants.length }, (_, i) => i);
    // Simple LCG PRNG for deterministic shuffle
    let currentSeed = (seed ^ 0x5deece66d) >>> 0;
    for (let i = indices.length - 1; i > 0; i--) {
      currentSeed = (Math.imul(currentSeed, 1664525) + 1013904223) >>> 0;
      const j = currentSeed % (i + 1);
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
    return indices.slice(0, budget).map((idx) => variants[idx]);
  }

  // Without seed, deterministically take the first N (which are ordered by priority)
  return variants.slice(0, budget);
}
