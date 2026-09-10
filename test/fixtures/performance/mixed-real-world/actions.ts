"use server";
export async function safeTransfer(amount: number) {
  if (amount <= 0) throw new Error("Invalid transfer amount");
  return { status: "success", amount };
}

export async function frameworkDependent() {
  const c = cookies();
  return { session: c.get("token") };
}
