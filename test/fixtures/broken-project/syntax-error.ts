"use server";

export async function broken( {
  // Syntax error: missing parameter list / unmatched braces
  return 42;
}
