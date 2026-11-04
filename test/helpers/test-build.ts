import path from "node:path";
import { inject } from "vitest";

export { REPO_ROOT } from "../setup/paths.js";

/**
 * Location of the build used by integration tests (CLI, packaging, golden output).
 *
 * `test/setup/build-dist.ts` compiles `src/` into a directory owned by the current
 * vitest process and provides its path, so tests never depend on a developer's
 * (possibly stale or missing) `dist/` and concurrent runs never share output.
 * In watch mode the build is refreshed before every re-run.
 */
export const TEST_BUILD_ROOT = inject("sisTestBuildRoot");
export const TEST_DIST = path.join(TEST_BUILD_ROOT, "dist");
export const TEST_CLI = path.join(TEST_DIST, "cli.js");
