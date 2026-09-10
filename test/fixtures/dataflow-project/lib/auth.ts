export function getSecret() {
  return process.env.AUTH_SECRET;
}

export function getSafeConfig() {
  return "public-config-v1";
}
