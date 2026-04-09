"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getTempMemos() {
  const session = await requireAuth();

  // 연동된 모든 텔레그램 ID 조회 (여러 기기 지원)
  const telegramUsers = await prisma.telegramUser.findMany({
    where: { userId: session.id },
  });

  if (telegramUsers.length === 0) return [];

  const telegramIds = telegramUsers.map((t) => t.telegramId);

  return prisma.tempMemo.findMany({
    where: { isProcessed: false, telegramId: { in: telegramIds } },
    orderBy: { createdAt: "desc" },
  });
}

export async function moveTempMemoToTask(id: number, formData: FormData) {
  const session = await requireAuth();
  const memo = await prisma.tempMemo.findUnique({ where: { id } });
  if (!memo) throw new Error("메모를 찾을 수 없습니다.");

  const type = formData.get("type") as string; // task | memo
  const clientId = formData.get("clientId") as string;

  if (type === "task") {
    await prisma.task.create({
      data: {
        title: formData.get("title") as string || memo.content.slice(0, 50),
        notes: memo.content,
        clientId: clientId ? parseInt(clientId) : null,
        assignedUserId: session.id,
        createdByUserId: session.id,
        taskType: (formData.get("taskType") as string) || null,
        status: "scheduled",
        priority: "normal",
      },
    });
  } else {
    await prisma.memo.create({
      data: {
        title: formData.get("title") as string || null,
        content: memo.content,
        clientId: clientId ? parseInt(clientId) : null,
        authorId: session.id,
        memoType: "general",
      },
    });
  }

  // 처리 완료
  await prisma.tempMemo.update({
    where: { id },
    data: { isProcessed: true },
  });

  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

export async function deleteTempMemo(id: number) {
  await requireAuth();
  await prisma.tempMemo.update({
    where: { id },
    data: { isProcessed: true },
  });
  revalidatePath("/dashboard");
}
