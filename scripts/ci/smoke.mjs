// End-to-end smoke test of the built CLI (dist/cli.js): version reporting,
// real sandbox execution, and the wall-clock deadline (change S-0).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const cli = path.join(root, "dist", "cli.js");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

function fail(message) {
  console.error(`smoke test failed: ${message}`);
  process.exit(1);
}

function audit(target, extraArgs = []) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [cli, "audit", target, "--json", "--seed", "42", ...extraArgs], {
    cwd: root,
    encoding: "utf-8",
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) fail(`${target}: ${res.error.message}`);
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    fail(`${target}: stdout is not valid JSON (exit ${res.status})\n${res.stderr}`);
  }
  return { status: res.status, report, elapsedMs: Date.now() - started };
}

const version = execFileSync(process.execPath, [cli, "--version"], { encoding: "utf-8" }).trim();
if (version !== pkg.version) fail(`--version printed ${version}, package.json has ${pkg.version}`);

// Real execution inside isolated-vm: this fixture has actions that pass and actions that throw.
const runtime = audit("test/fixtures/real-world/runtime", ["--runs", "6"]);
const stats = runtime.report.statistics;
if (!(stats.executions > 0)) fail(`expected sandbox executions, got ${stats.executions}`);
if (!(stats.passedExecutions > 0)) fail("expected at least one passing execution");
if (!(stats.failedExecutions > 0)) fail("expected at least one failing execution");
if (runtime.status !== 1) fail(`expected exit code 1 (findings), got ${runtime.status}`);

// Wall-clock deadline: a never-settling action must terminate and must not become a finding.
const stalled = audit("test/fixtures/golden/never-settling", ["--runs", "2"]);
const stalledRuntime = stalled.report.findings.filter((f) => f.type === "runtime-exception" || f.type === "timeout");
if (stalledRuntime.length !== 0) fail("a deadline termination was reported as a runtime finding");
if (!(stalled.report.statistics.unsupportedExecutions >= 1)) fail("expected stalled executions to be counted as unsupported");
if (stalled.elapsedMs > 60_000) fail(`never-settling audit took ${stalled.elapsedMs}ms`);

console.log(
  `smoke OK: version ${version}; ${stats.executions} executions (${stats.passedExecutions} passed, ` +
    `${stats.failedExecutions} failed); never-settling audit finished in ${stalled.elapsedMs}ms`
);
