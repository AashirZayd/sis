import type { Finding, SourceLocation } from "../core/types.js";
import type { TaintValue } from "./types.js";

export interface SinkMatch {
  location: SourceLocation;
  sinkDescription: string;
}

/**
 * Creates a high-confidence taint violation finding.
 */
export function createTaintViolationFinding(
  taint: TaintValue,
  sink: SinkMatch
): Finding {
  const fullTrace = [...taint.trace, sink.sinkDescription];

  return {
    type: "taint-violation",
    severity: "error",
    message: `Sensitive environment value ${taint.source.name} reaches client-side code`,
    location: sink.location,
    trace: fullTrace,
  };
}
