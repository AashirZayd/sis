import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  parseModule,
  SourceMapLocator,
  formatJson,
  formatSarif,
  AuditEngine,
  extractCandidateFunction,
} from "../src/index.js";
import { REPO_ROOT, TEST_CLI } from "./helpers/test-build.js";
import { SUCCESS_PATH_BUDGET_MS, SUCCESS_PATH_CLI_ARGS } from "./helpers/budgets.js";

const execFileAsync = promisify(execFile);

/**
 * Source-location mapping (Reliability Reset change L-1, audit V-12).
 *
 * SWC reports 1-based UTF-8 byte positions; SIS reports 1-based lines and
 * UTF-16 code-unit columns. Expected values are computed independently from the
 * JavaScript string (UTF-16) position of a marker identifier.
 */

/** Expected 1-based line/column (UTF-16 units) of the first occurrence of `marker`. */
function expectedLocation(source: string, marker: string): { line: number; column: number } {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`marker ${marker} not found`);
  const before = text.slice(0, index);
  return {
    line: before.split("\n").length,
    column: index - (before.lastIndexOf("\n") + 1) + 1,
  };
}

const action = 'export async function target(x: unknown) { return 1; }\n';

const CASES: Array<{ name: string; source: string }> = [
  { name: "ASCII only", source: `"use server";\n// plain\n${action}` },
  { name: "two-byte Latin characters", source: `"use server";\n// éééééé ñ ü\n${action}` },
  { name: "three-byte CJK characters", source: `"use server";\n// 漢字漢字 日本語\n${action}` },
  { name: "four-byte emoji (surrogate pairs)", source: `"use server";\n// 🚀🚀🚀 👩‍💻\n${action}` },
  { name: "Cyrillic, Arabic and Devanagari", source: `"use server";\n// Привет مرحبا नमस्ते\n${action}` },
  { name: "multibyte text on the same line", source: `"use server";\nconst s = "漢🚀ñ"; ${action}` },
  { name: "40 CJK characters (previously shifted the line)", source: `"use server";\n// ${"漢".repeat(40)}\n// filler\n${action}` },
  { name: "multibyte text on many preceding lines", source: `"use server";\n${"// ñandú 漢字 🚀\n".repeat(25)}${action}` },
  { name: "string literal with multibyte characters", source: `"use server";\nconst s = "ñññññ";\n${action}` },
  { name: "CRLF line endings", source: `"use server";\r\n// éé 漢\r\n${action.replace("\n", "\r\n")}` },
  { name: "LF line endings", source: `"use server";\n// éé 漢\n${action}` },
  { name: "leading byte-order mark", source: `﻿"use server";\n// plain\n${action}` },
  { name: "byte-order mark plus multibyte text", source: `﻿"use server";\n// 漢字 🚀\n${action}` },
  { name: "lone surrogate in a string literal", source: `"use server";\nconst s = "\uD800";\n${action}` },
];

describe("SourceMapLocator: UTF-8 byte offsets to UTF-16 locations", () => {
  for (const { name, source } of CASES) {
    it(`reports the true location after ${name}`, async () => {
      const parsed = await parseModule(source, { filename: "actions.ts" });
      expect(parsed.actions).toHaveLength(1);
      const { line, column } = parsed.actions[0].location;
      expect({ line, column }).toEqual(expectedLocation(source, "target"));
    });
  }

  it("maps byte offsets inside a multi-byte character to that character", () => {
    // "a漢b": 'a' = byte 1, '漢' = bytes 2-4, 'b' = byte 5 (1-based SWC positions)
    const locator = new SourceMapLocator("f.ts", "a漢b");
    expect(locator.getLocation(1)).toMatchObject({ line: 1, column: 1 });
    expect(locator.getLocation(2)).toMatchObject({ line: 1, column: 2 });
    expect(locator.getLocation(3)).toMatchObject({ line: 1, column: 2 });
    expect(locator.getLocation(4)).toMatchObject({ line: 1, column: 2 });
    expect(locator.getLocation(5)).toMatchObject({ line: 1, column: 3 });
  });

  it("counts an astral character as two UTF-16 code units", () => {
    // "🚀x": '🚀' = bytes 1-4 (2 UTF-16 units), 'x' = byte 5
    const locator = new SourceMapLocator("f.ts", "🚀x");
    expect(locator.getLocation(5)).toMatchObject({ line: 1, column: 3 });
  });

  it("clamps offsets beyond the end of a line or file", () => {
    const locator = new SourceMapLocator("f.ts", "ab\ncd");
    expect(locator.getLocation(0)).toMatchObject({ line: 1, column: 1 });
    expect(locator.getLocation(100)).toMatchObject({ line: 2, column: 3 });
    expect(new SourceMapLocator("f.ts", "").getLocation(1)).toMatchObject({ line: 1, column: 1 });
  });

  it("reports correct prefix-verification ranges and stop lines after multibyte text", async () => {
    const source =
      '"use server";\n' +
      'import { db } from "@/lib/db";\n' +
      "// 漢字漢字漢字 🚀🚀 ñandú — the prefix range below must not drift\n" +
      "export async function save(input: { n: number }) {\n" +
      "  const v = input.n.toFixed(1);\n" +
      "  await db.insert(v);\n" +
      "  return v;\n" +
      "}\n";
    const parsed = await parseModule(source, { filename: "actions.ts" });
    const candidate = extractCandidateFunction(source, parsed, parsed.actions[0]);
    expect(candidate?.executionMode).toBe("PREFIX");

    const prefixStart = expectedLocation(source, "const v");
    const prefixEnd = expectedLocation(source, "await db.insert");
    expect(candidate?.verifiedPrefix).toMatchObject({
      startLine: prefixStart.line,
      startColumn: prefixStart.column,
      endLine: prefixStart.line,
      endColumn: prefixStart.column + "const v = input.n.toFixed(1);".length,
    });
    expect(candidate?.stoppedAt).toMatchObject({ dependency: "db", line: prefixEnd.line });
  });

  it("matches the previous behavior exactly for ASCII sources", () => {
    const source = '"use server";\nexport async function target(x) {\n  return x;\n}\n';
    const locator = new SourceMapLocator("f.ts", source);
    // Line starts at UTF-16 indices 0, 14, 48, 60, 62 (1-based byte positions +1).
    expect(locator.getLocation(1)).toMatchObject({ line: 1, column: 1 });
    expect(locator.getLocation(15)).toMatchObject({ line: 2, column: 1 });
    expect(locator.getLocation(37)).toMatchObject({ line: 2, column: 23 });
    expect(locator.getLocation(51)).toMatchObject({ line: 3, column: 3 });
  });
});

describe("Locations in terminal and machine-readable output", () => {
  let dir: string;
  let source: string;
  let clientSource: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sis-location-"));
    source =
      '"use server";\n' +
      "// Überprüfung der Eingabe — 入力の検証 🚀🚀\n" +
      'const ünïcödé = "ñandú";\n' +
      "export async function crashes(input: { amount: number }) {\n" +
      "  return input.amount.toFixed(2);\n" +
      "}\n";
    clientSource =
      '"use client";\n' +
      "// Клиентский компонент 🚀\n" +
      "export function Banner() {\n" +
      "  return <p>{process.env.STRIPE_SECRET_KEY}</p>;\n" +
      "}\n";
    fs.writeFileSync(path.join(dir, "actions.ts"), source);
    fs.writeFileSync(path.join(dir, "Banner.tsx"), clientSource);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports correct runtime and taint finding locations in JSON and SARIF", async () => {
    const result = await new AuditEngine({ timeoutMs: SUCCESS_PATH_BUDGET_MS, silent: true, seed: 42, runs: 6 }).run(dir);
    const actionLoc = expectedLocation(source, "crashes");
    // The data-flow stage reports the sink expression itself (not its JSX `{`
    // container); an ASCII-only variant of this line reports the same column.
    const sinkLoc = expectedLocation(clientSource, "process.env.STRIPE_SECRET_KEY");

    const runtime = result.findings.filter((f) => f.type === "runtime-exception");
    expect(runtime.length).toBeGreaterThan(0);
    for (const f of runtime) expect({ line: f.location?.line, column: f.location?.column }).toEqual(actionLoc);

    const taint = result.findings.filter((f) => f.type === "taint-violation");
    expect(taint).toHaveLength(1);
    expect({ line: taint[0].location?.line, column: taint[0].location?.column }).toEqual(sinkLoc);

    const json = JSON.parse(formatJson(result));
    const jsonRuntime = json.findings.filter((f: { type: string }) => f.type === "runtime-exception");
    for (const f of jsonRuntime) expect(f.location).toEqual(actionLoc);
    const jsonAction = json.actions.find((a: { name: string }) => a.name === "crashes");
    expect({ line: jsonAction.line, column: jsonAction.column }).toEqual(actionLoc);

    const sarif = JSON.parse(formatSarif(result));
    const regions = sarif.runs[0].results.map(
      (r: { ruleId: string; locations: Array<{ physicalLocation: { region: { startLine: number; startColumn: number } } }> }) => ({
        ruleId: r.ruleId,
        ...r.locations[0].physicalLocation.region,
      })
    );
    for (const r of regions.filter((r: { ruleId: string }) => r.ruleId === "SIS003")) {
      expect({ line: r.startLine, column: r.startColumn }).toEqual(actionLoc);
    }
    const sarifTaint = regions.find((r: { ruleId: string }) => r.ruleId === "SIS001");
    expect({ line: sarifTaint.startLine, column: sarifTaint.startColumn }).toEqual(sinkLoc);
  }, 60_000);

  it("prints the correct line in terminal output", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [TEST_CLI, "audit", dir, ...SUCCESS_PATH_CLI_ARGS, "--seed", "42", "--runs", "6"],
      { cwd: REPO_ROOT, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } }
    ).catch((err: { stdout: string }) => ({ stdout: err.stdout }));

    const actionLoc = expectedLocation(source, "crashes");
    expect(stdout).toContain(`actions.ts:${actionLoc.line}`);
    const lines = stdout.split(/\r?\n/).filter((l) => /actions\.ts:\d+/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain(`actions.ts:${actionLoc.line}`);
  }, 60_000);
});
