import type { RuntimePrelude } from "./types.js";
import { cookiesPrelude } from "./cookies.js";
import { headersPrelude } from "./headers.js";
import {
  redirectPrelude,
  notFoundPrelude,
  revalidatePathPrelude,
  revalidateTagPrelude,
  unstableNoStorePrelude,
} from "./navigation.js";

export * from "./types.js";
export * from "./cookies.js";
export * from "./headers.js";
export * from "./navigation.js";

/**
 * Registry of all supported deterministic runtime preludes.
 */
export const PRELUDE_REGISTRY = new Map<string, RuntimePrelude>([
  [cookiesPrelude.name, cookiesPrelude],
  [headersPrelude.name, headersPrelude],
  [redirectPrelude.name, redirectPrelude],
  [notFoundPrelude.name, notFoundPrelude],
  [revalidatePathPrelude.name, revalidatePathPrelude],
  [revalidateTagPrelude.name, revalidateTagPrelude],
  [unstableNoStorePrelude.name, unstableNoStorePrelude],
]);

/**
 * Checks if a given function/global name is supported by the prelude registry.
 */
export function isPreludeSupported(name: string): boolean {
  return PRELUDE_REGISTRY.has(name);
}

/**
 * Returns the JavaScript code for a list of requested preludes.
 */
export function getPreludesCode(preludeNames?: string[]): string {
  if (!preludeNames || preludeNames.length === 0) {
    return "";
  }
  const codes: string[] = [];
  for (const name of preludeNames) {
    const prelude = PRELUDE_REGISTRY.get(name);
    if (prelude) {
      codes.push(prelude.code);
    }
  }
  return codes.join("\n\n");
}
