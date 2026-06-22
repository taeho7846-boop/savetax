"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type VatStage = "collect" | "writing" | "approval" | "confirm" | "done";

/** 현재 단계 설정 (자료수집→작성중→결재→컨펌+보수→신고완료) */
export async function setVatStage(clientId: number, period: string, stage: VatStage) {
  await requireAuth();
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { stage },
    create: { clientId, period, stage },
  });
  revalidatePath("/vat");
}

/** 단계별 체크리스트 항목 토글 (checklist JSON에 저장) */
export async function toggleVatCheck(clientId: number, period: string, key: string) {
  await requireAuth();
  const existing = await prisma.vatRecord.findUnique({
    where: { clientId_period: { clientId, period } },
  });
  let obj: Record<string, boolean> = {};
  try { obj = existing?.checklist ? JSON.parse(existing.checklist) : {}; } catch { obj = {}; }
  obj[key] = !obj[key];
  const checklist = JSON.stringify(obj);
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { checklist },
    create: { clientId, period, checklist },
  });
  revalidatePath("/vat");
}

/** 체크리스트 항목을 명시적으로 설정 (O/X 선택 등 토글이 아닌 경우) */
export async function setVatCheckValue(clientId: number, period: string, key: string, value: boolean) {
  await requireAuth();
  const existing = await prisma.vatRecord.findUnique({
    where: { clientId_period: { clientId, period } },
  });
  let obj: Record<string, boolean> = {};
  try { obj = existing?.checklist ? JSON.parse(existing.checklist) : {}; } catch { obj = {}; }
  obj[key] = value;
  const checklist = JSON.stringify(obj);
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { checklist },
    create: { clientId, period, checklist },
  });
  revalidatePath("/vat");
}

/** 예정고지세액 설정 */
export async function setVatNoticeTax(clientId: number, period: string, noticeTax: number | null) {
  await requireAuth();
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { noticeTax },
    create: { clientId, period, noticeTax },
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
