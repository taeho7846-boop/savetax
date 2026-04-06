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

  const existing = await prisma.withholdingLaborOverride.findUnique({
    where: { clientId_yearMonth: { clientId, yearMonth } },
  });

  if (!laborTypes && !existing?.memo) {
    // 인건비 오버라이드도 없고 메모도 없으면 삭제
    await prisma.withholdingLaborOverride.deleteMany({
      where: { clientId, yearMonth },
    });
  } else {
    await prisma.withholdingLaborOverride.upsert({
      where: { clientId_yearMonth: { clientId, yearMonth } },
      update: { laborTypes: laborTypes || null },
      create: { clientId, yearMonth, laborTypes: laborTypes || null },
    });
  }

  revalidatePath("/withholding");
}

export async function setWithholdingMemo(
  clientId: number,
  yearMonth: string,
  memo: string
) {
  await requireAuth();

  const existing = await prisma.withholdingLaborOverride.findUnique({
    where: { clientId_yearMonth: { clientId, yearMonth } },
  });

  if (!memo && !existing?.laborTypes) {
    // 메모도 없고 인건비 오버라이드도 없으면 삭제
    await prisma.withholdingLaborOverride.deleteMany({
      where: { clientId, yearMonth },
    });
  } else {
    await prisma.withholdingLaborOverride.upsert({
      where: { clientId_yearMonth: { clientId, yearMonth } },
      update: { memo: memo || null },
      create: { clientId, yearMonth, memo: memo || null },
    });
  }

  revalidatePath("/withholding");
}
