"use server";

export async function safeServerAction() {
  const dbKey = process.env.DATABASE_PASSWORD;
  return { connected: !!dbKey };
}
