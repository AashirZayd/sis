import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import {
  classifyBoundary,
  isRouteHandlerPath,
  isRouteHandlerMethod,
} from "../src/boundary/classifier.js";
import {
  isTestDirectory,
  isTestPath,
  shouldIgnoreDirectory,
  isSupportedSourceFile,
} from "../src/discovery/filters.js";
import { isActionSandboxCompatible } from "../src/runtime/compatibility.js";
import { buildModuleGraph } from "../src/dataflow/graph.js";
import { analyzePropBoundaries } from "../src/boundary/props.js";
import { analyzeReturnBoundaries } from "../src/boundary/returns.js";

describe("Phase 23: Boundary Precision & Filter Hardening", () => {
  describe("1. Route Handler Semantics", () => {
    it("identifies Next.js App Router route files and HTTP methods", () => {
      expect(isRouteHandlerPath("app/api/webhooks/stripe/route.ts")).toBe(true);
      expect(isRouteHandlerPath("app/api/og/analytics/route.tsx")).toBe(true);
      expect(isRouteHandlerPath("src/app/auth/[...nextauth]/route.js")).toBe(true);
      expect(isRouteHandlerPath("components/cart/actions.ts")).toBe(false);
      expect(isRouteHandlerPath("app/dashboard/page.tsx")).toBe(false);

      expect(isRouteHandlerMethod("GET")).toBe(true);
      expect(isRouteHandlerMethod("POST")).toBe(true);
      expect(isRouteHandlerMethod("DELETE")).toBe(true);
      expect(isRouteHandlerMethod("updateItemQuantity")).toBe(false);
    });

    it("classifies App Router route.ts with exported POST as route-handler with HIGH confidence", async () => {
      const code = `
        import { NextResponse } from "next/server";

        export async function POST(req: Request) {
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }
      `;
      const parsed = await parseModule(code, { filename: "app/api/webhooks/stripe/route.ts" });
      const classification = classifyBoundary("app/api/webhooks/stripe/route.ts", parsed.ast);

      expect(classification.kind).toBe("route-handler");
      expect(classification.confidence).toBe("HIGH");
      expect(classification.evidence).toContain("export:POST");
      expect(parsed.actions.length).toBe(0); // HTTP verbs must NOT be registered as candidate Server Actions
      expect(parsed.boundaries.some((b) => b.kind === "route-handler")).toBe(true);
    });

    it("does not flag Response or ImageResponse returns in Route Handlers as React Flight violations", async () => {
      const routeCode = `
        export async function GET() {
          return new Response("OK", { status: 200 });
        }
      `;
      const parsed = await parseModule(routeCode, { filename: "app/api/health/route.ts" });
      const modulesMap = new Map([["app/api/health/route.ts", parsed]]);
      const graph = buildModuleGraph(modulesMap);

      const returnRes = analyzeReturnBoundaries(graph);
      expect(returnRes.findings.length).toBe(0);
      expect(returnRes.returnViolations).toBe(0);
    });
  });

  describe("2. Non-Production Directory & Test Filtering", () => {
    it("detects standard test directories and test file extensions", () => {
      expect(isTestDirectory("playwright")).toBe(true);
      expect(isTestDirectory("e2e")).toBe(true);
      expect(isTestDirectory("cypress")).toBe(true);
      expect(isTestDirectory("__tests__")).toBe(true);
      expect(isTestDirectory("tests")).toBe(true);
      expect(isTestDirectory("test")).toBe(true);
      expect(isTestDirectory("app")).toBe(false);
      expect(isTestDirectory("components")).toBe(false);

      expect(isTestPath("playwright/api/fixtures.ts")).toBe(true);
      expect(isTestPath("e2e/login.spec.ts")).toBe(true);
      expect(isTestPath("components/__tests__/button.test.tsx")).toBe(true);
      expect(isTestPath("app/dashboard/page.tsx")).toBe(false);
      expect(isTestPath("lib/actions/cart.ts")).toBe(false);
    });

    it("handles OS path separators consistently across Windows and POSIX", () => {
      const winPath = "playwright\\api\\fixtures.ts";
      const posixPath = "playwright/api/fixtures.ts";

      expect(isTestPath(winPath)).toBe(true);
      expect(isTestPath(posixPath)).toBe(true);
      expect(shouldIgnoreDirectory("playwright", [], true)).toBe(true);
      expect(shouldIgnoreDirectory("playwright", [], false)).toBe(false);
    });

    it("preserves production application code while excluding test infrastructure", () => {
      expect(isSupportedSourceFile("button.tsx", undefined, true)).toBe(true);
      expect(isSupportedSourceFile("button.test.tsx", undefined, true)).toBe(false);
      expect(isSupportedSourceFile("button.spec.ts", undefined, true)).toBe(false);
      expect(isSupportedSourceFile("button.test.tsx", undefined, false)).toBe(true);
    });
  });

  describe("3. Client Component Hook Inference", () => {
    it("infers Client Component from client hook usage when 'use client' is missing", async () => {
      const code = `
        import { useState, useRouter } from "next/navigation";

        export function AddWorkspaceModal() {
          const router = useRouter();
          const [open, setOpen] = useState(false);
          return null;
        }
      `;
      const parsed = await parseModule(code, { filename: "ui/modals/add-workspace-modal.tsx" });
      const classification = classifyBoundary("ui/modals/add-workspace-modal.tsx", parsed.ast);

      expect(classification.kind).toBe("client-component");
      expect(classification.confidence).toBe("MEDIUM");
      expect(classification.evidence).toContain("hook:useRouter");
      expect(classification.evidence).toContain("hook:useState");
    });

    it("does not flag callback props between two Client Components as Flight serialization violations", async () => {
      const parentCode = `
        import { useRouter } from "next/navigation";
        import { CreateWorkspaceForm } from "./form";

        export function AddWorkspaceModal() {
          const router = useRouter();
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

      const propRes = analyzePropBoundaries(graph);
      expect(propRes.findings.length).toBe(0);
      expect(propRes.serializabilityViolations).toBe(0);
    });
  });

  describe("4. External Dependency Compatibility Gate", () => {
    it("classifies actions importing external Upstash Redis as static-only", async () => {
      const code = `
        "use server";
        import { redis } from "@/lib/upstash";

        export async function forceWithdrawal(partnerId: string) {
          await redis.set("withdrawal:" + partnerId, "pending");
          return { success: true };
        }
      `;
      const parsed = await parseModule(code, { filename: "lib/actions/partners/force-withdrawal.ts" });
      const action = parsed.actions.find((a) => a.name === "forceWithdrawal");
      expect(action).toBeDefined();

      const compat = isActionSandboxCompatible(parsed.ast.body[1], parsed.ast);
      expect(compat.compatible).toBe(false);
      expect(compat.classification).toBe("static-only");
      expect(compat.unsupportedDependency).toBe("redis");
    });

    it("classifies actions importing @ai-sdk/rsc as static-only", async () => {
      const code = `
        "use server";
        import { createStreamableValue } from "@ai-sdk/rsc";

        export async function generateCsvMapping(data: any) {
          const stream = createStreamableValue("");
          return { output: stream.value };
        }
      `;
      const parsed = await parseModule(code, { filename: "lib/ai/generate-csv-mapping.ts" });
      const compat = isActionSandboxCompatible(parsed.ast.body[1], parsed.ast);

      expect(compat.compatible).toBe(false);
      expect(compat.classification).toBe("static-only");
      expect(compat.unsupportedDependency).toBe("createStreamableValue");
    });

    it("allows pure self-contained actions with input destructuring to remain sandbox-compatible", async () => {
      const code = `
        "use server";

        export async function updateItemQuantity(
          prevState: any,
          payload: { merchandiseId: string; quantity: number }
        ) {
          const { merchandiseId, quantity } = payload;
          return { merchandiseId, quantity };
        }
      `;
      const parsed = await parseModule(code, { filename: "components/cart/actions.ts" });
      const fnDecl = parsed.ast.body.find((b: any) => b.type === "ExportDeclaration");

      const compat = isActionSandboxCompatible(fnDecl, parsed.ast);
      expect(compat.compatible).toBe(true);
      expect(compat.classification).toBe("sandbox-compatible");
    });
  });
});
