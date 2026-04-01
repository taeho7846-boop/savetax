"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getFeedbacks() {
  await requireAuth();
  return prisma.feedback.findMany({
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createFeedback(formData: FormData) {
  const session = await requireAuth();
  const category = formData.get("category") as string;
  const content = (formData.get("content") as string)?.trim();
  if (!content) throw new Error("내용을 입력하세요.");

  const page = (formData.get("page") as string) || null;

  await prisma.feedback.create({
    data: {
      authorId: session.id,
      category,
      page,
      content,
    },
  });
  revalidatePath("/dashboard");
}

export async function updateFeedback(id: number, formData: FormData) {
  const session = await requireAuth();
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback || (feedback.authorId !== session.id && session.role !== "owner"))
    throw new Error("수정 권한이 없습니다.");

  await prisma.feedback.update({
    where: { id },
    data: {
      category: formData.get("category") as string,
      page: (formData.get("page") as string) || null,
      content: (formData.get("content") as string)?.trim(),
    },
  });
  revalidatePath("/dashboard");
}

export async function deleteFeedback(id: number) {
  const session = await requireAuth();
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback || (feedback.authorId !== session.id && session.role !== "owner"))
    throw new Error("삭제 권한이 없습니다.");

  await prisma.feedback.delete({ where: { id } });
  revalidatePath("/dashboard");
}
