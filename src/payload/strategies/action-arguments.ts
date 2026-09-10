import type { FuzzTarget, InferredShape } from "../targets/types.js";
import { BoundaryMutationEngine, type MutationVariant } from "./mutations.js";
import { generateClassifiedSerializationPayloads } from "./serialization.js";

/**
 * Synthesizes boundary-directed adversarial input variants for a Server Action parameter.
 */
export function synthesizeArgumentVariants(target: FuzzTarget): MutationVariant[] {
  const shape = target.inferredShape;
  const variants: MutationVariant[] = [];

  switch (shape.kind) {
    case "number": {
      // Nullability
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      // Numeric extremes
      variants.push(...BoundaryMutationEngine.getNumericExtremeVariants());
      // Type mismatches
      variants.push(
        { value: "42", strategy: "primitive-mismatch", category: "primitive-mismatch", description: "String number mismatch '42'" },
        { value: "NaN", strategy: "primitive-mismatch", category: "primitive-mismatch", description: "String 'NaN' mismatch" },
        { value: {}, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Object mismatch for number" },
        { value: [], strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Array mismatch for number" },
        { value: true, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Boolean true for number" }
      );
      break;
    }

    case "string": {
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      variants.push(...BoundaryMutationEngine.getStringHazardVariants());
      variants.push(
        { value: 12345, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Number 12345 for string" },
        { value: true, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Boolean true for string" },
        { value: {}, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Object for string" }
      );
      break;
    }

    case "boolean": {
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      variants.push(...BoundaryMutationEngine.getBooleanVariants());
      break;
    }

    case "object": {
      const properties = shape.properties ?? new Map<string, InferredShape>();
      const baseline: Record<string, unknown> = {};

      for (const [key, propShape] of properties.entries()) {
        baseline[key] = buildDefaultValue(propShape);
      }

      variants.push(...BoundaryMutationEngine.mutateObject(baseline, properties));
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      break;
    }

    case "array": {
      variants.push(
        { value: [], strategy: "structural-deletion", category: "empty", description: "Empty array" },
        { value: [null], strategy: "nullability", category: "nullish", description: "Array with null element" },
        { value: [undefined], strategy: "nullability", category: "nullish", description: "Array with undefined element" },
        { value: [NaN], strategy: "numeric-extreme", category: "numeric-extreme", description: "Array with NaN element" },
        { value: {}, strategy: "primitive-mismatch", category: "primitive-mismatch", description: "Object for array" },
        { value: "string", strategy: "primitive-mismatch", category: "primitive-mismatch", description: "String for array" }
      );
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      break;
    }

    default: {
      // For unknown shapes, provide canonical representative set from all categories
      variants.push(
        { value: 0, strategy: "numeric-extreme", category: "numeric-extreme", description: "Zero" },
        { value: NaN, strategy: "numeric-extreme", category: "numeric-extreme", description: "NaN" },
        { value: "", strategy: "string-hazard", category: "empty", description: "Empty string" },
        { value: {}, strategy: "structural-deletion", category: "empty", description: "Empty object" },
        { value: [], strategy: "structural-deletion", category: "empty", description: "Empty array" }
      );
      variants.push(...BoundaryMutationEngine.getPrototypeVariants());
      variants.push(...BoundaryMutationEngine.getNullabilityVariants());
      break;
    }
  }

  // If serialization invariant is active, inject serialization traps
  if (target.invariants.includes("serializable")) {
    const serializationPayloads = generateClassifiedSerializationPayloads();
    for (const sp of serializationPayloads) {
      if (sp.classification === "unsupported" || sp.classification === "edge") {
        variants.push(sp.variant);
      }
    }
  }

  return variants;
}

function buildDefaultValue(shape: InferredShape): unknown {
  switch (shape.kind) {
    case "number":
      return 1;
    case "string":
      return "test";
    case "boolean":
      return true;
    case "object": {
      const nested: Record<string, unknown> = {};
      if (shape.properties) {
        for (const [k, v] of shape.properties.entries()) {
          nested[k] = buildDefaultValue(v);
        }
      }
      return nested;
    }
    case "array":
      return [];
    default:
      return "default";
  }
}
