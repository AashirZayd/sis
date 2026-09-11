import type { RuntimePrelude } from "./types.js";

/**
 * Deterministic headers() prelude.
 *
 * Supplies a deterministic in-memory Headers implementation with case-insensitive lookup.
 */
export const headersPrelude: RuntimePrelude = {
  name: "headers",
  semanticContract:
    "Provides a deterministic in-memory header store adhering to the Next.js / Fetch Headers interface with case-insensitive matching.",
  isDeterministic: true,
  modeledBehaviors: [
    "get(name): case-insensitive header lookup, returns string or null",
    "has(name): case-insensitive presence check, returns boolean",
    "entries(), keys(), values(): deterministic iteration",
    "forEach(callback): standard Headers forEach traversal",
    "[Symbol.iterator](): standard iterable protocol",
  ],
  unmodeledBehaviors: [
    "Live TCP network socket bindings",
    "Reverse-proxy headers (x-forwarded-for, cloudflare headers)",
    "Hop-by-hop header transmission",
  ],
  code: `
function headers() {
  const h = new Map();
  return {
    get(name) {
      const v = h.get(String(name).toLowerCase());
      return v !== undefined ? v : null;
    },
    has(name) {
      return h.has(String(name).toLowerCase());
    },
    set(name, value) {
      h.set(String(name).toLowerCase(), String(value));
    },
    append(name, value) {
      const key = String(name).toLowerCase();
      const prev = h.get(key);
      h.set(key, prev ? prev + ", " + value : String(value));
    },
    delete(name) {
      h.delete(String(name).toLowerCase());
    },
    entries() { return h.entries(); },
    keys() { return h.keys(); },
    values() { return h.values(); },
    forEach(cb, thisArg) {
      h.forEach((val, key) => cb.call(thisArg, val, key, this));
    },
    [Symbol.iterator]() { return h.entries(); }
  };
}
`.trim(),
};
