import type { RuntimePrelude } from "./types.js";

/**
 * Deterministic redirect() prelude.
 *
 * Models Next.js redirect control-flow termination without network side effects.
 */
export const redirectPrelude: RuntimePrelude = {
  name: "redirect",
  semanticContract:
    "Throws a deterministic NEXT_REDIRECT error signal, modeling Next.js framework control-flow termination without network actions.",
  isDeterministic: true,
  modeledBehaviors: [
    "Throws Error with digest 'NEXT_REDIRECT;<url>;<type>'",
    "Sets __sisRedirect = true for executor interception",
    "Halts Server Action control flow without crashing the process",
  ],
  unmodeledBehaviors: [
    "Browser HTTP 307/308 redirection",
    "Client-side React router navigation",
  ],
  code: `
function redirect(url, type) {
  const err = new Error("NEXT_REDIRECT");
  err.digest = "NEXT_REDIRECT;" + url + (type ? ";" + type : "");
  err.__sisRedirect = true;
  err.url = url;
  throw err;
}
`.trim(),
};

/**
 * Deterministic notFound() prelude.
 *
 * Models Next.js notFound control-flow termination without rendering not-found.js.
 */
export const notFoundPrelude: RuntimePrelude = {
  name: "notFound",
  semanticContract:
    "Throws a deterministic NEXT_NOT_FOUND error signal, modeling Next.js 404 control-flow termination.",
  isDeterministic: true,
  modeledBehaviors: [
    "Throws Error with digest 'NEXT_NOT_FOUND'",
    "Sets __sisNotFound = true for executor interception",
    "Halts Server Action control flow cleanly",
  ],
  unmodeledBehaviors: [
    "Rendering Next.js not-found.js React component tree",
  ],
  code: `
function notFound() {
  const err = new Error("NEXT_NOT_FOUND");
  err.digest = "NEXT_NOT_FOUND";
  err.__sisNotFound = true;
  throw err;
}
`.trim(),
};

/**
 * Deterministic revalidatePath() prelude.
 */
export const revalidatePathPrelude: RuntimePrelude = {
  name: "revalidatePath",
  semanticContract:
    "Deterministic void no-op modeling Next.js on-demand cache revalidation.",
  isDeterministic: true,
  modeledBehaviors: ["Accepts path and optional type string, returns undefined"],
  unmodeledBehaviors: ["Server-side ISR cache invalidation", "CDN edge purge"],
  code: `
function revalidatePath(path, type) {
  return undefined;
}
`.trim(),
};

/**
 * Deterministic revalidateTag() prelude.
 */
export const revalidateTagPrelude: RuntimePrelude = {
  name: "revalidateTag",
  semanticContract:
    "Deterministic void no-op modeling Next.js tag-based cache revalidation.",
  isDeterministic: true,
  modeledBehaviors: ["Accepts tag string, returns undefined"],
  unmodeledBehaviors: ["Server-side tag cache invalidation"],
  code: `
function revalidateTag(tag) {
  return undefined;
}
`.trim(),
};

/**
 * Deterministic unstable_noStore() prelude.
 */
export const unstableNoStorePrelude: RuntimePrelude = {
  name: "unstable_noStore",
  semanticContract:
    "Deterministic void no-op modeling Next.js cache opt-out.",
  isDeterministic: true,
  modeledBehaviors: ["Returns undefined"],
  unmodeledBehaviors: ["Server-side dynamic rendering flag toggle"],
  code: `
function unstable_noStore() {
  return undefined;
}
`.trim(),
};

