import type { AuditResult } from "../core/types.js";
import {
  SARIF_SCHEMA,
  TOOL_NAME,
  TOOL_VERSION,
  INFORMATION_URI,
  SARIF_RULES,
  mapFindingToRule,
  mapSeverityToSarifLevel,
} from "./schema.js";
import { serializeSpecialPayload } from "./payload.js";
import type { SarifLog, SarifResult, SarifLocation } from "./types.js";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function formatSarif(
  result: AuditResult,
  options: { pretty?: boolean } = { pretty: true }
): string {
  const sarifResults: SarifResult[] = result.findings.map((f) => {
    const ruleDef = mapFindingToRule(f.type);
    const ruleIndex = SARIF_RULES.findIndex((r) => r.id === ruleDef.id);
    const fileUri = normalizePath(f.location?.file ?? result.target);

    const locations: SarifLocation[] = [
      {
        physicalLocation: {
          artifactLocation: {
            uri: fileUri,
            uriBaseId: "%SRCROOT%",
          },
          region: {
            startLine: f.location?.line ?? 1,
            startColumn: f.location?.column ?? 1,
          },
        },
      },
    ];

    const properties: Record<string, unknown> = {};

    if (f.action) {
      properties.actionName = f.action;
    }
    if (f.fuzzTarget) {
      properties.fuzzTarget = f.fuzzTarget;
    }
    if (f.strategy) {
      properties.strategy = f.strategy;
    }
    if (f.invariant) {
      properties.invariant = f.invariant;
    }
    if (f.parameter) {
      properties.parameter = f.parameter;
    }
    if (f.failureSignature || f.errorName) {
      properties.failureSignature = f.failureSignature ?? f.errorName;
    }
    if (f.executionMs !== undefined) {
      properties.executionMs = f.executionMs;
    }
    if (f.wallTimeMs !== undefined) {
      properties.wallTimeMs = f.wallTimeMs;
    }
    if (f.timeoutMs !== undefined) {
      properties.timeoutMs = f.timeoutMs;
    }
    if (f.shrinkAttempts !== undefined) {
      properties.shrinkAttempts = f.shrinkAttempts;
    }
    if (f.shrinkReduction !== undefined) {
      properties.shrinkReduction = f.shrinkReduction;
    }
    if (f.minimalReproducerVerified !== undefined) {
      properties.minimalReproducerVerified = f.minimalReproducerVerified;
    }
    if (f.minimizedPayload !== undefined) {
      properties.minimizedPayload = serializeSpecialPayload(f.minimizedPayload);
    } else if (f.payload !== undefined) {
      properties.payload = serializeSpecialPayload(f.payload);
    }
    if (f.trace && f.trace.length > 0) {
      properties.trace = f.trace;
    }

    const sarifResult: SarifResult = {
      ruleId: ruleDef.id,
      ruleIndex: ruleIndex >= 0 ? ruleIndex : undefined,
      level: mapSeverityToSarifLevel(f.severity),
      message: {
        text: f.message,
      },
      locations,
    };

    if (Object.keys(properties).length > 0) {
      sarifResult.properties = properties;
    }

    return sarifResult;
  });

  const sarifLog: SarifLog = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: TOOL_VERSION,
            informationUri: INFORMATION_URI,
            rules: SARIF_RULES,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(sarifLog, null, options.pretty ? 2 : undefined);
}
