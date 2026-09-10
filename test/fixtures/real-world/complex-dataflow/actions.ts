"use server";

import { getAuthenticatedUser } from "./auth/user.js";

export async function getUserProfile(withAuth: boolean) {
  const user = getAuthenticatedUser(withAuth);
  return user.authPayload;
}
