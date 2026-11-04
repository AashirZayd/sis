"use server";

// Phase 2 V-02: dynamic import() fails inside the isolate with "Not supported".
export async function loadRegistry(kind: string) {
  const mod = await import("./registry");
  return mod;
}
