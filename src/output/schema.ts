import type { FindingType, FindingSeverity } from "../core/types.js";
import type { SarifRule } from "./types.js";

export const OUTPUT_SCHEMA_VERSION = "1";
export const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
export const TOOL_NAME = "SIS";
export const TOOL_VERSION = "0.1.0";
export const INFORMATION_URI = "https://github.com/AashirZayd/sis";

export interface RuleDefinition {
  id: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  defaultLevel: "error" | "warning" | "note";
}

export const RULES: Record<FindingType, RuleDefinition> = {
  "taint-violation": {
    id: "SIS001",
    name: "taint-violation",
    shortDescription: "High-confidence secret flow into client boundary",
    fullDescription:
      "A sensitive server-side environment value or secret flows directly into a Client Component boundary, risking secret leakage.",
    defaultLevel: "error",
  },
  "serialization-violation": {
    id: "SIS002",
    name: "serialization-violation",
    shortDescription: "Non-transferable payload boundary violation",
    fullDescription:
      "A non-transferable value across the Server/Client boundary caused a serialization failure.",
    defaultLevel: "error",
  },
  "runtime-exception": {
    id: "SIS003",
    name: "runtime-exception",
    shortDescription: "Server Action uncaught runtime exception",
    fullDescription:
      "A candidate Server Action threw an uncaught runtime exception when invoked with adversarial or speculative input.",
    defaultLevel: "error",
  },
  timeout: {
    id: "SIS004",
    name: "timeout",
    shortDescription: "Server Action execution timed out",
    fullDescription:
      "A candidate Server Action exceeded its allocated isolated JavaScript execution budget, indicating potential denial of service or infinite loop.",
    defaultLevel: "error",
  },
  "invariant-violation": {
    id: "SIS005",
    name: "invariant-violation",
    shortDescription: "General invariant assertion failure",
    fullDescription:
      "A synthesized invariant condition was violated during execution or boundary evaluation.",
    defaultLevel: "error",
  },
};

export function mapFindingToRule(type: FindingType): RuleDefinition {
  return (
    RULES[type] ?? {
      id: "SIS005",
      name: "invariant-violation",
      shortDescription: "General invariant assertion failure",
      fullDescription:
        "A synthesized invariant condition was violated during execution or boundary evaluation.",
      defaultLevel: "error",
    }
  );
}

export function mapSeverityToSarifLevel(
  severity: FindingSeverity
): "error" | "warning" | "note" {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
    default:
      return "note";
  }
}

export const SARIF_RULES: SarifRule[] = Object.values(RULES).map((rule) => ({
  id: rule.id,
  name: rule.name,
  shortDescription: {
    text: rule.shortDescription,
  },
  fullDescription: {
    text: rule.fullDescription,
  },
  help: {
    text: rule.fullDescription,
    markdown: `**${rule.shortDescription}**\n\n${rule.fullDescription}\n\nRule ID: \`${rule.id}\``,
  },
  defaultConfiguration: {
    defaultLevel: rule.defaultLevel,
  },
  properties: {
    tags: ["security", "nextjs", "react-server-components", "runtime-verification"],
  },
}));
