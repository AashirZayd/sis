import { formatPayloadValue } from "../payload/display.js";

/**
 * Calculates a deterministic complexity/size metric for a payload value.
 * Lower means smaller and simpler.
 */
export function getPayloadSize(val: unknown): number {
  if (val === null || val === undefined) return 1;
  if (typeof val === "boolean") return 1;
  if (typeof val === "number") {
    if (val === 0) return 1;
    if (Number.isNaN(val) || !Number.isFinite(val)) return 2;
    return String(Math.abs(val)).length + 1;
  }
  if (typeof val === "string") return val.length + 2;

  // For objects and arrays, safely format and compute length
  try {
    return formatPayloadValue(val).length;
  } catch {
    return 100;
  }
}

/**
 * Generates smaller structural candidates from an input value in deterministic order.
 */
export function generateShrinkCandidates(val: unknown): unknown[] {
  const candidates: unknown[] = [];

  if (val === null || val === undefined) {
    if (val === undefined) {
      candidates.push(null);
    }
    return candidates;
  }

  const type = typeof val;

  if (type === "boolean") {
    if (val === true) {
      candidates.push(false);
    }
    return candidates;
  }

  if (type === "number") {
    const num = val as number;
    // Don't simplify 0 further
    if (num === 0 && !Object.is(num, -0)) {
      return candidates;
    }

    // Try canonical simple numbers
    const simplifications = [0, 1, -1];
    for (const s of simplifications) {
      if (s !== num) {
        candidates.push(s);
      }
    }

    if (Number.isFinite(num) && !Number.isInteger(num)) {
      candidates.push(Math.trunc(num));
    }

    if (Number.isFinite(num) && Math.abs(num) > 1) {
      candidates.push(Math.trunc(num / 2));
    }

    return candidates;
  }

  if (type === "string") {
    const str = val as string;
    if (str === "") return candidates;

    candidates.push("");
    if (str.length > 1) {
      candidates.push(str[0]);
      candidates.push(str.slice(0, Math.floor(str.length / 2)));
    }
    return candidates;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return candidates;

    // 1. Empty array
    candidates.push([]);

    // 2. Single-element arrays
    if (val.length > 1) {
      for (let i = 0; i < Math.min(val.length, 3); i++) {
        candidates.push([val[i]]);
      }
      // Binary half
      candidates.push(val.slice(0, Math.floor(val.length / 2)));
    }

    // 3. Shrink individual elements
    for (let i = 0; i < val.length; i++) {
      const elemCandidates = generateShrinkCandidates(val[i]);
      for (const elemCandidate of elemCandidates.slice(0, 2)) {
        const copy = [...val];
        copy[i] = elemCandidate;
        candidates.push(copy);
      }
    }

    return candidates;
  }

  if (type === "object") {
    // Plain or prototype-sensitive object
    let keys: string[] = [];
    try {
      keys = Object.getOwnPropertyNames(val);
    } catch {
      return candidates;
    }

    if (keys.length === 0) return candidates;

    // 1. Empty object
    candidates.push({});

    // 2. Binary half subsets
    if (keys.length > 2) {
      const mid = Math.floor(keys.length / 2);
      const firstHalf: Record<string, unknown> = {};
      for (let i = 0; i < mid; i++) {
        firstHalf[keys[i]] = (val as Record<string, unknown>)[keys[i]];
      }
      candidates.push(firstHalf);

      const secondHalf: Record<string, unknown> = {};
      for (let i = mid; i < keys.length; i++) {
        secondHalf[keys[i]] = (val as Record<string, unknown>)[keys[i]];
      }
      candidates.push(secondHalf);
    }

    // 3. Delta-debugging: remove one key at a time
    if (keys.length > 1) {
      for (const key of keys) {
        const reduced: Record<string, unknown> = {};
        for (const k of keys) {
          if (k !== key) {
            reduced[k] = (val as Record<string, unknown>)[k];
          }
        }
        candidates.push(reduced);
      }

      // 4. Single-property objects
      for (const key of keys) {
        candidates.push({ [key]: (val as Record<string, unknown>)[key] });
      }
    }

    // 4. Shrink property values in-place
    for (const key of keys) {
      const propVal = (val as Record<string, unknown>)[key];
      const propCandidates = generateShrinkCandidates(propVal);
      const limit = typeof propVal === "object" && propVal !== null ? Math.min(propCandidates.length, 6) : 2;
      for (const propCandidate of propCandidates.slice(0, limit)) {
        const updated: Record<string, unknown> = { ...(val as Record<string, unknown>) };
        updated[key] = propCandidate;
        candidates.push(updated);
      }
    }

    return candidates;
  }

  return candidates;
}
