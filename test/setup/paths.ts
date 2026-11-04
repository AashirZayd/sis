import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Paths shared by the Vitest global setup and the test helpers.
 *
 * This module must not import "vitest": it is loaded by the global setup, which
 * runs outside the test runner context.
 */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

/**
 * Parent directory of the per-run test builds. Each `vitest` process compiles
 * src/ into its own `run-<pid>-<startedAtMs>` subdirectory (see build-dirs.ts),
 * so concurrent runs never share mutable build output. It lives under
 * node_modules/.cache so compiled code resolves the project's dependencies
 * exactly like the published package does.
 */
export const TEST_BUILD_PARENT = path.join(REPO_ROOT, "node_modules", ".cache", "sis-test-build");

// Type-only augmentation (erased at runtime): the value build-dist.ts provides
// and test/helpers/test-build.ts injects.
declare module "vitest" {
  export interface ProvidedContext {
    /** This run's build root: `<root>/package.json` and `<root>/dist/**`. */
    sisTestBuildRoot: string;
  }
}
