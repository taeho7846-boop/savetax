"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getNotices(category?: string) {
  await requireAuth();
  return prisma.notice.findMany({
    where: category ? { category } : undefined,
    include: { author: { select: { name: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export async function createNotice(formData: FormData) {
  const session = await requireAuth();
  await prisma.notice.create({
    data: {
      authorId: session.id,
      category: formData.get("category") as string,
      subCategory: (formData.get("subCategory") as string) || null,
      title: (formData.get("title") as string).trim(),
      content: (formData.get("content") as string).trim(),
    },
  });
  revalidatePath("/dashboard");
}

export async function updateNotice(id: number, formData: FormData) {
  const session = await requireAuth();
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice || (notice.authorId !== session.id && session.role !== "owner"))
    throw new Error("수정 권한이 없습니다.");

  await prisma.notice.update({
    where: { id },
    data: {
      category: formData.get("category") as string,
      subCategory: (formData.get("subCategory") as string) || null,
      title: (formData.get("title") as string).trim(),
      content: (formData.get("content") as string).trim(),
    },
  });
  revalidatePath("/dashboard");
}

export async function deleteNotice(id: number) {
  const session = await requireAuth();
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice || (notice.authorId !== session.id && session.role !== "owner"))
    throw new Error("삭제 권한이 없습니다.");

  await prisma.notice.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function togglePin(id: number) {
  const session = await requireAuth();
  if (session.role !== "owner" && session.role !== "admin") throw new Error("권한이 없습니다.");
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) return;
  await prisma.notice.update({ where: { id }, data: { isPinned: !notice.isPinned } });
  revalidatePath("/dashboard");
}
