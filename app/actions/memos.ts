"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createMemoInModal(formData: FormData) {
  const session = await requireAuth();

  const clientId = formData.get("clientId");

  await prisma.memo.create({
    data: {
      clientId: clientId ? parseInt(clientId as string) : null,
      authorId: session.id,
      title: (formData.get("title") as string)?.trim() || null,
      content: formData.get("content") as string,
      memoType: (formData.get("memoType") as string) || "general",
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/diary");
}

export async function deleteMemo(id: number) {
  const session = await requireAuth();
  const memo = await prisma.memo.findUnique({ where: { id } });
  if (!memo || memo.authorId !== session.id) throw new Error("본인의 메모만 삭제할 수 있습니다.");
  await prisma.memo.delete({ where: { id } });
  revalidatePath("/tasks");
}
