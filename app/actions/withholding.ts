"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleWithholdingTask(
  clientId: number,
  yearMonth: string,
  taskType: string
) {
  await requireAuth();

  const existing = await prisma.withholdingRecord.findUnique({
    where: { clientId_yearMonth_taskType: { clientId, yearMonth, taskType } },
  });

  if (existing) {
    await prisma.withholdingRecord.update({
      where: { id: existing.id },
      data: { done: !existing.done },
    });
  } else {
    await prisma.withholdingRecord.create({
      data: { clientId, yearMonth, taskType, done: true },
    });
  }

  revalidatePath("/withholding");
}

export async function setLaborOverride(
  clientId: number,
  yearMonth: string,
  laborTypes: string
) {
  await requireAuth();

  if (!laborTypes) {
    // 오버라이드 삭제 (기본값으로 복원)
    await prisma.withholdingLaborOverride.deleteMany({
      where: { clientId, yearMonth },
    });
  } else {
    await prisma.withholdingLaborOverride.upsert({
      where: { clientId_yearMonth: { clientId, yearMonth } },
      update: { laborTypes },
      create: { clientId, yearMonth, laborTypes },
    });
  }

  revalidatePath("/withholding");
}
