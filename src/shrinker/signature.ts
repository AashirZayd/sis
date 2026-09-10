import type { RuntimeStatus } from "../runtime/types.js";
import type { FailureSignature } from "./types.js";

/**
 * Normalizes an error message by stripping ephemeral details such as:
 * - Timings (e.g., "timed out after 20ms")
 * - Line and column numbers (e.g., ":1:42")
 * - Hex memory addresses or object ids
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .split("\n")[0]
    .replace(/\s+at\s+.*/g, "")
    .replace(/\(eval at .*/g, "")
    .replace(/timed out after \d+ms/i, "timed out")
    .replace(/:\d+:\d+/g, "")
    .replace(/0x[0-9a-fA-F]+/g, "0x...")
    .trim()
    .toLowerCase();
}

/**
 * Extracts a deterministic, normalized failure signature object from an execution outcome.
 */
export function extractFailureSignature(
  actionOrExecution:
    | string
    | {
        actionName: string;
        status: RuntimeStatus;
        error?: { name?: string; message?: string };
      },
  status?: RuntimeStatus,
  error?: { name?: string; message?: string }
): FailureSignature {
  if (typeof actionOrExecution === "object" && actionOrExecution !== null) {
    return {
      actionName: actionOrExecution.actionName,
      status: actionOrExecution.status,
      errorName: actionOrExecution.error?.name,
      normalizedMessage: actionOrExecution.error?.message
        ? normalizeErrorMessage(actionOrExecution.error.message)
        : undefined,
    };
  }

  return {
    actionName: actionOrExecution,
    status: status ?? "failed",
    errorName: error?.name,
    normalizedMessage: error?.message
      ? normalizeErrorMessage(error.message)
      : undefined,
  };
}

/**
 * Computes a deterministic string representation of a failure signature.
 * Format: `<actionName>|<status>|<errorName>|<normalizedMessage>`
 */
export function formatFailureSignature(sig: FailureSignature | string): string {
  if (typeof sig === "string") return sig;
  const parts: string[] = [sig.actionName, sig.status];
  if (sig.errorName) {
    parts.push(sig.errorName);
  }
  if (sig.normalizedMessage) {
    parts.push(sig.normalizedMessage);
  }
  return parts.join("|");
}

/**
 * Convenience helper to compute signature object or string from execution details.
 */
export function getFailureSignature(
  actionOrExecution:
    | string
    | {
        actionName: string;
        status: RuntimeStatus;
        error?: { name?: string; message?: string };
      },
  status?: RuntimeStatus,
  error?: { name?: string; message?: string }
): FailureSignature {
  return extractFailureSignature(actionOrExecution, status, error);
}
