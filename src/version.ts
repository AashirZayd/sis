import { createRequire } from "node:module";

/**
 * The SIS version, read from package.json at runtime so the CLI, JSON and
 * SARIF output can never drift from the published package version.
 * Resolves to <package root>/package.json from both src/ and dist/.
 */
const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as { version: string };

export const SIS_VERSION: string = pkg.version;
