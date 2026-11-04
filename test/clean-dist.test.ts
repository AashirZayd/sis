import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./helpers/test-build.js";

/**
 * `prepack` cleans dist/ before building (Batch 1.1, review finding R-5), so the
 * package never contains compiled output of source files that no longer exist.
 *
 * The script is exercised on a copy laid out like the package, so the real
 * repository's dist/ is never touched by this test.
 */
describe("scripts/clean-dist.mjs", () => {
  let pkgRoot: string;
  let script: string;

  beforeEach(() => {
    pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sis-clean-dist-"));
    fs.mkdirSync(path.join(pkgRoot, "scripts"));
    script = path.join(pkgRoot, "scripts", "clean-dist.mjs");
    fs.copyFileSync(path.join(REPO_ROOT, "scripts", "clean-dist.mjs"), script);
    fs.writeFileSync(path.join(pkgRoot, "package.json"), '{ "name": "fixture" }');
  });

  afterEach(() => {
    fs.rmSync(pkgRoot, { recursive: true, force: true });
  });

  it("removes dist/ including stale nested output, and nothing else", () => {
    fs.mkdirSync(path.join(pkgRoot, "dist", "removed-module"), { recursive: true });
    fs.writeFileSync(path.join(pkgRoot, "dist", "removed-module", "index.js"), "stale");
    fs.writeFileSync(path.join(pkgRoot, "dist", "index.js"), "current");
    fs.mkdirSync(path.join(pkgRoot, "src"));
    fs.writeFileSync(path.join(pkgRoot, "src", "index.ts"), "source");
    fs.writeFileSync(path.join(pkgRoot, "README.md"), "docs");

    execFileSync(process.execPath, [script], { cwd: os.tmpdir() });

    expect(fs.existsSync(path.join(pkgRoot, "dist"))).toBe(false);
    expect(fs.readFileSync(path.join(pkgRoot, "src", "index.ts"), "utf8")).toBe("source");
    expect(fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8")).toBe("docs");
    expect(fs.existsSync(path.join(pkgRoot, "package.json"))).toBe(true);
  });

  it("ignores the working directory and only targets <package root>/dist", () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "sis-clean-dist-cwd-"));
    try {
      fs.mkdirSync(path.join(elsewhere, "dist"));
      fs.writeFileSync(path.join(elsewhere, "dist", "keep.js"), "unrelated");
      execFileSync(process.execPath, [script], { cwd: elsewhere });
      expect(fs.readFileSync(path.join(elsewhere, "dist", "keep.js"), "utf8")).toBe("unrelated");
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("succeeds when there is no dist/ (fresh clone)", () => {
    expect(() => execFileSync(process.execPath, [script])).not.toThrow();
  });

  it("unlinks a symlinked dist/ without deleting the link target", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "sis-clean-dist-target-"));
    try {
      fs.writeFileSync(path.join(target, "precious.js"), "keep");
      fs.symlinkSync(target, path.join(pkgRoot, "dist"), "junction");
      execFileSync(process.execPath, [script]);
      expect(fs.existsSync(path.join(pkgRoot, "dist"))).toBe(false);
      expect(fs.readFileSync(path.join(target, "precious.js"), "utf8")).toBe("keep");
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("refuses to run outside a package root", () => {
    fs.rmSync(path.join(pkgRoot, "package.json"));
    fs.mkdirSync(path.join(pkgRoot, "dist"));
    expect(() => execFileSync(process.execPath, [script], { stdio: "pipe" })).toThrow();
    expect(fs.existsSync(path.join(pkgRoot, "dist"))).toBe(true);
  });

  it("is wired into prepack before the build", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.clean).toBe("node scripts/clean-dist.mjs");
    expect(pkg.scripts.prepack).toBe("npm run clean && npm run build");
    expect(pkg.scripts.build).toBe("tsc");
  });
});
