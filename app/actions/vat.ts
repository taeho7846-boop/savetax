"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type VatStage = "stageCollect" | "stageDraft" | "stageReview" | "stageFiled" | "stagePaid";

/** 5단계 체크 토글 (자료수집/신고서작성/검토/신고완료/수금) */
export async function toggleVatStage(clientId: number, period: string, stage: VatStage) {
  await requireAuth();
  const existing = await prisma.vatRecord.findUnique({
    where: { clientId_period: { clientId, period } },
  });
  const current = existing ? (existing[stage] as boolean) : false;
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { [stage]: !current } as Prisma.VatRecordUpdateInput,
    create: { clientId, period, [stage]: true } as Prisma.VatRecordUncheckedCreateInput,
  });
  revalidatePath("/vat");
}

/** 신고수수료 설정 (기장=0 기본, 신고대리=입력) */
export async function setVatFee(clientId: number, period: string, fee: number | null) {
  await requireAuth();
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { fee },
    create: { clientId, period, fee },
  });
  revalidatePath("/vat");
}

/** 이번 기간 신고 제외 토글 */
export async function toggleVatExcluded(clientId: number, period: string) {
  await requireAuth();
  const existing = await prisma.vatRecord.findUnique({
    where: { clientId_period: { clientId, period } },
  });
  const current = existing?.excluded ?? false;
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { excluded: !current },
    create: { clientId, period, excluded: true },
  });
  revalidatePath("/vat");
}

/** 메모 저장 */
export async function setVatMemo(clientId: number, period: string, memo: string) {
  await requireAuth();
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { memo: memo || null },
    create: { clientId, period, memo: memo || null },
  });
  revalidatePath("/vat");
}
