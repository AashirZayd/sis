import { createSessionToken } from "./session.js";

export function getAuthenticatedUser(includeToken: boolean) {
  const session = createSessionToken();
  return { id: "user-1", authPayload: session.token };
}
