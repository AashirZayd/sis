import swc, { type Module, type ModuleItem } from "@swc/core";
import type { ParsedModule } from "../parser/types.js";
import type { ServerAction } from "../core/types.js";
import type { GeneratedPayload } from "../payload/types.js";
import { isPayloadTransferable, isActionSandboxCompatible } from "./compatibility.js";
import { runInIsolate } from "./worker.js";
import type {
  CandidateFunctionSource,
  RuntimeExecutionOptions,
  RuntimeExecutionResult,
  RuntimeVerificationSummary,
} from "./types.js";

/**
 * Extracts candidate function source code from the module's SWC AST
 * and transforms it from TypeScript to standard ES2022 JavaScript.
 */
export function extractCandidateFunction(
  _source: string,
  parsed: ParsedModule,
  action: ServerAction
): CandidateFunctionSource | null {
  const items = parsed.ast.body;

  let targetItem: ModuleItem | null = null;

  for (const item of items) {
    if (item.type === "ExportDeclaration") {
      const decl = item.declaration;
      if (!decl) continue;

      if (decl.type === "FunctionDeclaration" && decl.identifier?.value === action.name) {
        // Direct export async function fn(...) { ... }
        targetItem = decl;
        break;
      }

      if (decl.type === "VariableDeclaration") {
        // Direct export const fn = async (...) => { ... }
        for (const declarator of decl.declarations) {
          if (declarator.id.type === "Identifier" && declarator.id.value === action.name && declarator.init) {
            targetItem = decl;
            break;
          }
        }
        if (targetItem) break;
      }
    }

    if (item.type === "ExportNamedDeclaration") {
      // export { fnName } or export { fnName as alias }
      for (const spec of item.specifiers) {
        if (spec.type === "ExportSpecifier") {
          const exportedName = spec.exported ? spec.exported.value : spec.orig.value;
          if (exportedName === action.name) {
            const localName = spec.orig.value;
            // Search top-level declarations for localName
            for (const topItem of items) {
              if (topItem.type === "FunctionDeclaration" && topItem.identifier?.value === localName) {
                targetItem = topItem;
                break;
              }
              if (topItem.type === "VariableDeclaration") {
                for (const declarator of topItem.declarations) {
                  if (declarator.id.type === "Identifier" && declarator.id.value === localName && declarator.init) {
                    targetItem = topItem;
                    break;
                  }
                }
                if (targetItem) break;
              }
            }
            if (targetItem) break;
          }
        }
      }
      if (targetItem) break;
    }

    if (item.type === "ExportDefaultDeclaration") {
      const inner = item.decl;
      if (inner.type === "FunctionExpression" && (action.name === "default" || inner.identifier?.value === action.name)) {
        // Convert to a named function declaration AST node
        targetItem = {
          type: "FunctionDeclaration",
          span: inner.span,
          identifier: {
            type: "Identifier",
            span: inner.span,
            value: action.name,
            optional: false,
          },
          declare: false,
          params: inner.params,
          decorators: [],
          body: inner.body,
          async: inner.async,
          generator: inner.generator,
          typeParameters: inner.typeParameters,
          returnType: inner.returnType,
        };
        break;
      }
    }
  }

  if (!targetItem) {
    return null;
  }

  // Ensure candidate is sandbox-compatible (does not reference missing host globals)
  const compat = isActionSandboxCompatible(targetItem);
  if (!compat.compatible) {
    action.executionCompatibility = "static-only";
    return null;
  }

  try {
    // Print the extracted AST node with SWC
    const miniModule: Module = {
      type: "Module",
      span: targetItem.span,
      body: [targetItem],
      interpreter: parsed.ast.interpreter,
    };
    const compat = isActionSandboxCompatible(targetItem);
    if (!compat.compatible) {
      action.executionCompatibility = "static-only";
      return null;
    }

    const printed = swc.printSync(miniModule);

    // Strip TypeScript annotations and compile to clean ES2022 JavaScript
    const transformed = swc.transformSync(printed.code, {
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: true,
        },
        target: "es2022",
      },
    });

    return {
      actionName: action.name,
      code: transformed.code,
      location: action.location,
    };
  } catch {
    return null;
  }
}

/**
 * Executes a single candidate action against a list of synthesized payloads.
 */
export async function executeCandidateAction(
  candidate: CandidateFunctionSource,
  payloads: GeneratedPayload[],
  options: RuntimeExecutionOptions = {}
): Promise<RuntimeExecutionResult[]> {
  const results: RuntimeExecutionResult[] = [];

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const payloadId = i + 1;

    // Check payload transfer compatibility
    const compat = isPayloadTransferable(payload.value);

    if (!compat.transferable) {
      results.push({
        actionName: candidate.actionName,
        payloadId,
        category: payload.category,
        payloadDescription: payload.description,
        payloadValue: payload.value,
        status: "unsupported",
        executionMs: 0,
        wallTimeMs: 0,
        timeoutMs: options.timeoutMs ?? 20,
        durationMs: 0,
        error: {
          name: "UnsupportedPayloadError",
          message: compat.reason ?? "Payload cannot be safely transferred into isolate",
        },
        location: candidate.location,
        fuzzTarget: payload.fuzzTarget,
        strategy: payload.strategy,
        invariant: payload.invariant,
        parameter: payload.parameter,
      });
      continue;
    }

    // Execute within isolated-vm
    const execRes = await runInIsolate(candidate, payload.value, options);

    results.push({
      actionName: candidate.actionName,
      payloadId,
      category: payload.category,
      payloadDescription: payload.description,
      payloadValue: payload.value,
      status: execRes.status,
      executionMs: execRes.executionMs,
      wallTimeMs: execRes.wallTimeMs,
      timeoutMs: execRes.timeoutMs,
      durationMs: execRes.durationMs,
      error: execRes.error,
      location: candidate.location,
      fuzzTarget: payload.fuzzTarget,
      strategy: payload.strategy,
      invariant: payload.invariant,
      parameter: payload.parameter,
    });
  }

  return results;
}

/**
 * Orchestrates runtime verification across all candidate Server Actions in a module.
 */
export async function verifyRuntimeActions(
  source: string,
  parsed: ParsedModule,
  payloads: GeneratedPayload[] | Map<string, GeneratedPayload[]>,
  options: RuntimeExecutionOptions = {}
): Promise<RuntimeVerificationSummary> {
  const allExecutions: RuntimeExecutionResult[] = [];
  let passed = 0;
  let failed = 0;
  let timedOut = 0;
  let unsupported = 0;

  for (const action of parsed.actions) {
    if (action.executionCompatibility === "static-only") {
      unsupported++;
      continue;
    }

    const candidate = extractCandidateFunction(source, parsed, action);
    if (!candidate) {
      if ((action.executionCompatibility as string) === "static-only") {
        unsupported++;
      }
      continue;
    }

    const actionPayloads = payloads instanceof Map
      ? (payloads.get(action.name) ?? [])
      : payloads;

    const executions = await executeCandidateAction(candidate, actionPayloads, options);
    allExecutions.push(...executions);
  }

  for (const exec of allExecutions) {
    switch (exec.status) {
      case "passed":
        passed++;
        break;
      case "failed":
        failed++;
        break;
      case "timeout":
        timedOut++;
        break;
      case "unsupported":
        unsupported++;
        break;
      case "execution-error":
        unsupported++;
        break;
    }
  }

  const executed = passed + failed + timedOut;

  return {
    executions: allExecutions,
    executed,
    passed,
    failed,
    timedOut,
    unsupported,
    timeoutMs: options.timeoutMs ?? 20,
  };
}
