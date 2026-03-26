import { cookies } from "next/headers";
import { prisma } from "./prisma";

export async function getSession() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("session_user_id")?.value;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId), isActive: true },
    select: { id: true, username: true, name: true, role: true },
  });

  return user;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
