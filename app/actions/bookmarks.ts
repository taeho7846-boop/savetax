"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getBookmarks(userId: number) {
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      OR: [
        { scope: "shared" },
        { scope: "personal", userId },
      ],
    },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });

  return bookmarks;
}

export async function createBookmark(formData: FormData) {
  const session = await requireAuth();

  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const keywords = formData.get("keywords") as string;
  const scope = formData.get("scope") as string;

  if (!name || !url) return;

  const isAdmin = session.role === "admin" || session.role === "owner";
  const finalScope = scope === "shared" && isAdmin ? "shared" : "personal";

  await prisma.bookmark.create({
    data: {
      name,
      url: url.startsWith("http") ? url : `https://${url}`,
      keywords: keywords || null,
      scope: finalScope,
      userId: finalScope === "personal" ? session.id : null,
      createdBy: session.id,
    },
  });

  revalidatePath("/settings");
}

export async function updateBookmark(formData: FormData) {
  const session = await requireAuth();

  const id = parseInt(formData.get("id") as string);
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const keywords = formData.get("keywords") as string;

  if (!id || !name || !url) return;

  const bookmark = await prisma.bookmark.findUnique({ where: { id } });
  if (!bookmark) return;

  // 공통 북마크는 관리자만, 개인 북마크는 본인만
  const isAdmin = session.role === "admin" || session.role === "owner";
  if (bookmark.scope === "shared" && !isAdmin) return;
  if (bookmark.scope === "personal" && bookmark.userId !== session.id) return;

  await prisma.bookmark.update({
    where: { id },
    data: {
      name,
      url: url.startsWith("http") ? url : `https://${url}`,
      keywords: keywords || null,
    },
  });

  revalidatePath("/settings");
}

export async function deleteBookmark(id: number) {
  const session = await requireAuth();

  const bookmark = await prisma.bookmark.findUnique({ where: { id } });
  if (!bookmark) return;

  const isAdmin = session.role === "admin" || session.role === "owner";
  if (bookmark.scope === "shared" && !isAdmin) return;
  if (bookmark.scope === "personal" && bookmark.userId !== session.id) return;

  await prisma.bookmark.delete({ where: { id } });

  revalidatePath("/settings");
}
