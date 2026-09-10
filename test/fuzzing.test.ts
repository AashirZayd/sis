import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import { extractFuzzTargets } from "../src/payload/targets/extractor.js";
import { inferParameterShape } from "../src/payload/targets/inference.js";
import { synthesizeBoundaryPayloads } from "../src/payload/strategies/index.js";
import { BoundaryMutationEngine } from "../src/payload/strategies/mutations.js";
import { generateClassifiedSerializationPayloads } from "../src/payload/strategies/serialization.js";
import { allocateBudgets, selectVariantsUnderBudget } from "../src/payload/strategies/budgeting.js";
import { AuditEngine } from "../src/index.js";
import path from "node:path";

describe("Phase 11: Boundary-Aware Speculative Fuzzing", () => {
  describe("Shape Inference & Target Extraction", () => {
    it("infers primitive shapes from TypeScript annotations", async () => {
      const code = `
        "use server";
        export async function testAction(name: string, count: number, flag: boolean) {
          return { name, count, flag };
        }
      `;
      const parsed = await parseModule(code, { filename: "test.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);

      const argTargets = targets.filter(
        (t) => t.kind === "server-action-argument" && t.actionName === "testAction"
      );
      expect(argTargets).toHaveLength(3);

      const nameTarget = argTargets.find((t) => t.parameterName === "name");
      const countTarget = argTargets.find((t) => t.parameterName === "count");
      const flagTarget = argTargets.find((t) => t.parameterName === "flag");

      expect(nameTarget?.inferredShape.kind).toBe("string");
      expect(countTarget?.inferredShape.kind).toBe("number");
      expect(flagTarget?.inferredShape.kind).toBe("boolean");
    });

    it("infers object and nested object shapes", async () => {
      const code = `
        "use server";
        export async function updateProfile(input: { user: { id: number; name: string } }) {
          return input.user.id;
        }
      `;
      const parsed = await parseModule(code, { filename: "profile.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);
      const argTarget = targets.find((t) => t.actionName === "updateProfile");
      expect(argTarget).toBeDefined();

      const shape = argTarget!.inferredShape;
      expect(shape.kind).toBe("object");
      expect(shape.properties).toBeDefined();

      const userProp = shape.properties!.get("user");
      expect(userProp).toBeDefined();
      expect(userProp!.kind).toBe("object");
      expect(userProp!.properties!.get("id")?.kind).toBe("number");
      expect(userProp!.properties!.get("name")?.kind).toBe("string");
    });

    it("infers array shapes", async () => {
      const code = `
        "use server";
        export async function processItems(tags: string[], nums: Array<number>) {
          return tags.length + nums.length;
        }
      `;
      const parsed = await parseModule(code, { filename: "items.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);

      const tagsTarget = targets.find((t) => t.parameterName === "tags");
      const numsTarget = targets.find((t) => t.parameterName === "nums");

      expect(tagsTarget?.inferredShape.kind).toBe("array");
      expect(tagsTarget?.inferredShape.elementType?.kind).toBe("string");
      expect(numsTarget?.inferredShape.kind).toBe("array");
      expect(numsTarget?.inferredShape.elementType?.kind).toBe("number");
    });

    it("infers shapes from destructuring and usage heuristics when untyped", async () => {
      const code = `
        "use server";
        export async function processUntyped(payload: any) {
          return payload.amount.toFixed(2) + payload.id.toLowerCase();
        }
      `;
      const parsed = await parseModule(code, { filename: "untyped.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);
      const argTarget = targets.find((t) => t.actionName === "processUntyped");
      expect(argTarget).toBeDefined();

      const shape = argTarget!.inferredShape;
      expect(shape.kind).toBe("object");
      expect(shape.properties).toBeDefined();
      expect(shape.properties!.get("amount")?.kind).toBe("number");
      expect(shape.properties!.get("id")?.kind).toBe("string");
    });
  });

  describe("Strategy Selection & Mutations", () => {
    it("generates boundary mutations for numbers including NaN, Infinity, -0, and extremes", () => {
      const variants = BoundaryMutationEngine.getNumericExtremeVariants();
      const values = variants.map((v) => v.value);
      expect(values.some((v) => Number.isNaN(v))).toBe(true);
      expect(values).toContain(Infinity);
      expect(values).toContain(-Infinity);
      expect(values).toContain(0);
      expect(values).toContain(Number.MAX_SAFE_INTEGER);
    });

    it("generates boundary mutations for strings including empty, whitespace, control chars, and long strings", () => {
      const variants = BoundaryMutationEngine.getStringHazardVariants();
      const values = variants.map((v) => v.value);
      expect(values).toContain("");
      expect(values).toContain(" ");
      expect(values).toContain("\0");
      expect(values.some((s) => typeof s === "string" && s.length > 1000)).toBe(true);
    });

    it("generates prototype pollution hazard mutations for objects", () => {
      const protoMutations = BoundaryMutationEngine.getPrototypeVariants();
      expect(protoMutations.length).toBeGreaterThan(0);
      const keys = protoMutations.map((m) => Object.keys(m.value as object)[0]);
      expect(keys).toContain("__proto__");
      expect(keys).toContain("constructor");
      expect(keys).toContain("prototype");
    });

    it("generates React Flight classified serialization payloads", () => {
      const classified = generateClassifiedSerializationPayloads();
      expect(classified.length).toBeGreaterThan(0);

      const supported = classified.filter((p) => p.classification === "supported");
      const unsupported = classified.filter((p) => p.classification === "unsupported");
      const edge = classified.filter((p) => p.classification === "edge");

      expect(supported.length).toBeGreaterThan(0);
      expect(unsupported.length).toBeGreaterThan(0);
      expect(edge.length).toBeGreaterThan(0);
    });
  });

  describe("Boundary Payload Synthesis & Budgeting", () => {
    it("synthesizes boundary-directed payloads for a typed action target", async () => {
      const code = `
        "use server";
        export async function calculate(amount: number) {
          return amount.toFixed(2);
        }
      `;
      const parsed = await parseModule(code, { filename: "calc.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);
      const argTarget = targets.find((t) => t.actionName === "calculate")!;

      const res = synthesizeBoundaryPayloads(argTarget, { runs: 50, seed: 12345 });
      expect(res.boundaryDirectedCount).toBeGreaterThan(0);
      expect(res.payloads.length).toBe(50);
      expect(res.strategiesUsed.length).toBeGreaterThan(0);

      // Verify every payload is tagged with fuzzTarget, strategy, and invariant
      for (const p of res.payloads) {
        expect(p.fuzzTarget).toBe("server-action-argument");
        expect(p.strategy).toBeDefined();
        expect(p.invariant).toBeDefined();
      }
    });

    it("allocates budgets deterministically without exceeding global cap", () => {
      const mockTargets = [
        { id: "target1" },
        { id: "target2" },
        { id: "target3" },
      ] as any[];
      const budgets = allocateBudgets(mockTargets, 30);
      expect(budgets.size).toBe(3);
      let total = 0;
      for (const b of budgets.values()) {
        total += b;
        expect(b).toBe(10);
      }
      expect(total).toBe(30);
    });

    it("is reproducible when using the same seed", async () => {
      const code = `
        "use server";
        export async function processUser(user: { id: number; name: string }) {
          return user.id;
        }
      `;
      const parsed = await parseModule(code, { filename: "user.ts" });
      const targets = extractFuzzTargets(parsed, parsed.actions);
      const argTarget = targets.find((t) => t.actionName === "processUser")!;

      const run1 = synthesizeBoundaryPayloads(argTarget, { runs: 30, seed: 42 });
      const run2 = synthesizeBoundaryPayloads(argTarget, { runs: 30, seed: 42 });

      expect(run1.payloads.length).toBe(run2.payloads.length);
      for (let i = 0; i < run1.payloads.length; i++) {
        expect(run1.payloads[i].strategy).toBe(run2.payloads[i].strategy);
        expect(run1.payloads[i].invariant).toBe(run2.payloads[i].invariant);
        if (typeof run1.payloads[i].value === "function") {
          expect(typeof run2.payloads[i].value).toBe("function");
        } else if (typeof run1.payloads[i].value === "symbol") {
          expect(typeof run2.payloads[i].value).toBe("symbol");
          expect(String(run1.payloads[i].value)).toBe(String(run2.payloads[i].value));
        } else {
          expect(run1.payloads[i].value).toEqual(run2.payloads[i].value);
        }
      }
    });
  });

  describe("End-to-End Audit & Shrinking on Boundary Fixture", () => {
    it("runs directory audit with boundary-aware fuzzing and shrinks minimal failure", async () => {
      const fixtureDir = path.resolve(process.cwd(), "test/fixtures/boundary-fuzzing");
      const engine = new AuditEngine({
        silent: true,
        runs: 50,
        seed: 42,
        timeoutMs: 50,
      });

      const result = await engine.run(fixtureDir);

      // Verify actions found
      expect(result.statistics.actionsFound).toBe(5);

      // Verify fuzzing statistics
      expect(result.statistics.fuzzTargetsDiscovered).toBeGreaterThan(0);
      expect(result.statistics.fuzzStrategiesApplied).toBeGreaterThan(0);
      expect(result.statistics.boundaryDirectedPayloads).toBeGreaterThan(0);

      // Verify that databaseAction (using prisma) was NOT executed (classified static-only)
      const executions = result.runtime?.executions ?? [];
      const dbExecutions = executions.filter((e) => e.actionName === "databaseAction");
      expect(dbExecutions).toHaveLength(0);

      // Verify runtime failure discovery on calculateTotal (throws TypeError on null/undefined)
      const failures = result.findings.filter((f) => f.type === "runtime-exception");
      expect(failures.length).toBeGreaterThan(0);

      // Verify metadata presence on runtime findings
      const calcFailure = failures.find((f) => f.action === "calculateTotal");
      expect(calcFailure).toBeDefined();
      expect(calcFailure!.fuzzTarget).toBe("server-action-argument");
      expect(calcFailure!.strategy).toBeDefined();
      expect(calcFailure!.invariant).toBeDefined();
      expect(calcFailure!.parameter).toBe("amount");

      // Verify shrinking reduced the failure
      expect(calcFailure!.minimizedPayload).toBeDefined();
      expect(calcFailure!.minimalReproducerVerified).toBe(true);
    });
  });
});
