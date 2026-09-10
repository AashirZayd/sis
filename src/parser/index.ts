import * as swc from "@swc/core";
import { ParserError } from "../core/errors.js";
import { SourceMapLocator } from "./location.js";
import { BoundaryVisitor } from "./boundary-visitor.js";
import type { ParseOptions, ParsedModule } from "./types.js";

export * from "./types.js";
export * from "./location.js";
export * from "./boundary-visitor.js";

/**
 * Parses TypeScript/TSX source code using @swc/core AST analysis.
 * Identifies Next.js "use client" and "use server" boundaries and candidate Server Actions.
 */
export async function parseModule(
  source: string,
  options: ParseOptions
): Promise<ParsedModule> {
  const isTsx = options.filename.endsWith(".tsx");
  const isJsx = options.filename.endsWith(".jsx");
  const isTs = options.filename.endsWith(".ts") || isTsx;

  const parseConfig: swc.ParseOptions = isTs
    ? {
        syntax: "typescript",
        tsx: isTsx,
        target: "es2022",
      }
    : {
        syntax: "ecmascript",
        jsx: isJsx,
        target: "es2022",
      };

  let ast: swc.Module;
  try {
    ast = await swc.parse(source, parseConfig);
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err);

    // Extract line/column from SWC diagnostic message if present:
    // e.g. " 1 | const x = ;"
    //      "   :           ^"
    const lineMatch = rawMessage.match(/\n\s*(\d+)\s*\|/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

    // Clean first line message
    const firstLine = rawMessage.split("\n")[0]?.trim() || "Syntax error";
    const cleanMessage = firstLine.replace(/^x\s+/, "");

    throw new ParserError(options.filename, cleanMessage, {
      line,
      detail: rawMessage,
    });
  }

  const locator = new SourceMapLocator(options.filename, source);
  const visitor = new BoundaryVisitor(options.filename, locator);

  return visitor.visit(ast);
}
