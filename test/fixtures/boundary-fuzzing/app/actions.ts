"use server";

export async function createUser(input: { id: number; name: string }) {
  if (Number.isNaN(input.id)) {
    throw new TypeError("User ID cannot be NaN");
  }
  if (!input.name || input.name.length === 0) {
    throw new Error("Name is required");
  }
  return { success: true, user: input };
}

export async function updateProfile(data: { profile: { age: number; displayName: string } }) {
  if (data.profile.age < 0) {
    throw new RangeError("Age cannot be negative");
  }
  return { updated: true, age: data.profile.age };
}

export async function calculateTotal(amount: number) {
  return amount.toFixed(2);
}

export async function safeAction(params: { tag: string }) {
  return { tag: params.tag || "default" };
}

export async function databaseAction(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user;
}
