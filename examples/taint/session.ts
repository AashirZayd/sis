export function getSessionSecret() {
  return process.env.AUTH_SECRET;
}

export function getUserProfile() {
  return {
    username: "alice",
    secretKey: getSessionSecret(),
  };
}
