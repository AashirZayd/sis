import chalk from "chalk";
import type { Finding, SourceLocation } from "../core/types.js";
import { symbols } from "./terminal.js";

/**
 * Formats a source location as "file:line:col".
 */
export function formatLocation(loc: SourceLocation): string {
  return `${loc.file}:${loc.line}:${loc.column}`;
}

/**
 * Formats a finding into a structured diagnostic line.
 */
export function formatFinding(finding: Finding): string {
  const icon =
    finding.severity === "error"
      ? symbols.failure
      : finding.severity === "warning"
        ? symbols.warning
        : symbols.bullet;

  const severityLabel =
    finding.severity === "error"
      ? chalk.red.bold(finding.severity.toUpperCase())
      : finding.severity === "warning"
        ? chalk.yellow.bold(finding.severity.toUpperCase())
        : chalk.blue.bold(finding.severity.toUpperCase());

  const locStr = finding.location ? ` ${chalk.dim(`(${formatLocation(finding.location)})`)}` : "";
  const actionStr = finding.action ? ` ${chalk.cyan(`[${finding.action}]`)}` : "";

  return `${icon} ${severityLabel}${actionStr} ${finding.message}${locStr}`;
}
