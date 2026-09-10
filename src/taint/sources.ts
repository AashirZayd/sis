import type { Expression, MemberExpression } from "@swc/core";
import type { SourceMapLocator } from "../parser/location.js";
import type { TaintSource } from "./types.js";

/**
 * Evaluates whether an environment variable name conforms to conservative secret patterns.
 * Explicitly rejects public (NEXT_PUBLIC_*) configuration.
 */
export function isSensitiveEnvVarName(name: string): boolean {
  if (name.startsWith("NEXT_PUBLIC_")) {
    return false;
  }

  const upper = name.toUpperCase();

  // Known exact secret names
  if (
    upper === "DATABASE_URL" ||
    upper === "AUTH_SECRET" ||
    upper === "SESSION_SECRET"
  ) {
    return true;
  }

  // Common sensitive prefixes
  if (upper.startsWith("PRIVATE_") || upper.startsWith("SECRET_")) {
    return true;
  }

  // Conservative sensitive suffixes per specification
  const sensitiveSuffixes = [
    "_KEY",
    "_SECRET",
    "_TOKEN",
    "_PASSWORD",
    "_PRIVATE_KEY",
    "_API_KEY",
  ];

  return sensitiveSuffixes.some((suffix) => upper.endsWith(suffix));
}

/**
 * Inspects an SWC Expression to determine if it represents a sensitive process.env access.
 * e.g. process.env.PRIVATE_API_KEY or process.env["PRIVATE_API_KEY"].
 * Dynamic access (e.g. process.env[dynamicKey]) is treated as unknown/untainted.
 */
export function extractSensitiveEnvSource(
  node: Expression,
  locator: SourceMapLocator
): TaintSource | null {
  if (node.type !== "MemberExpression") {
    return null;
  }

  const member = node as MemberExpression;

  // Verify object is process.env
  if (member.object.type !== "MemberExpression") {
    return null;
  }

  const innerMember = member.object as MemberExpression;
  if (
    innerMember.object.type !== "Identifier" ||
    innerMember.object.value !== "process"
  ) {
    return null;
  }

  if (
    innerMember.property.type !== "Identifier" ||
    innerMember.property.value !== "env"
  ) {
    return null;
  }

  // Extract property name
  let envVarName: string | null = null;

  if (member.property.type === "Identifier") {
    // process.env.SECRET
    envVarName = member.property.value;
  } else {
    // Computed property access: process.env["SECRET"]
    const propAny = member.property as any;
    if (propAny.type === "Computed" && propAny.expression?.type === "StringLiteral") {
      envVarName = propAny.expression.value;
    } else {
      // Dynamic access like process.env[key] - do not guess
      return null;
    }
  }

  if (!envVarName || !isSensitiveEnvVarName(envVarName)) {
    return null;
  }

  return {
    kind: "secret",
    name: envVarName,
    rawExpression: `process.env.${envVarName}`,
    location: locator.getLocation(node.span.start),
  };
}
