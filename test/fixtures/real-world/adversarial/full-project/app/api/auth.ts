export function getAuthToken() {
  return { token: process.env.DATABASE_PRIVATE_KEY };
}
