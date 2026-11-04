import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runDirName,
  parseRunDirName,
  isProcessAlive,
  pruneStaleRunDirs,
  createRunDir,
  removeRunDir,
} from "./setup/build-dirs.js";
import { TEST_BUILD_PARENT } from "./setup/paths.js";
import { TEST_BUILD_ROOT, TEST_CLI } from "./helpers/test-build.js";

/**
 * Per-run test build directories (Batch 1.1, review finding R-1): concurrent
 * vitest processes in one checkout must never share or delete each other's output.
 */
describe("per-run test build directories", () => {
  let parent: string;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "sis-build-dirs-"));
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("names directories by owning pid and start time, and parses them back", () => {
    expect(runDirName(1234, 1700000000000)).toBe("run-1234-1700000000000");
    expect(parseRunDirName("run-1234-1700000000000")).toEqual({ pid: 1234, startedAtMs: 1700000000000 });
    expect(parseRunDirName("dist")).toBeNull();
    expect(parseRunDirName("run-abc-1")).toBeNull();
    expect(parseRunDirName("run-1-2-extra")).toBeNull();
  });

  it("refuses to adopt an existing directory", () => {
    createRunDir(parent, 42, 1);
    expect(() => createRunDir(parent, 42, 1)).toThrow();
  });

  it("prunes only directories whose owning process is gone", () => {
    const live = createRunDir(parent, 100, 1);
    const dead = createRunDir(parent, 200, 2);
    fs.writeFileSync(path.join(live, "marker"), "live");
    fs.writeFileSync(path.join(dead, "marker"), "dead");
    fs.mkdirSync(path.join(parent, "not-a-run-dir"));
    fs.writeFileSync(path.join(parent, "package.json"), "{}");

    const removed = pruneStaleRunDirs(parent, (pid) => pid === 100);

    expect(removed).toEqual(["run-200-2"]);
    expect(fs.readFileSync(path.join(live, "marker"), "utf8")).toBe("live");
    expect(fs.existsSync(dead)).toBe(false);
    expect(fs.existsSync(path.join(parent, "not-a-run-dir"))).toBe(true);
    expect(fs.existsSync(path.join(parent, "package.json"))).toBe(true);
  });

  it("detects live and exited processes", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    const child = spawnSync(process.execPath, ["-e", ""]);
    expect(child.status).toBe(0);
    // The child has exited; its pid is no longer a live process (barring immediate reuse).
    expect(isProcessAlive(child.pid as number)).toBe(false);
  });

  it("removeRunDir is idempotent", () => {
    const dir = createRunDir(parent, 7, 7);
    removeRunDir(dir);
    removeRunDir(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe("this run's test build", () => {
  it("lives in its own run directory under the shared parent, not in dist/", () => {
    expect(path.dirname(TEST_BUILD_ROOT)).toBe(TEST_BUILD_PARENT);
    expect(parseRunDirName(path.basename(TEST_BUILD_ROOT))).not.toBeNull();
    expect(fs.existsSync(TEST_CLI)).toBe(true);
    expect(fs.existsSync(path.join(TEST_BUILD_ROOT, "package.json"))).toBe(true);
  });

  it("is owned by a live process", () => {
    const owner = parseRunDirName(path.basename(TEST_BUILD_ROOT));
    expect(owner).not.toBeNull();
    expect(isProcessAlive(owner!.pid)).toBe(true);
  });
});
