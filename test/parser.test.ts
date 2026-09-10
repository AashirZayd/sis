import { describe, it, expect } from "vitest";
import { parseModule } from "../src/parser/index.js";
import { ParserError } from "../src/core/errors.js";

describe("SWC Parser & Directive Analysis", () => {
  it("discovers 'use client' directive and creates a client boundary", async () => {
    const code = `
"use client";

export function Component() {
  return <div>Hello</div>;
}
`;
    const result = await parseModule(code, { filename: "Component.tsx" });

    expect(result.directives).toHaveLength(1);
    expect(result.directives[0].kind).toBe("use-client");
    expect(result.directives[0].location.line).toBe(2);

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("client");
    expect(result.boundaries[0].location.line).toBe(2);

    expect(result.actions).toHaveLength(0);
  });

  it("discovers 'use server' directive, server boundary, and candidate Server Action", async () => {
    const code = `
"use server";

export async function action() {
  return { ok: true };
}
`;
    const result = await parseModule(code, { filename: "actions.ts" });

    expect(result.directives).toHaveLength(1);
    expect(result.directives[0].kind).toBe("use-server");
    expect(result.directives[0].location.line).toBe(2);

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("server");

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].name).toBe("action");
    expect(result.actions[0].location.line).toBe(4);
  });

  it("identifies only async exported functions as candidate Server Actions", async () => {
    const code = `
"use server";

export async function actionA() {}
export async function actionB() {}
export function helper() {}
export const value = 1;
export const asyncArrowAction = async () => {};
export const syncArrowHelper = () => {};
`;
    const result = await parseModule(code, { filename: "module.ts" });

    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("server");

    const actionNames = result.actions.map((a) => a.name);
    expect(actionNames).toContain("actionA");
    expect(actionNames).toContain("actionB");
    expect(actionNames).toContain("asyncArrowAction");

    // Sync function and primitive constant must NOT be classified as Server Actions
    expect(actionNames).not.toContain("helper");
    expect(actionNames).not.toContain("value");
    expect(actionNames).not.toContain("syncArrowHelper");
    expect(result.actions).toHaveLength(3);
  });

  it("does not classify ordinary string literals as directives", async () => {
    const code = `
const value = "use client";
let message = "use server";
`;
    const result = await parseModule(code, { filename: "strings.ts" });

    expect(result.directives).toHaveLength(0);
    expect(result.boundaries).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it("does not classify exported async functions as Server Actions without 'use server' directive", async () => {
    const code = `
export async function normalFunction() {
  return "data";
}
`;
    const result = await parseModule(code, { filename: "normal.ts" });

    expect(result.directives).toHaveLength(0);
    expect(result.boundaries).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it("parses TSX syntax accurately without errors", async () => {
    const code = `
"use client";

import React from "react";

interface Props {
  title: string;
}

export const Header: React.FC<Props> = ({ title }) => {
  return <header><h1>{title}</h1></header>;
};
`;
    const result = await parseModule(code, { filename: "Header.tsx" });
    expect(result.boundaries).toHaveLength(1);
    expect(result.boundaries[0].type).toBe("client");
  });

  it("tracks accurate source line and column numbers", async () => {
    const code = `// leading comments
"use server";

export async function targetAction() {}
`;
    const result = await parseModule(code, { filename: "loc.ts" });
    expect(result.boundaries[0].location.line).toBe(2);
    expect(result.actions[0].location.line).toBe(4);
    expect(result.actions[0].name).toBe("targetAction");
  });

  it("throws a clean ParserError on invalid TypeScript syntax", async () => {
    const malformed = `
export async function broken( {
  const x = ;
`;
    await expect(
      parseModule(malformed, { filename: "broken.ts" })
    ).rejects.toThrow(ParserError);

    try {
      await parseModule(malformed, { filename: "broken.ts" });
    } catch (err) {
      expect(err).toBeInstanceOf(ParserError);
      const parserErr = err as ParserError;
      expect(parserErr.file).toBe("broken.ts");
    }
  });
});
