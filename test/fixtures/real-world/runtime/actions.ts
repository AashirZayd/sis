"use server";

export async function throwAction(payload: { code: number }) {
  if (payload.code > 100) {
    throw new RangeError("Code out of range: must be <= 100");
  }
  return { ok: true, code: payload.code };
}

export async function typeErrorAction(payload: { amount: number }) {
  return payload.amount.toFixed(2);
}

export async function infiniteLoopAction(payload: { loop: boolean }) {
  if (payload.loop) {
    while (true) {}
  }
  return { ok: true };
}

export async function recursiveAction(payload: { depth: number }) {
  function recurse(n: number): number {
    return recurse(n + 1);
  }
  if (payload.depth > 0) {
    return recurse(payload.depth);
  }
  return { depth: 0 };
}
