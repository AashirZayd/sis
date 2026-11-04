import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Test files that exercise the compiled CLI/package built by test/setup/build-dist.ts
 * (they import test/helpers/test-build). The CLI runs as a subprocess, so changes
 * to src/ are not in these files' module graphs; watch mode re-runs them explicitly.
 */
function testsUsingTestBuild(): string[] {
  const dir = path.join(root, "test");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => path.join(dir, name))
    .filter((file) => fs.readFileSync(file, "utf8").includes("helpers/test-build"));
}

export default defineConfig({
  resolve: {
    alias: [
      {
        // benchmarks/*.ts import the built library ("../dist/index.js") because
        // `npm run benchmark` executes them directly with Node. Under Vitest they
        // are tested against the current sources instead of a prebuilt dist/.
        find: /^(?:\.\.\/)+dist\/index\.js$/,
        replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["test/setup/build-dist.ts"],
    // Watch mode: a change under src/ (or to tsconfig.json) also re-runs the tests
    // that use the compiled CLI; build-dist.ts rebuilds before every re-run.
    watchTriggerPatterns: [
      {
        pattern: /[\\/]src[\\/].+\.ts$|[\\/]tsconfig\.json$/,
        testsToRun: () => testsUsingTestBuild(),
      },
    ],
  },
});
