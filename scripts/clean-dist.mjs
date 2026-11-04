// Removes the package's compiled output directory (dist/) so that `prepack`
// always packs a build of the current source tree. Without this, compiled files
// of deleted source modules would survive in dist/ and be published.
//
// Safety: the target is resolved from this script's own location
// (<package root>/dist), never from the current working directory or arguments.
// A symlinked dist/ is unlinked, not followed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(packageRoot, "dist");

if (!fs.existsSync(path.join(packageRoot, "package.json"))) {
  console.error(`clean-dist: refusing to run, no package.json in ${packageRoot}`);
  process.exit(1);
}

let stat;
try {
  stat = fs.lstatSync(dist);
} catch {
  process.exit(0); // nothing to clean
}

if (stat.isSymbolicLink()) {
  fs.unlinkSync(dist);
} else {
  fs.rmSync(dist, { recursive: true, force: true });
}
