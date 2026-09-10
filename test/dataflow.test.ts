import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseModule } from "../src/parser/index.js";
import {
  buildModuleGraph,
  analyzeInterproceduralDataflow,
  resolveModuleSpecifier,
} from "../src/dataflow/index.js";
import { AuditEngine } from "../src/index.js";
import { formatJson, formatSarif } from "../src/output/index.js";

describe("Phase 9: Interprocedural Data-Flow & Boundary Analysis", () => {
  describe("Module Specifier Resolver", () => {
    const available = new Set([
      "lib/auth.ts",
      "lib/session.ts",
      "lib/index.ts",
      "app/actions.tsx",
      "components/profile.tsx",
    ]);

    it("should resolve relative sibling imports without extension", () => {
      const resolved = resolveModuleSpecifier("lib/session.ts", "./auth", available);
      expect(resolved).toBe("lib/auth.ts");
    });

    it("should resolve relative parent directory imports", () => {
      const resolved = resolveModuleSpecifier("components/profile.tsx", "../lib/auth", available);
      expect(resolved).toBe("lib/auth.ts");
    });

    it("should resolve directory index file", () => {
      const resolved = resolveModuleSpecifier("app/actions.tsx", "../lib", available);
      expect(resolved).toBe("lib/index.ts");
    });

    it("should ignore external package imports", () => {
      expect(resolveModuleSpecifier("lib/session.ts", "react", available)).toBeUndefined();
      expect(resolveModuleSpecifier("lib/session.ts", "next/server", available)).toBeUndefined();
    });
  });

  describe("Interprocedural Taint Flows", () => {
    it("should track multi-hop helper chain (auth -> session -> profile) into JSX sink", async () => {
      const authSource = `
        export function getSecret() {
          return process.env.AUTH_SECRET;
        }
      `;
      const sessionSource = `
        import { getSecret } from "./auth";
        export function createSession() {
          const secret = getSecret();
          return { secret, safe: "ok" };
        }
      `;
      const profileSource = `
        "use client";
        import { createSession } from "../lib/session";
        export function Profile() {
          const session = createSession();
          return <div>{session.secret}</div>;
        }
      `;

      const parsedAuth = await parseModule(authSource, { filename: "lib/auth.ts" });
      const parsedSession = await parseModule(sessionSource, { filename: "lib/session.ts" });
      const parsedProfile = await parseModule(profileSource, { filename: "components/profile.tsx" });

      const parsedModules = new Map([
        ["lib/auth.ts", parsedAuth],
        ["lib/session.ts", parsedSession],
        ["components/profile.tsx", parsedProfile],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0];
      expect(finding.type).toBe("taint-violation");
      expect(finding.severity).toBe("error");
      expect(finding.location?.file).toBe("components/profile.tsx");
      expect(finding.trace).toBeDefined();
      expect(finding.trace).toContain("process.env.AUTH_SECRET");
      expect(finding.trace).toContain("lib/auth.ts:getSecret()");
      expect(finding.trace).toContain("lib/session.ts:createSession()");
      expect(finding.trace).toContain("components/profile.tsx:JSX expression");
    });

    it("should respect property-level sensitivity (safe property does not trigger finding)", async () => {
      const authSource = `
        export function getSecret() {
          return process.env.AUTH_SECRET;
        }
      `;
      const sessionSource = `
        import { getSecret } from "./auth";
        export function createSession() {
          return { secret: getSecret(), safe: "ok" };
        }
      `;
      const profileSource = `
        "use client";
        import { createSession } from "../lib/session";
        export function SafeProfile() {
          const session = createSession();
          return <div>{session.safe}</div>;
        }
      `;

      const parsedAuth = await parseModule(authSource, { filename: "lib/auth.ts" });
      const parsedSession = await parseModule(sessionSource, { filename: "lib/session.ts" });
      const parsedProfile = await parseModule(profileSource, { filename: "components/safe.tsx" });

      const parsedModules = new Map([
        ["lib/auth.ts", parsedAuth],
        ["lib/session.ts", parsedSession],
        ["components/safe.tsx", parsedProfile],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("should track function arguments through parameter into return value", async () => {
      const helperSource = `
        export function wrap(val) {
          return { data: val };
        }
      `;
      const clientSource = `
        "use client";
        import { wrap } from "../lib/helper";
        export function Component() {
          const res = wrap(process.env.API_SECRET);
          return <span>{res.data}</span>;
        }
      `;

      const parsedHelper = await parseModule(helperSource, { filename: "lib/helper.ts" });
      const parsedClient = await parseModule(clientSource, { filename: "components/comp.tsx" });

      const parsedModules = new Map([
        ["lib/helper.ts", parsedHelper],
        ["components/comp.tsx", parsedClient],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].location?.file).toBe("components/comp.tsx");
    });

    it("should track destructuring of objects and arrays", async () => {
      const helperSource = `
        export function getPair() {
          return [process.env.AUTH_TOKEN, "public"];
        }
        export function getRecord() {
          return { token: process.env.AUTH_TOKEN, label: "user" };
        }
      `;
      const clientSource = `
        "use client";
        import { getPair, getRecord } from "../lib/helper";
        export function Component() {
          const [secret, publicVal] = getPair();
          const { token, label } = getRecord();
          return (
            <div>
              <span>{secret}</span>
              <span>{token}</span>
            </div>
          );
        }
      `;

      const parsedHelper = await parseModule(helperSource, { filename: "lib/helper.ts" });
      const parsedClient = await parseModule(clientSource, { filename: "components/comp.tsx" });

      const parsedModules = new Map([
        ["lib/helper.ts", parsedHelper],
        ["components/comp.tsx", parsedClient],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.findings.some((f) => f.location?.file === "components/comp.tsx")).toBe(true);
    });

    it("should resolve aliased named imports", async () => {
      const authSource = `
        export function getSecret() {
          return process.env.DATABASE_URL;
        }
      `;
      const clientSource = `
        "use client";
        import { getSecret as fetchDbKey } from "../lib/auth";
        export function Comp() {
          const key = fetchDbKey();
          return <div>{key}</div>;
        }
      `;

      const parsedAuth = await parseModule(authSource, { filename: "lib/auth.ts" });
      const parsedClient = await parseModule(clientSource, { filename: "components/comp.tsx" });

      const parsedModules = new Map([
        ["lib/auth.ts", parsedAuth],
        ["components/comp.tsx", parsedClient],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].trace).toContain("lib/auth.ts:getSecret()");
    });

    it("should resolve namespace imports (auth.getSecret())", async () => {
      const authSource = `
        export function getSecret() {
          return process.env.SECRET_KEY;
        }
      `;
      const clientSource = `
        "use client";
        import * as auth from "../lib/auth";
        export function Comp() {
          const secret = auth.getSecret();
          return <div>{secret}</div>;
        }
      `;

      const parsedAuth = await parseModule(authSource, { filename: "lib/auth.ts" });
      const parsedClient = await parseModule(clientSource, { filename: "components/comp.tsx" });

      const parsedModules = new Map([
        ["lib/auth.ts", parsedAuth],
        ["components/comp.tsx", parsedClient],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].trace).toContain("lib/auth.ts:getSecret()");
    });

    it("should resolve re-exports (export { x } from './y')", async () => {
      const authSource = `
        export function getSecret() {
          return process.env.SECRET_KEY;
        }
      `;
      const indexSource = `
        export { getSecret } from "./auth";
      `;
      const clientSource = `
        "use client";
        import { getSecret } from "../lib/index";
        export function Comp() {
          const s = getSecret();
          return <div>{s}</div>;
        }
      `;

      const parsedAuth = await parseModule(authSource, { filename: "lib/auth.ts" });
      const parsedIndex = await parseModule(indexSource, { filename: "lib/index.ts" });
      const parsedClient = await parseModule(clientSource, { filename: "components/comp.tsx" });

      const parsedModules = new Map([
        ["lib/auth.ts", parsedAuth],
        ["lib/index.ts", parsedIndex],
        ["components/comp.tsx", parsedClient],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].trace).toContain("lib/auth.ts:getSecret()");
    });

    it("should terminate cleanly on cyclic dependencies without stack overflow", async () => {
      const aSource = `
        import { fnB } from "./b";
        export function fnA(x) { return fnB(x); }
      `;
      const bSource = `
        import { fnA } from "./a";
        export function fnB(x) { return fnA(x); }
      `;

      const parsedA = await parseModule(aSource, { filename: "cycles/a.ts" });
      const parsedB = await parseModule(bSource, { filename: "cycles/b.ts" });

      const parsedModules = new Map([
        ["cycles/a.ts", parsedA],
        ["cycles/b.ts", parsedB],
      ]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(0);
      expect(result.modulesAnalyzed).toBe(2);
    });

    it("should be conservative on unresolved dynamic calls without false positives", async () => {
      const dynamicSource = `
        export function run() {
          const fn = (window as any).getDynamicHandler?.();
          return fn(process.env.SECRET_KEY);
        }
      `;

      const parsed = await parseModule(dynamicSource, { filename: "lib/dynamic.ts" });
      const parsedModules = new Map([["lib/dynamic.ts", parsed]]);

      const graph = buildModuleGraph(parsedModules);
      const result = analyzeInterproceduralDataflow(graph);

      expect(result.findings).toHaveLength(0);
    });
  });

  describe("Directory Audit Integration & Output Preservation", () => {
    it("should audit dataflow-project, discover interprocedural flow, and format JSON and SARIF", async () => {
      const targetDir = path.resolve(process.cwd(), "test/fixtures/dataflow-project");
      const engine = new AuditEngine({ runs: 5, seed: 42, silent: true });
      const result = await engine.run(targetDir);

      expect(result.findings.some((f) => f.type === "taint-violation")).toBe(true);

      const taintFinding = result.findings.find(
        (f) =>
          f.type === "taint-violation" &&
          f.location?.file.includes("profile.tsx")
      );
      expect(taintFinding).toBeDefined();
      expect(taintFinding?.trace).toBeDefined();
      expect(taintFinding?.trace).toContain("process.env.AUTH_SECRET");

      // Verify JSON preserves the structured trace
      const jsonReport = JSON.parse(formatJson(result));
      expect(jsonReport.version).toBe("1");
      const jsonTaint = jsonReport.findings.find((f: any) => f.ruleId === "SIS001");
      expect(jsonTaint).toBeDefined();
      expect(jsonTaint.trace).toBeInstanceOf(Array);
      expect(jsonTaint.trace.length).toBeGreaterThanOrEqual(3);

      // Verify SARIF preserves the trace in properties
      const sarifLog = JSON.parse(formatSarif(result));
      expect(sarifLog.version).toBe("2.1.0");
      const sarifTaint = sarifLog.runs[0].results.find((r: any) => r.ruleId === "SIS001");
      expect(sarifTaint).toBeDefined();
      expect(sarifTaint.properties?.trace).toBeInstanceOf(Array);
    });
  });
});
