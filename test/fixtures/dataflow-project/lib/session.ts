import { getSecret, getSafeConfig } from "./auth";

export function createSession() {
  const secret = getSecret();
  const safe = getSafeConfig();
  return {
    secret,
    safe,
  };
}

export function wrapToken(token: string) {
  return { bearer: token };
}
