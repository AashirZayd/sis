"use server";

export async function processNestedConfig(payload: any) {
  if (typeof payload.user.profile.settings.theme.primary !== "string") {
    throw new TypeError("Invalid theme primary color");
  }
  return { success: true };
}
