"use server";

export async function getUserFromDb(id: string) {
  return await prisma.user.findUnique({ where: { id } });
}

export async function getSessionCookie() {
  const cookieStore = cookies();
  return cookieStore.get("session_id");
}

export async function getClientIp() {
  const headersList = headers();
  return headersList.get("x-forwarded-for");
}

export async function logoutUser() {
  redirect("/login");
}

export async function getArticle(slug: string) {
  if (!slug) notFound();
  return { slug };
}

export async function refreshFeed() {
  revalidatePath("/feed");
  return { revalidated: true };
}

export async function invalidateCache() {
  revalidateTag("user-cache");
  return { tagged: true };
}

export async function computeHash(val: string) {
  return { length: val.length };
}
