/**
 * Deterministically derives a unique 32-bit integer seed for a specific file
 * given an overall audit base seed and the file's normalized relative path.
 *
 * Algorithm: FNV-1a hash variant mixed with the base seed.
 * Guarantees:
 * 1. Determinism: (baseSeed, relativePath) always yields the exact same derived seed.
 * 2. Independence: Adding, removing, or reordering other files does not alter this file's seed.
 * 3. Range: Returns a non-negative 31-bit integer [0, 2147483647] safe for fast-check PRNG.
 */
export function deriveFileSeed(baseSeed: number, relativeFilePath: string): number {
  const normalized = relativeFilePath.replace(/\\/g, "/");

  // 32-bit FNV offset basis xor-ed with base seed
  let hash = (2166136261 ^ (baseSeed >>> 0)) >>> 0;

  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    // 32-bit FNV prime: 16777619
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  // Ensure positive 31-bit integer
  return hash & 0x7fffffff;
}
