"use server";
export async function complexObjectFuzz(payload: {
  user: {
    profile: {
      tags: string[];
      flags: { active: boolean; rank: number };
    };
    id: string;
  };
  options?: { strict?: boolean };
}) {
  const { user: { profile: { tags, flags }, id }, options } = payload;
  if (!id) throw new Error("Missing ID");
  return { tagCount: tags.length, rank: flags.rank, strict: options?.strict };
}

export async function heavyArrayFuzz(matrix: number[][]) {
  let sum = 0;
  for (const row of matrix) {
    for (const cell of row) {
      sum += cell.toFixed(2).length;
    }
  }
  return { sum };
}
