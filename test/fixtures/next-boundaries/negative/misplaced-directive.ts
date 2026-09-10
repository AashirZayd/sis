const priorStatement = 42;
"use server";

export async function invalidPrologueAction() {
  return "not-an-action";
}

export function invalidInlineAction() {
  const foo = 1;
  "use server";
  return foo;
}
