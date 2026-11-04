import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { REPO_ROOT, TEST_BUILD_PARENT } from "./paths.js";
import { createRunDir, pruneStaleRunDirs, removeRunDir } from "./build-dirs.js";

/**
 * Compiles src/ with the production tsconfig into `<buildRoot>/dist` and mirrors
 * package.json beside it, reproducing the published package layout. Any previous
 * output in this run's own directory is removed first. Throws on compile errors.
 */
function buildInto(buildRoot: string): void {
  const dist = path.join(buildRoot, "dist");
  fs.rmSync(dist, { recursive: true, force: true });

  const tsc = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
  execFileSync(
    process.execPath,
    [tsc, "-p", path.join(REPO_ROOT, "tsconfig.json"), "--outDir", dist],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );

  fs.copyFileSync(path.join(REPO_ROOT, "package.json"), path.join(buildRoot, "package.json"));
}

/**
 * Vitest global setup.
 *
 * - Isolation (R-1): each vitest process builds into its own directory and passes
 *   the location to tests through `provide`/`inject`; it never deletes a directory
 *   belonging to another live process.
 * - Watch mode (R-2): the build is redone before every watch re-run, so CLI-based
 *   tests always exercise the current src/. Single runs build exactly once.
 * - Cleanup: the directory is removed on teardown (normal completion or test
 *   failure), when the initial build fails, and on process exit. Directories left
 *   by hard-killed runs are pruned by the next run.
 */
export default function setup(project: TestProject): () => void {
  pruneStaleRunDirs(TEST_BUILD_PARENT);

  const buildRoot = createRunDir(TEST_BUILD_PARENT, process.pid, Date.now());
  const cleanup = () => removeRunDir(buildRoot);
  process.once("exit", cleanup);

  try {
    buildInto(buildRoot);
  } catch (err) {
    cleanup();
    throw err;
  }

  project.provide("sisTestBuildRoot", buildRoot);
  project.onTestsRerun(() => buildInto(buildRoot));

  return () => {
    process.off("exit", cleanup);
    cleanup();
  };
}
