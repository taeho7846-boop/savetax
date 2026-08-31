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

// 검증 결과 모달에서 수기 체크 (토글이 아니라 항상 완료 처리)
export async function markWithholdingDone(
  clientId: number,
  yearMonth: string,
  taskType: string = "원천세신고"
) {
  await requireAuth();

  await prisma.withholdingRecord.upsert({
    where: { clientId_yearMonth_taskType: { clientId, yearMonth, taskType } },
    update: { done: true },
    create: { clientId, yearMonth, taskType, done: true },
  });

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

// 원천세 고정 특이사항 (거래처에 저장, 매월 유지)
export async function setWithholdingNote(clientId: number, note: string) {
  await requireAuth();

  await prisma.client.update({
    where: { id: clientId },
    data: { withholdingNote: note.trim() || null },
  });

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
