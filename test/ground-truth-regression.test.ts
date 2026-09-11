import { describe, it, expect } from "vitest";
import { AuditEngine } from "../src/index.js";
import { parseModule } from "../src/parser/index.js";
import { buildModuleGraph } from "../src/dataflow/graph.js";
import { analyzeReturnBoundaries } from "../src/boundary/returns.js";
import { analyzePropBoundaries } from "../src/boundary/props.js";
import { isTestPath } from "../src/discovery/filters.js";
import { isActionSandboxCompatible } from "../src/runtime/compatibility.js";
import { synthesizePayloads } from "../src/payload/index.js";
import { verifyRuntimeActions } from "../src/runtime/index.js";

describe("Phase 23 Ground-Truth Regression Suite (10 Pilot Findings)", () => {
  describe("False Positives Resolved (4 Cases)", () => {
    it("[c39ca66764d41da4] shadcn-ui/taxonomy: app/api/webhooks/stripe/route.ts#L70 POST returning Response is not flagged", async () => {
      const code = `
        import { headers } from "next/headers";
        export async function POST(req: Request) {
          return new Response(null, { status: 200 });
        }
      `;
      const parsed = await parseModule(code, { filename: "app/api/webhooks/stripe/route.ts" });
      const graph = buildModuleGraph(new Map([["app/api/webhooks/stripe/route.ts", parsed]]));
      const res = analyzeReturnBoundaries(graph);

      // Must NOT produce SIS002 serialization violation
      expect(res.findings.some((f) => f.type === "serialization-violation")).toBe(false);
      expect(res.returnViolations).toBe(0);
    });

    it("[0f4dc5c476d30776] mickasmt/next-saas-stripe-starter: app/api/webhooks/stripe/route.ts#L76 POST returning Response is not flagged", async () => {
      const code = `
        export async function POST(req: Request) {
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }
      `;
      const parsed = await parseModule(code, { filename: "app/api/webhooks/stripe/route.ts" });
      const graph = buildModuleGraph(new Map([["app/api/webhooks/stripe/route.ts", parsed]]));
      const res = analyzeReturnBoundaries(graph);

      expect(res.findings.some((f) => f.type === "serialization-violation")).toBe(false);
      expect(res.returnViolations).toBe(0);
    });

    it("[29e87e4da896d3bd] dubinc/dub: app/api/og/analytics/route.tsx#L121 GET returning ImageResponse is not flagged", async () => {
      const code = `
        import { ImageResponse } from "next/og";
        export async function GET(req: Request) {
          return new ImageResponse(<div>Analytics</div>, { width: 1200, height: 630 });
        }
      `;
      const parsed = await parseModule(code, { filename: "app/api/og/analytics/route.tsx" });
      const graph = buildModuleGraph(new Map([["app/api/og/analytics/route.tsx", parsed]]));
      const res = analyzeReturnBoundaries(graph);

      expect(res.findings.some((f) => f.type === "serialization-violation")).toBe(false);
      expect(res.returnViolations).toBe(0);
    });

    it("[a3d2599493cc79a3] dubinc/dub: ui/modals/add-workspace-modal.tsx#L57 callback prop in Client Component is not flagged", async () => {
      const parentCode = `
        import { useRouter } from "next/navigation";
        import { useState } from "react";
        import { CreateWorkspaceForm } from "@/ui/modals/form";

        export function AddWorkspaceModal() {
          const router = useRouter();
          const [show, setShow] = useState(false);
          return (
            <CreateWorkspaceForm
              onSuccess={(slug) => {
                router.push("/" + slug);
              }}
            />
          );
        }
      `;
      const childCode = `
        "use client";
        export function CreateWorkspaceForm({ onSuccess }: { onSuccess: (slug: string) => void }) {
          return null;
        }
      `;
      const parentParsed = await parseModule(parentCode, { filename: "ui/modals/add-workspace-modal.tsx" });
      const childParsed = await parseModule(childCode, { filename: "ui/modals/form.tsx" });

      const graph = buildModuleGraph(
        new Map([
          ["ui/modals/add-workspace-modal.tsx", parentParsed],
          ["ui/modals/form.tsx", childParsed],
        ])
      );
      const res = analyzePropBoundaries(graph);

      expect(res.findings.some((f) => f.type === "serialization-violation")).toBe(false);
      expect(res.serializabilityViolations).toBe(0);
    });
  });

  describe("Unreachable Test Directory Resolved (1 Case)", () => {
    it("[3d7a805fc6c00f5c] dubinc/dub: playwright/api/fixtures.ts#L78 is excluded by production test filtering", () => {
      expect(isTestPath("playwright/api/fixtures.ts")).toBe(true);
    });
  });

  describe("Framework Artifacts Resolved (3 Cases)", () => {
    it("[69467cae947cf138 & ba9ad4d3f2e2fcec] dubinc/dub: lib/actions/partners/force-withdrawal.ts#L41 Upstash Redis is marked static-only", async () => {
      const code = `
        "use server";
        import { redis } from "@/lib/upstash";

        export async function forceWithdrawal(partnerId: string) {
          await redis.set("withdrawal:" + partnerId, "pending");
          return { success: true };
        }
      `;
      const parsed = await parseModule(code, { filename: "lib/actions/partners/force-withdrawal.ts" });
      const fnDecl = parsed.ast.body.find((b: any) => b.type === "ExportDeclaration");
      const compat = isActionSandboxCompatible(fnDecl, parsed.ast);

      expect(compat.compatible).toBe(false);
      expect(compat.classification).toBe("static-only");
      expect(compat.unsupportedDependency).toBe("redis");
    });

    it("[b03911739869bf77] dubinc/dub: lib/ai/generate-csv-mapping.ts#L8 @ai-sdk/rsc is marked static-only", async () => {
      const code = `
        "use server";
        import { createStreamableValue } from "@ai-sdk/rsc";

        export async function generateCsvMapping(data: any) {
          const stream = createStreamableValue("");
          return { output: stream.value };
        }
      `;
      const parsed = await parseModule(code, { filename: "lib/ai/generate-csv-mapping.ts" });
      const fnDecl = parsed.ast.body.find((b: any) => b.type === "ExportDeclaration");
      const compat = isActionSandboxCompatible(fnDecl, parsed.ast);

      expect(compat.compatible).toBe(false);
      expect(compat.classification).toBe("static-only");
      expect(compat.unsupportedDependency).toBe("createStreamableValue");
    });
  });

  describe("True Positives Preserved (2 Cases)", () => {
    it("[b6bbfce3dbe171b5 & 84e693a7f37f6a9b] vercel/commerce: components/cart/actions.ts#L54 updateItemQuantity STILL DETECTED", async () => {
      const sourceCode = `
        "use server";

        export async function updateItemQuantity(
          prevState: any,
          payload: {
            merchandiseId: string;
            quantity: number;
          }
        ) {
          const { merchandiseId, quantity } = payload;
          return { merchandiseId, quantity };
        }
      `;

      const engine = new AuditEngine({ runs: 10, seed: 42, silent: true });
      // Execute directly via parseModule + verification pipeline
      const parsed = await parseModule(sourceCode, { filename: "components/cart/actions.ts" });
      const fnDecl = parsed.ast.body.find((b: any) => b.type === "ExportDeclaration");

      // Verify it is sandbox-compatible
      const compat = isActionSandboxCompatible(fnDecl, parsed.ast);
      expect(compat.compatible).toBe(true);

      // Verify the action is discovered
      expect(parsed.actions.some((a) => a.name === "updateItemQuantity")).toBe(true);

      // Verify full dynamic execution detects runtime TypeError on empty input
      const synthesized = synthesizePayloads({ runs: 10, seed: 42 });
      const payloadsMap = new Map([["updateItemQuantity", synthesized.payloads]]);
      const runtimeRes = await verifyRuntimeActions(sourceCode, parsed, payloadsMap, { timeoutMs: 20 });
      expect(runtimeRes.failed).toBeGreaterThan(0);
      const failedExec = runtimeRes.executions.find((e) => e.status === "failed");
      expect(failedExec).toBeDefined();
      expect(failedExec?.error?.name).toBe("TypeError");
      expect(failedExec?.error?.message).toContain("Cannot destructure property 'merchandiseId'");
    });
  });

  describe("Phase 24 Expanded Regression Fixtures", () => {
    it("dubinc/dub: nested dynamic route handlers (avatar/categories) returning ImageResponse are not flagged", async () => {
      const code1 = `
        import { ImageResponse } from "next/og";
        export async function GET(req: Request) {
          return new ImageResponse(<div>Avatar</div>, { width: 100, height: 100 });
        }
      `;
      const parsed1 = await parseModule(code1, { filename: "app/api/og/avatar/[[...seed]]/route.tsx" });
      const graph1 = buildModuleGraph(new Map([["app/api/og/avatar/[[...seed]]/route.tsx", parsed1]]));
      const res1 = analyzeReturnBoundaries(graph1);
      expect(res1.returnViolations).toBe(0);

      const code2 = `
        import { ImageResponse } from "next/og";
        export async function GET(req: Request) {
          return new ImageResponse(<div>Category</div>, { width: 800, height: 400 });
        }
      `;
      const parsed2 = await parseModule(code2, { filename: "app/api/og/program/categories/route.tsx" });
      const graph2 = buildModuleGraph(new Map([["app/api/og/program/categories/route.tsx", parsed2]]));
      const res2 = analyzeReturnBoundaries(graph2);
      expect(res2.returnViolations).toBe(0);
    });

    it("dubinc/dub: invite-workspace-user-modal.tsx & utm-modal.tsx client modals passing callback props are not flagged", async () => {
      const modalCode = `
        import { useRouter, useSearchParams } from "next/navigation";
        import { useState } from "react";
        import { InviteTeammatesForm } from "@/ui/modals/form";

        export function InviteWorkspaceUserModal() {
          const router = useRouter();
          const [isOpen, setIsOpen] = useState(false);
          return (
            <InviteTeammatesForm
              onSuccess={() => {
                router.refresh();
              }}
            />
          );
        }
      `;
      const childCode = `
        "use client";
        export function InviteTeammatesForm({ onSuccess }: { onSuccess: () => void }) {
          return null;
        }
      `;

      const parentParsed = await parseModule(modalCode, { filename: "ui/modals/invite-workspace-user-modal.tsx" });
      const childParsed = await parseModule(childCode, { filename: "ui/modals/form.tsx" });

      const graph = buildModuleGraph(
        new Map([
          ["ui/modals/invite-workspace-user-modal.tsx", parentParsed],
          ["ui/modals/form.tsx", childParsed],
        ])
      );
      const res = analyzePropBoundaries(graph);
      expect(res.serializabilityViolations).toBe(0);
    });

    it("dubinc/dub: lib/ai/generate-filters.ts calling createStreamableValue is marked static-only", async () => {
      const code = `
        "use server";
        import { createStreamableValue } from "@ai-sdk/rsc";

        export async function generateFilters(prompt: string) {
          const stream = createStreamableValue();
          return { stream: stream.value };
        }
      `;
      const parsed = await parseModule(code, { filename: "lib/ai/generate-filters.ts" });
      const fnDecl = parsed.ast.body.find((b: any) => b.type === "ExportDeclaration");
      const compat = isActionSandboxCompatible(fnDecl, parsed.ast);

      expect(compat.compatible).toBe(false);
      expect(compat.classification).toBe("static-only");
      expect(compat.unsupportedDependency).toBe("createStreamableValue");
    });
  });
});
