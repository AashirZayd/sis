import { describe, it, expect } from "vitest";
import {
  formatJson,
  formatSarif,
  serializeSpecialPayload,
  OUTPUT_SCHEMA_VERSION,
  SARIF_SCHEMA,
  RULES,
  mapFindingToRule,
  mapSeverityToSarifLevel,
} from "../src/output/index.js";
import type { AuditResult, Finding } from "../src/core/types.js";

describe("Output Subsystem", () => {
  describe("serializeSpecialPayload", () => {
    it("should serialize standard primitives unchanged", () => {
      expect(serializeSpecialPayload("hello")).toBe("hello");
      expect(serializeSpecialPayload(42)).toBe(42);
      expect(serializeSpecialPayload(true)).toBe(true);
      expect(serializeSpecialPayload(null)).toBe(null);
      expect(serializeSpecialPayload([1, "a", false])).toEqual([1, "a", false]);
      expect(serializeSpecialPayload({ a: 1, b: "test" })).toEqual({ a: 1, b: "test" });
    });

    it("should safely serialize undefined without loss", () => {
      expect(serializeSpecialPayload(undefined)).toEqual({ $sis_type: "undefined" });
      expect(serializeSpecialPayload({ val: undefined })).toEqual({
        val: { $sis_type: "undefined" },
      });
    });

    it("should safely serialize exotic numbers (NaN, Infinity, -Infinity, -0)", () => {
      expect(serializeSpecialPayload(NaN)).toEqual({
        $sis_type: "special-number",
        value: "NaN",
      });
      expect(serializeSpecialPayload(Infinity)).toEqual({
        $sis_type: "special-number",
        value: "Infinity",
      });
      expect(serializeSpecialPayload(-Infinity)).toEqual({
        $sis_type: "special-number",
        value: "-Infinity",
      });
      expect(serializeSpecialPayload(-0)).toEqual({
        $sis_type: "special-number",
        value: "-0",
      });
    });

    it("should safely serialize BigInt", () => {
      expect(serializeSpecialPayload(BigInt(9007199254740991))).toEqual({
        $sis_type: "bigint",
        value: "9007199254740991",
      });
    });

    it("should safely serialize Symbol and Function", () => {
      expect(serializeSpecialPayload(Symbol("mySymbol"))).toEqual({
        $sis_type: "symbol",
        description: "mySymbol",
      });

      function sampleFn() {}
      expect(serializeSpecialPayload(sampleFn)).toEqual({
        $sis_type: "function",
        name: "sampleFn",
      });
    });

    it("should safely serialize Date, RegExp, and Error", () => {
      const date = new Date("2026-09-07T00:00:00.000Z");
      expect(serializeSpecialPayload(date)).toEqual({
        $sis_type: "date",
        value: "2026-09-07T00:00:00.000Z",
      });

      const regex = /pattern/gi;
      expect(serializeSpecialPayload(regex)).toEqual({
        $sis_type: "regexp",
        source: "pattern",
        flags: "gi",
      });

      const error = new TypeError("Invalid parameter");
      const serializedError = serializeSpecialPayload(error) as {
        $sis_type: string;
        name: string;
        message: string;
      };
      expect(serializedError.$sis_type).toBe("error");
      expect(serializedError.name).toBe("TypeError");
      expect(serializedError.message).toBe("Invalid parameter");
    });

    it("should prevent infinite recursion on circular references", () => {
      const circularObj: Record<string, unknown> = { name: "cycle" };
      circularObj.self = circularObj;

      const serialized = serializeSpecialPayload(circularObj) as Record<string, unknown>;
      expect(serialized.name).toBe("cycle");
      expect(serialized.self).toEqual({ $sis_type: "circular-reference" });
    });
  });

  describe("Rule Mappings", () => {
    it("should map each finding type to a stable rule definition", () => {
      expect(mapFindingToRule("taint-violation").id).toBe("SIS001");
      expect(mapFindingToRule("serialization-violation").id).toBe("SIS002");
      expect(mapFindingToRule("runtime-exception").id).toBe("SIS003");
      expect(mapFindingToRule("timeout").id).toBe("SIS004");
      expect(mapFindingToRule("invariant-violation").id).toBe("SIS005");
    });

    it("should map finding severities to SARIF levels", () => {
      expect(mapSeverityToSarifLevel("error")).toBe("error");
      expect(mapSeverityToSarifLevel("warning")).toBe("warning");
      expect(mapSeverityToSarifLevel("info")).toBe("note");
    });
  });

  describe("formatJson", () => {
    const mockFinding: Finding = {
      type: "runtime-exception",
      severity: "error",
      message: "updateUser threw TypeError: Cannot read properties of undefined",
      location: { file: "app/actions.ts", line: 42, column: 15 },
      action: "updateUser",
      payload: { id: NaN, name: undefined },
      executionMs: 1.2,
      wallTimeMs: 4.8,
      timeoutMs: 20,
      failureSignature: "TypeError: Cannot read properties of undefined",
      shrinkAttempts: 12,
      shrinkReduction: 85,
      minimalReproducerVerified: true,
      minimizedPayload: { id: NaN },
    };

    const mockAuditResult: AuditResult = {
      target: "app",
      filesAnalyzed: ["app/actions.ts", "app/client.tsx"],
      boundaries: [
        { type: "server", location: { file: "app/actions.ts", line: 1, column: 1 } },
        { type: "client", location: { file: "app/client.tsx", line: 1, column: 1 } },
      ],
      actions: [
        { name: "updateUser", location: { file: "app/actions.ts", line: 42, column: 15 } },
      ],
      findings: [mockFinding],
      statistics: {
        filesScanned: 5,
        filesAnalyzed: 2,
        filesSkipped: 3,
        boundariesFound: 2,
        actionsFound: 1,
        taintSourcesFound: 0,
        taintViolations: 0,
        payloadsGenerated: 25,
        executions: 25,
        passedExecutions: 24,
        failedExecutions: 1,
        timeoutExecutions: 0,
        unsupportedExecutions: 0,
        shrinkAttempts: 12,
        verifiedReproCount: 1,
      },
    };

    it("should generate valid JSON matching version 1 schema", () => {
      const jsonOutput = formatJson(mockAuditResult);
      const parsed = JSON.parse(jsonOutput);

      expect(parsed.version).toBe(OUTPUT_SCHEMA_VERSION);
      expect(parsed.version).toBe("1");
      expect(parsed.tool.name).toBe("sis");
      expect(parsed.tool.version).toBe("0.1.0");
      expect(parsed.target).toBe("app");
      expect(parsed.summary.filesScanned).toBe(5);
      expect(parsed.summary.filesAnalyzed).toBe(2);
      expect(parsed.summary.verifiedFindings).toBe(1);
      expect(parsed.summary.runtimeFailures).toBe(1);
      expect(parsed.files).toEqual(["app/actions.ts", "app/client.tsx"]);

      expect(parsed.findings).toHaveLength(1);
      const finding = parsed.findings[0];
      expect(finding.id).toBe("SIS003-1");
      expect(finding.ruleId).toBe("SIS003");
      expect(finding.ruleName).toBe("runtime-exception");
      expect(finding.severity).toBe("error");
      expect(finding.file).toBe("app/actions.ts");
      expect(finding.location).toEqual({ line: 42, column: 15 });
      expect(finding.actionName).toBe("updateUser");

      // Runtime metadata
      expect(finding.runtime.failureSignature).toBe("TypeError: Cannot read properties of undefined");
      expect(finding.runtime.executionMs).toBe(1.2);
      expect(finding.runtime.wallTimeMs).toBe(4.8);
      expect(finding.runtime.timeoutMs).toBe(20);
      expect(finding.runtime.payload).toEqual({
        id: { $sis_type: "special-number", value: "NaN" },
        name: { $sis_type: "undefined" },
      });

      // Shrink metadata
      expect(finding.shrink.attempts).toBe(12);
      expect(finding.shrink.reductionRatio).toBe(85);
      expect(finding.shrink.minimalReproducerVerified).toBe(true);
      expect(finding.shrink.minimizedPayload).toEqual({
        id: { $sis_type: "special-number", value: "NaN" },
      });
    });

    it("should normalize Windows paths in JSON output", () => {
      const winResult: AuditResult = {
        ...mockAuditResult,
        target: "app\\actions\\nested",
        filesAnalyzed: ["app\\actions\\nested\\actions.ts"],
        actions: [
          {
            name: "testAction",
            location: { file: "app\\actions\\nested\\actions.ts", line: 10, column: 5 },
          },
        ],
        findings: [
          {
            type: "taint-violation",
            severity: "error",
            message: "Secret leaked",
            location: { file: "app\\actions\\nested\\actions.ts", line: 10, column: 5 },
          },
        ],
      };

      const parsed = JSON.parse(formatJson(winResult));
      expect(parsed.target).toBe("app/actions/nested");
      expect(parsed.files[0]).toBe("app/actions/nested/actions.ts");
      expect(parsed.findings[0].file).toBe("app/actions/nested/actions.ts");
      expect(parsed.actions[0].file).toBe("app/actions/nested/actions.ts");
    });
  });

  describe("formatSarif", () => {
    const mockFinding: Finding = {
      type: "runtime-exception",
      severity: "error",
      message: "fragileAction threw TypeError: undefined is not an object",
      location: { file: "app/nested/fragile.ts", line: 18, column: 9 },
      action: "fragileAction",
      executionMs: 2.5,
      wallTimeMs: 6.1,
      timeoutMs: 20,
      failureSignature: "TypeError: undefined is not an object",
      shrinkAttempts: 8,
      shrinkReduction: 75,
      minimalReproducerVerified: true,
      minimizedPayload: null,
    };

    const mockAuditResult: AuditResult = {
      target: "app",
      boundaries: [],
      actions: [],
      findings: [mockFinding],
      statistics: {
        filesScanned: 1,
        boundariesFound: 0,
        actionsFound: 1,
        taintSourcesFound: 0,
        taintViolations: 0,
        payloadsGenerated: 10,
        executions: 10,
      },
    };

    it("should generate valid OASIS SARIF 2.1.0 document", () => {
      const sarifString = formatSarif(mockAuditResult);
      const sarif = JSON.parse(sarifString);

      expect(sarif.$schema).toBe(SARIF_SCHEMA);
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs).toHaveLength(1);

      const run = sarif.runs[0];
      expect(run.tool.driver.name).toBe("SIS");
      expect(run.tool.driver.version).toBe("0.1.0");
      expect(run.tool.driver.informationUri).toBe("https://github.com/AashirZayd/sis");
      expect(run.tool.driver.rules).toHaveLength(Object.keys(RULES).length);

      const ruleIds = run.tool.driver.rules.map((r: { id: string }) => r.id);
      expect(ruleIds).toContain("SIS001");
      expect(ruleIds).toContain("SIS002");
      expect(ruleIds).toContain("SIS003");
      expect(ruleIds).toContain("SIS004");
      expect(ruleIds).toContain("SIS005");

      expect(run.results).toHaveLength(1);
      const res = run.results[0];
      expect(res.ruleId).toBe("SIS003");
      expect(res.level).toBe("error");
      expect(res.message.text).toBe("fragileAction threw TypeError: undefined is not an object");

      expect(res.locations).toHaveLength(1);
      const loc = res.locations[0];
      expect(loc.physicalLocation.artifactLocation.uri).toBe("app/nested/fragile.ts");
      expect(loc.physicalLocation.artifactLocation.uriBaseId).toBe("%SRCROOT%");
      expect(loc.physicalLocation.region.startLine).toBe(18);
      expect(loc.physicalLocation.region.startColumn).toBe(9);

      // Properties bag
      expect(res.properties).toBeDefined();
      expect(res.properties.actionName).toBe("fragileAction");
      expect(res.properties.failureSignature).toBe("TypeError: undefined is not an object");
      expect(res.properties.executionMs).toBe(2.5);
      expect(res.properties.timeoutMs).toBe(20);
      expect(res.properties.shrinkAttempts).toBe(8);
      expect(res.properties.shrinkReduction).toBe(75);
      expect(res.properties.minimalReproducerVerified).toBe(true);
      expect(res.properties.minimizedPayload).toBe(null);
    });

    it("should map non-error finding severity correctly in SARIF", () => {
      const warningResult: AuditResult = {
        ...mockAuditResult,
        findings: [
          {
            type: "invariant-violation",
            severity: "warning",
            message: "Speculative invariant warning",
            location: { file: "app/warning.ts", line: 5, column: 2 },
          },
        ],
      };

      const sarif = JSON.parse(formatSarif(warningResult));
      expect(sarif.runs[0].results[0].level).toBe("warning");
    });
  });
});
