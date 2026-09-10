import { getAuthConfig } from "./config.js";

export function createSessionToken() {
  const config = getAuthConfig();
  const raw = config.apiKey;
  return { token: raw, createdAt: Date.now() };
}
