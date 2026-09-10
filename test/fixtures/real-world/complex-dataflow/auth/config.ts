export const authConfig = {
  apiKey: process.env.AUTH_SECRET,
  serviceName: "auth-service",
};

export function getAuthConfig() {
  return {
    apiKey: process.env.AUTH_SECRET,
    serviceName: "auth-service",
  };
}

export const { apiKey: extractedKey } = authConfig;

