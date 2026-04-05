"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getKnowledges() {
  await requireAuth();
  return prisma.knowledge.findMany({
    include: { author: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createKnowledge(formData: FormData) {
  const session = await requireAuth();
  await prisma.knowledge.create({
    data: {
      authorId: session.id,
      category: formData.get("category") as string,
      title: (formData.get("title") as string).trim(),
      content: (formData.get("content") as string).trim(),
      files: (formData.get("files") as string)?.trim() || null,
      tags: (formData.get("tags") as string)?.trim() || null,
    },
  });
  revalidatePath("/dashboard");
}

export async function updateKnowledge(id: number, formData: FormData) {
  const session = await requireAuth();
  const item = await prisma.knowledge.findUnique({ where: { id } });
  if (!item || (item.authorId !== session.id && session.role !== "owner"))
    throw new Error("수정 권한이 없습니다.");

  await prisma.knowledge.update({
    where: { id },
    data: {
      category: formData.get("category") as string,
      title: (formData.get("title") as string).trim(),
      content: (formData.get("content") as string).trim(),
      files: (formData.get("files") as string)?.trim() || null,
      tags: (formData.get("tags") as string)?.trim() || null,
    },
  });
  revalidatePath("/dashboard");
}

export async function deleteKnowledge(id: number) {
  const session = await requireAuth();
  const item = await prisma.knowledge.findUnique({ where: { id } });
  if (!item || (item.authorId !== session.id && session.role !== "owner"))
    throw new Error("삭제 권한이 없습니다.");

  await prisma.knowledge.delete({ where: { id } });
  revalidatePath("/dashboard");
}
