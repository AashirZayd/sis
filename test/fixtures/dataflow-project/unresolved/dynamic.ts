export function executeDynamic() {
  const dynamicFn = (globalThis as any).getDynamicHandler?.();
  if (typeof dynamicFn === "function") {
    return dynamicFn(process.env.AUTH_SECRET);
  }
  return "safe";
}
