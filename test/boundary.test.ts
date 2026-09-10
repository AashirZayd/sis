import { describe, it, expect } from "vitest";
import path from "node:path";
import * as swc from "@swc/core";
import { SourceMapLocator } from "../src/parser/location.js";
import {
  NextBoundaryVisitor,
  checkSerializability,
  analyzePropBoundaries,
  analyzeReturnBoundaries,
  hasFunctionLevelServerDirective,
} from "../src/boundary/index.js";
import { buildModuleGraph } from "../src/dataflow/graph.js";
import { audit, AuditEngine } from "../src/index.js";
import { parseModule } from "../src/parser/index.js";

describe("Phase 10: Next.js-Aware Boundary Semantics", () => {
  describe("1. Directive Prologue & Boundary Classification", () => {
    it("distinguishes client-module, server-module, and server-component boundaries", async () => {
      const clientCode = `"use client";\nexport function C() { return null; }`;
      const clientAst = await swc.parse(clientCode, { syntax: "typescript" });
      const clientRes = new NextBoundaryVisitor("Client.tsx", new SourceMapLocator("Client.tsx", clientCode)).visit(clientAst);
      expect(clientRes.isClientModule).toBe(true);
      expect(clientRes.boundaries[0].kind).toBe("client-module");

      const serverCode = `"use server";\nexport async function action() { return 1; }`;
      const serverAst = await swc.parse(serverCode, { syntax: "typescript" });
      const serverRes = new NextBoundaryVisitor("actions.ts", new SourceMapLocator("actions.ts", serverCode)).visit(serverAst);
      expect(serverRes.isServerModule).toBe(true);
      expect(serverRes.boundaries[0].kind).toBe("server-module");

      const compCode = `export default function Page() { return null; }`;
      const compAst = await swc.parse(compCode, { syntax: "typescript" });
      const compRes = new NextBoundaryVisitor("page.tsx", new SourceMapLocator("page.tsx", compCode)).visit(compAst);
      expect(compRes.isClientModule).toBe(false);
      expect(compRes.isServerModule).toBe(false);
      expect(compRes.boundaries[0].kind).toBe("server-component");
    });

    it("identifies function-level 'use server' in function declarations and arrow functions", async () => {
      const code = `
export async function declaredAction() {
  "use server";
  return { ok: true };
}

export const arrowAction = async () => {
  "use server";
  return { arrow: true };
};
`;
      const ast = await swc.parse(code, { syntax: "typescript" });
      const res = new NextBoundaryVisitor("actions.ts", new SourceMapLocator("actions.ts", code)).visit(ast);

      expect(res.actions).toHaveLength(2);
      expect(res.actions[0].name).toBe("declaredAction");
      expect(res.actions[0].confidence).toBe("definite");
      expect(res.actions[0].isInlineDirective).toBe(true);

      expect(res.actions[1].name).toBe("arrowAction");
      expect(res.actions[1].confidence).toBe("definite");
      expect(res.actions[1].isInlineDirective).toBe(true);
    });

    it("rejects non-prologue or fake string directives (negative cases)", async () => {
      const code = `
const msg = "use server";
console.log("use server");

export async function invalid() {
  const x = 1;
  "use server"; // misplaced: not in prologue
  return x;
}
`;
      const ast = await swc.parse(code, { syntax: "typescript" });
      const res = new NextBoundaryVisitor("fake.ts", new SourceMapLocator("fake.ts", code)).visit(ast);

      expect(res.isServerModule).toBe(false);
      // The invalid action has a misplaced directive after `const x = 1`, so it must NOT be marked definite
      const invalidAction = res.actions.find((a) => a.name === "invalid");
      expect(invalidAction?.isInlineDirective).toBeFalsy();
    });
  });

  describe("2. React Flight Serializability Evaluation", () => {
    it("recognizes supported React Flight primitives, Date, Map, Set, and plain objects", async () => {
      const code = `
const a = "string";
const b = 123;
const c = true;
const d = new Date();
const e = new Set(["a", "b"]);
const f = new Map();
const g = { nested: 42, validDate: new Date() };
const h = [1, "two", { date: new Date() }];
`;
      const ast = await swc.parse(code, { syntax: "typescript" });
      const locator = new SourceMapLocator("test.ts", code);

      for (const item of ast.body) {
        if (item.type === "VariableDeclaration") {
          for (const decl of item.declarations) {
            if (decl.init) {
              const res = checkSerializability(decl.init, new Map(), locator);
              expect(res.status).toBe("serializable");
            }
          }
        }
      }
    });

    it("rejects unmarked function callbacks and custom class instances", async () => {
      const code = `
const callback = () => { console.log("click"); };
const dbHandle = new DatabaseConnection();
`;
      const ast = await swc.parse(code, { syntax: "typescript" });
      const locator = new SourceMapLocator("test.ts", code);

      const items = ast.body as any[];
      const fnDecl = items[0].declarations[0].init;
      const fnRes = checkSerializability(fnDecl, new Map(), locator);
      expect(fnRes.status).toBe("unsupported");
      expect(fnRes.isFunction).toBe(true);

      const classDecl = items[1].declarations[0].init;
      const classRes = checkSerializability(classDecl, new Map(), locator);
      expect(classRes.status).toBe("unsupported");
      expect(classRes.isClassInstance).toBe(true);
    });

    it("accepts inline Server Functions marked with 'use server'", async () => {
      const code = `
const serverFn = async () => {
  "use server";
  return 1;
};
`;
      const ast = await swc.parse(code, { syntax: "typescript" });
      const locator = new SourceMapLocator("test.ts", code);
      const decl = (ast.body[0] as any).declarations[0].init;
      const res = checkSerializability(decl, new Map(), locator);
      expect(res.status).toBe("serializable");
    });
  });

  describe("3. Server -> Client Prop Boundary Analysis", () => {
    it("detects prop boundary edges, safe props, and violations in fixture project", async () => {
      const pageFile = "test/fixtures/next-boundaries/app/page.tsx";
      const clientFile = "test/fixtures/next-boundaries/components/ClientCard.tsx";
      const dbFile = "test/fixtures/next-boundaries/lib/db.ts";
      const actionsFile = "test/fixtures/next-boundaries/app/actions.ts";

      const fs = await import("node:fs");
      const pageSrc = fs.readFileSync(pageFile, "utf8");
      const clientSrc = fs.readFileSync(clientFile, "utf8");
      const dbSrc = fs.readFileSync(dbFile, "utf8");
      const actionsSrc = fs.readFileSync(actionsFile, "utf8");

      const pageParsed = await parseModule(pageSrc, { filename: "app/page.tsx" });
      const clientParsed = await parseModule(clientSrc, { filename: "components/ClientCard.tsx" });
      const dbParsed = await parseModule(dbSrc, { filename: "lib/db.ts" });
      const actionsParsed = await parseModule(actionsSrc, { filename: "app/actions.ts" });

      const parsedMap = new Map([
        ["app/page.tsx", pageParsed],
        ["components/ClientCard.tsx", clientParsed],
        ["lib/db.ts", dbParsed],
        ["app/actions.ts", actionsParsed],
      ]);

      const graph = buildModuleGraph(parsedMap);
      const propResult = analyzePropBoundaries(graph);

      expect(propResult.edges.length).toBeGreaterThanOrEqual(4);
      expect(propResult.verifiedSafeProps).toBeGreaterThanOrEqual(2);
      expect(propResult.serializabilityViolations).toBeGreaterThanOrEqual(2);

      // Verify callback function violation was caught
      const callbackFinding = propResult.findings.find(
        (f) => f.type === "serialization-violation" && f.message.includes("onClick")
      );
      expect(callbackFinding).toBeDefined();

      // Verify dbInstance violation was caught
      const dbFinding = propResult.findings.find(
        (f) => f.type === "serialization-violation" && f.message.includes("db")
      );
      expect(dbFinding).toBeDefined();

      // Verify secret leak was caught
      const secretFinding = propResult.findings.find(
        (f) => f.type === "taint-violation" && f.message.includes("token")
      );
      expect(secretFinding).toBeDefined();
    });
  });

  describe("4. Server Action Return Value Boundary Analysis", () => {
    it("detects non-serializable and secret returns in Server Actions", async () => {
      const fs = await import("node:fs");
      const actionsFile = "test/fixtures/next-boundaries/app/actions.ts";
      const dbFile = "test/fixtures/next-boundaries/lib/db.ts";

      const actionsSrc = fs.readFileSync(actionsFile, "utf8");
      const dbSrc = fs.readFileSync(dbFile, "utf8");

      const actionsParsed = await parseModule(actionsSrc, { filename: "app/actions.ts" });
      const dbParsed = await parseModule(dbSrc, { filename: "lib/db.ts" });

      const parsedMap = new Map([
        ["app/actions.ts", actionsParsed],
        ["lib/db.ts", dbParsed],
      ]);

      const graph = buildModuleGraph(parsedMap);
      const returnResult = analyzeReturnBoundaries(graph);

      expect(returnResult.verifiedSafeReturns).toBeGreaterThanOrEqual(1);
      expect(returnResult.returnViolations).toBeGreaterThanOrEqual(2);

      const taintViolation = returnResult.findings.find((f) => f.type === "taint-violation");
      expect(taintViolation).toBeDefined();
      expect(taintViolation?.action).toBe("leakSecret");

      const serializationViolation = returnResult.findings.find(
        (f) => f.type === "serialization-violation" && f.action === "returnDatabase"
      );
      expect(serializationViolation).toBeDefined();
    });
  });

  describe("5. End-to-End Directory Audit with Boundary Semantics", () => {
    it("audits the next-boundaries fixture project and aggregates all findings", async () => {
      const result = await audit("./test/fixtures/next-boundaries", {
        silent: true,
        runs: 5,
        seed: 42,
      });

      expect(result.statistics.filesAnalyzed).toBeGreaterThanOrEqual(6);
      expect(result.statistics.propBoundariesFound).toBeGreaterThanOrEqual(4);
      expect(result.statistics.verifiedSafeProps).toBeGreaterThanOrEqual(2);
      expect(result.statistics.serializabilityViolations).toBeGreaterThanOrEqual(3);

      const taintViolations = result.findings.filter((f) => f.type === "taint-violation");
      expect(taintViolations.length).toBeGreaterThanOrEqual(2);

      const serializationViolations = result.findings.filter((f) => f.type === "serialization-violation");
      expect(serializationViolations.length).toBeGreaterThanOrEqual(3);
    });
  });
});
