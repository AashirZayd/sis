// Verifies that the native isolated-vm module loads and executes on this runner,
// independently of the SIS test suite, and reports what was loaded.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ivm = require("isolated-vm");
const { version } = require("isolated-vm/package.json");

const isolate = new ivm.Isolate({ memoryLimit: 32 });
try {
  const context = await isolate.createContext();
  const value = await (await isolate.compileScript("6 * 7")).run(context);
  if (value !== 42) throw new Error(`unexpected evaluation result: ${value}`);

  let timedOut = false;
  try {
    await (await isolate.compileScript("while (true) {}")).run(context, { timeout: 50 });
  } catch (err) {
    timedOut = /timed out/i.test(String(err && err.message));
  }
  if (!timedOut) throw new Error("isolate CPU timeout was not enforced");

  console.log(
    `isolated-vm ${version} OK on ${process.platform}-${process.arch}, Node ${process.version} (ABI ${process.versions.modules})`
  );
} finally {
  isolate.dispose();
}
