"use server";

export async function hangingAction(_payload: unknown) {
  while (true) {}
}
