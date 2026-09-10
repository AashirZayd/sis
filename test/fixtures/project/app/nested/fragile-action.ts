"use server";

export async function riskyCompute(payload: any) {
  return payload.config.options.count * 2;
}
