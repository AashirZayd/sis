export async function inlineServerAction(theme: string) {
  "use server";
  return { theme, updated: true };
}

export const inlineArrowAction = async (value: number) => {
  "use server";
  return { doubled: value * 2 };
};

export async function leakyInlineAction() {
  "use server";
  return process.env.AUTH_SECRET;
}

export async function invalidReturnInlineAction() {
  "use server";
  return () => "not-serializable";
}
