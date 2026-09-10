import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import {
  analyzeTaint,
  isSensitiveEnvVarName,
} from "../src/taint/index.js";

describe("Taint Analysis - Sources & Classification", () => {
  it("detects sensitive environment variable naming patterns", () => {
    expect(isSensitiveEnvVarName("PRIVATE_API_KEY")).toBe(true);
    expect(isSensitiveEnvVarName("STRIPE_SECRET_KEY")).toBe(true);
    expect(isSensitiveEnvVarName("GITHUB_TOKEN")).toBe(true);
    expect(isSensitiveEnvVarName("DATABASE_PASSWORD")).toBe(true);
    expect(isSensitiveEnvVarName("DATABASE_URL")).toBe(true);
    expect(isSensitiveEnvVarName("AUTH_SECRET")).toBe(true);
    expect(isSensitiveEnvVarName("SESSION_SECRET")).toBe(true);
    expect(isSensitiveEnvVarName("MY_SERVICE_KEY")).toBe(true);
  });

  it("strictly excludes public Next.js environment variables (NEXT_PUBLIC_*)", () => {
    expect(isSensitiveEnvVarName("NEXT_PUBLIC_API_URL")).toBe(false);
    expect(isSensitiveEnvVarName("NEXT_PUBLIC_KEY")).toBe(false);
    expect(isSensitiveEnvVarName("NEXT_PUBLIC_SECRET_TOKEN")).toBe(false);
    expect(isSensitiveEnvVarName("NEXT_PUBLIC_ANALYTICS_ID")).toBe(false);
  });

  it("strictly excludes non-sensitive generic environment variables", () => {
    expect(isSensitiveEnvVarName("NODE_ENV")).toBe(false);
    expect(isSensitiveEnvVarName("PORT")).toBe(false);
    expect(isSensitiveEnvVarName("HOSTNAME")).toBe(false);
  });
});

describe("Taint Analysis - Data-Flow & Sinks", () => {
  it("identifies direct client JSX leaks", async () => {
    const code = `
"use client";
export function Comp() {
  return <div>{process.env.PRIVATE_API_KEY}</div>;
}
`;
    const parsed = await parseModule(code, { filename: "direct.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "direct.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("taint-violation");
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].message).toContain("PRIVATE_API_KEY");
    expect(result.findings[0].trace).toEqual([
      "process.env.PRIVATE_API_KEY",
      "JSX expression",
    ]);
  });

  it("tracks variable assignment propagation", async () => {
    const code = `
"use client";
const secret = process.env.STRIPE_SECRET_KEY;
export function Comp() {
  return <span>{secret}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "var.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "var.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toEqual([
      "process.env.STRIPE_SECRET_KEY",
      "secret",
      "JSX expression",
    ]);
  });

  it("tracks multi-hop variable-to-variable propagation", async () => {
    const code = `
"use client";
const a = process.env.API_TOKEN;
const b = a;
const c = b;
export function Comp() {
  return <span>{c}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "multi.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "multi.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toEqual([
      "process.env.API_TOKEN",
      "a",
      "b",
      "c",
      "JSX expression",
    ]);
  });

  it("tracks object property propagation", async () => {
    const code = `
"use client";
const auth = {
  token: process.env.AUTH_SECRET,
};
export function Comp() {
  return <span>{auth.token}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "obj.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "obj.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toContain("auth.token");
    expect(result.findings[0].trace).toContain("JSX expression");
  });

  it("tracks nested object property propagation", async () => {
    const code = `
"use client";
const config = {
  service: {
    apiKey: process.env.PRIVATE_API_KEY,
  },
};
export function Comp() {
  return <span>{config.service.apiKey}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "nested.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "nested.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toContain("config.service.apiKey");
  });

  it("tracks array element propagation", async () => {
    const code = `
"use client";
const keys = [process.env.JWT_SECRET];
export function Comp() {
  return <span>{keys}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "arr.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "arr.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toContain("array-element");
  });

  it("tracks template literal interpolation propagation", async () => {
    const code = `
"use client";
const header = \`Bearer \${process.env.GITHUB_TOKEN}\`;
export function Comp() {
  return <span>{header}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "template.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "template.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(1);
    expect(result.findings[0].trace).toContain("template-literal");
    expect(result.findings[0].trace).toContain("header");
  });

  it("does not report client violations for server-only secret usage", async () => {
    const code = `
"use server";
export async function action() {
  const key = process.env.PRIVATE_API_KEY;
  return { ok: !!key };
}
`;
    const parsed = await parseModule(code, { filename: "server.ts" });
    const result = analyzeTaint(parsed.ast, { file: "server.ts", isClientBoundary: false }, parsed.locator);

    // Sensitive source was observed, but 0 violations because it is not a client boundary
    expect(result.taintSourcesFound).toBe(1);
    expect(result.taintViolations).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("treats dynamic property access as unknown without guessing", async () => {
    const code = `
"use client";
const prop = "PRIVATE_API_KEY";
const value = process.env[prop];
export function Comp() {
  return <span>{value}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "dynamic.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "dynamic.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintViolations).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it("does not trigger on string literals containing process.env", async () => {
    const code = `
"use client";
const text = "process.env.PRIVATE_API_KEY";
export function Comp() {
  return <span>{text}</span>;
}
`;
    const parsed = await parseModule(code, { filename: "string.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "string.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintSourcesFound).toBe(0);
    expect(result.taintViolations).toBe(0);
  });

  it("does not trigger on comments containing process.env", async () => {
    const code = `
"use client";
// TODO: check process.env.PRIVATE_API_KEY
/* process.env.DATABASE_PASSWORD */
export function Comp() {
  return <span>Safe</span>;
}
`;
    const parsed = await parseModule(code, { filename: "comment.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "comment.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.taintSourcesFound).toBe(0);
    expect(result.taintViolations).toBe(0);
  });

  it("reports accurate source locations on findings", async () => {
    const code = `
"use client";

export function Comp() {
  return <div>{process.env.PRIVATE_API_KEY}</div>;
}
`;
    const parsed = await parseModule(code, { filename: "loc.tsx" });
    const result = analyzeTaint(parsed.ast, { file: "loc.tsx", isClientBoundary: true }, parsed.locator);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].location?.file).toBe("loc.tsx");
    expect(result.findings[0].location?.line).toBe(5);
  });
});
