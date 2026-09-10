"use server";

interface ComplexInput {
  user: { id: number; name: string };
  metadata: { tags: string[]; active?: boolean };
}

export async function updateComplexUser({ user: { id, name }, metadata }: ComplexInput) {
  return { id: id.toFixed(0), name: name.toUpperCase(), count: metadata.tags.length };
}

export async function updateWithDefaults({ id = 0, name = "anonymous", flags = [true] }: { id?: number; name?: string; flags?: boolean[] }) {
  return { id: id + 1, name: name.trim(), firstFlag: flags[0] };
}

export async function processTuple([first, second, ...rest]: [string, number, ...boolean[]]) {
  return { first: first.toLowerCase(), second: second.toFixed(2), restLen: rest.length };
}
