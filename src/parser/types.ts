import type { Module } from "@swc/core";
import type { Boundary, ServerAction, SourceLocation } from "../core/types.js";
import type { SourceMapLocator } from "./location.js";

export type DirectiveKind = "use-client" | "use-server";

export interface Directive {
  kind: DirectiveKind;
  location: SourceLocation;
}

export interface ParseOptions {
  filename: string;
  syntax?: "typescript" | "ecmascript";
  tsx?: boolean;
}

export interface ParsedModule {
  file: string;
  directives: Directive[];
  boundaries: Boundary[];
  actions: ServerAction[];
  ast: Module;
  locator: SourceMapLocator;
}
