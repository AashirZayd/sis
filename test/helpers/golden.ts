import { REPO_ROOT } from "./test-build.js";

/**
 * Normalizes CLI output for golden snapshots.
 *
 * Only values that legitimately vary between runs or hosts are rewritten:
 * - the absolute repository path (machine-specific)
 * - measured durations (`executionMs`, `wallTimeMs`, `durationMs`, terminal timings)
 * - line endings and ANSI colour codes
 *
 * Configured budgets such as `timeoutMs` and "20ms budget" are NOT rewritten,
 * because they are part of the observable contract.
 */
export function normalizeGoldenOutput(text: string): string {
  const rootForward = REPO_ROOT.replace(/\\/g, "/");
  const rootBackward = REPO_ROOT.replace(/\//g, "\\");

  return text
    .replace(/\r\n/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(new RegExp(escapeRegExp(rootForward), "gi"), "<ROOT>")
    .replace(new RegExp(escapeRegExp(rootBackward), "gi"), "<ROOT>")
    .replace(/"(executionMs|wallTimeMs|durationMs)": \d+/g, '"$1": "<T>"')
    .replace(/Wall time: \d+ms/g, "Wall time: <T>ms")
    .replace(/Execution: \d+ms \//g, "Execution: <T>ms /");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
