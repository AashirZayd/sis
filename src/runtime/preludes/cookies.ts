import type { RuntimePrelude } from "./types.js";

/**
 * Deterministic cookies() prelude.
 *
 * Supplies an in-memory, deterministic ReadonlyRequestCookies implementation.
 */
export const cookiesPrelude: RuntimePrelude = {
  name: "cookies",
  semanticContract:
    "Provides a deterministic in-memory cookie store adhering to the Next.js ReadonlyRequestCookies interface.",
  isDeterministic: true,
  modeledBehaviors: [
    "get(name): returns { name, value } or undefined",
    "getAll(name?): returns array of cookie objects",
    "has(name): returns boolean",
    "set(name, value, options?): mutates local store, returns store",
    "delete(name): deletes cookie from local store",
    "[Symbol.iterator](): iterates over name/cookie pairs",
    "size: number of cookies in store",
  ],
  unmodeledBehaviors: [
    "Live HTTP Set-Cookie header transmission",
    "Cryptographic cookie signature verification",
    "Cross-request persistent storage",
  ],
  code: `
function cookies() {
  const store = new Map();
  return {
    get(name) {
      const v = store.get(String(name));
      return v !== undefined ? { name: String(name), value: v } : undefined;
    },
    getAll(name) {
      if (name !== undefined) {
        const v = store.get(String(name));
        return v !== undefined ? [{ name: String(name), value: v }] : [];
      }
      return Array.from(store.entries()).map(([k, v]) => ({ name: k, value: v }));
    },
    has(name) {
      return store.has(String(name));
    },
    set(name, value) {
      store.set(String(name), String(value));
      return this;
    },
    delete(name) {
      store.delete(String(name));
      return this;
    },
    get size() {
      return store.size;
    },
    [Symbol.iterator]() {
      return store.entries();
    }
  };
}
`.trim(),
};
