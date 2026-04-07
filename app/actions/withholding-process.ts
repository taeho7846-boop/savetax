"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 유형별 프로세스 단계 정의
const STEPS_BY_TYPE: Record<string, string[]> = {
  A: ["급여명세서전달", "원천세신고", "납부서전달"],
  B: ["급여명세서전달", "원천세신고"],
  C: ["급여확인요청", "급여명세서전달", "원천세신고", "납부서전달"],
  D: ["최초안내발송"],
};

// 해당 월의 프로세스 체크리스트 토글
export async function toggleProcessStep(
  clientId: number,
  yearMonth: string,
  step: string
) {
  await requireAuth();

  const existing = await prisma.withholdingProcess.findUnique({
    where: { clientId_yearMonth_step: { clientId, yearMonth, step } },
  });

  if (existing) {
    await prisma.withholdingProcess.update({
      where: { id: existing.id },
      data: {
        done: !existing.done,
        doneAt: !existing.done ? new Date() : null,
      },
    });
  } else {
    await prisma.withholdingProcess.create({
      data: { clientId, yearMonth, step, done: true, doneAt: new Date() },
    });
  }

  revalidatePath("/withholding-process");
}

// D유형 최초 안내 발송 완료 처리
export async function markDNotified(clientId: number, yearMonth: string) {
  await requireAuth();

  await prisma.$transaction([
    prisma.client.update({
      where: { id: clientId },
      data: { withholdingDNotified: true },
    }),
    prisma.withholdingProcess.upsert({
      where: {
        clientId_yearMonth_step: {
          clientId,
          yearMonth,
          step: "최초안내발송",
        },
      },
      update: { done: true, doneAt: new Date() },
      create: {
        clientId,
        yearMonth,
        step: "최초안내발송",
        done: true,
        doneAt: new Date(),
      },
    }),
  ]);

  revalidatePath("/withholding-process");
}

// 원천세 유형 빠른 변경 (프로세스 페이지에서)
export async function updateWithholdingType(
  clientId: number,
  type: string | null
) {
  await requireAuth();

  await prisma.client.update({
    where: { id: clientId },
    data: { withholdingType: type },
  });

  revalidatePath("/withholding-process");
  revalidatePath("/clients");
}
