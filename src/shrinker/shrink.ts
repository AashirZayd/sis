import type { CandidateFunctionSource, RuntimeExecutionResult } from "../runtime/types.js";
import { runInIsolate } from "../runtime/worker.js";
import { isPayloadTransferable } from "../runtime/compatibility.js";
import { formatPayloadValue } from "../payload/display.js";
import { getFailureSignature, formatFailureSignature } from "./signature.js";
import { generateShrinkCandidates, getPayloadSize } from "./candidates.js";
import type { ShrinkOptions, ShrinkResult } from "./types.js";

/**
 * Reduces a runtime-confirmed failing payload to its smallest reproducible form
 * while preserving the exact failure signature in a fresh, isolated sandbox.
 */
export async function shrinkFailurePayload(
  candidate: CandidateFunctionSource,
  failingExecution: RuntimeExecutionResult,
  options: ShrinkOptions = {}
): Promise<ShrinkResult> {
  const maxAttempts = options.maxAttempts ?? 30;
  const timeoutMs = options.timeoutMs ?? failingExecution.timeoutMs ?? 20;

  const originalSig = formatFailureSignature(
    getFailureSignature(
      failingExecution.actionName,
      failingExecution.status,
      failingExecution.error
    )
  );

  let currentMinimal: unknown = failingExecution.payloadValue;
  const originalSize = getPayloadSize(currentMinimal);
  let currentSize = originalSize;

  let attempts = 0;
  let accepted = 0;

  // Set of tested payload string representations to prevent duplicate runs
  const tested = new Set<string>();
  tested.add(formatPayloadValue(currentMinimal));

  let madeProgress = true;

  while (madeProgress && attempts < maxAttempts) {
    madeProgress = false;

    // Generate candidates from the current minimal representation
    const candidateList = generateShrinkCandidates(currentMinimal);

    for (const candidatePayload of candidateList) {
      if (attempts >= maxAttempts) break;

      const formatted = formatPayloadValue(candidatePayload);
      if (tested.has(formatted)) continue;
      tested.add(formatted);

      // Verify payload can safely cross into the isolate
      const compat = isPayloadTransferable(candidatePayload);
      if (!compat.transferable) continue;

      const candidateSize = getPayloadSize(candidatePayload);
      // Only accept if strictly smaller or simpler
      if (candidateSize > currentSize) continue;

      attempts++;

      // Execute candidate in a fresh, zero-privilege isolate
      const execRes = await runInIsolate(candidate, candidatePayload, { timeoutMs });
      const candidateSig = formatFailureSignature(
        getFailureSignature(
          failingExecution.actionName,
          execRes.status,
          execRes.error
        )
      );

      // Signature matching: Candidate must reproduce the exact same failure class
      if (candidateSig === originalSig) {
        currentMinimal = candidatePayload;
        currentSize = candidateSize;
        accepted++;
        madeProgress = true;
        // Break to restart candidate generation from the newly reduced minimal
        break;
      }
    }
  }

  // Phase 9: Final verification check
  const finalCheck = await runInIsolate(candidate, currentMinimal, { timeoutMs });
  const finalSig = formatFailureSignature(
    getFailureSignature(
      failingExecution.actionName,
      finalCheck.status,
      finalCheck.error
    )
  );
  let verified = finalSig === originalSig;

  // If final verification fails unexpectedly, safely fall back to original payload
  if (!verified) {
    currentMinimal = failingExecution.payloadValue;
    currentSize = originalSize;
  }

  const reductionPercent =
    originalSize > currentSize && originalSize > 0
      ? Math.round(((originalSize - currentSize) / originalSize) * 1000) / 10
      : 0;

  return {
    actionName: failingExecution.actionName,
    originalPayload: failingExecution.payloadValue,
    minimalPayload: currentMinimal,
    signature: originalSig,
    statistics: {
      attempts,
      accepted,
      originalSize,
      minimalSize: currentSize,
      reductionPercent,
    },
    attempts,
    reductionRatio: reductionPercent,
    verified,
  };
}
