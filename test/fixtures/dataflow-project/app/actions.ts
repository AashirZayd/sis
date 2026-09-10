"use server";

import { createSession } from "../lib/session";

export async function getProfile() {
  const session = createSession();
  return session;
}
