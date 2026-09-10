"use server";
export async function ping(msg: string) {
  if (!msg) throw new Error("Empty ping");
  return { reply: "pong: " + msg };
}
