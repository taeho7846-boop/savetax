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
  // 결재 단계로 (재)진입 시 미해소 반려를 해소 처리
  if (stage === "approval") {
    await prisma.vatRejection.updateMany({
      where: { clientId, period, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }
  revalidatePath("/vat");
}

/** 결재 → 반려 (작성중 단계로 복귀, 반려 이력 기록) */
export async function rejectVatReport(clientId: number, period: string, reason: string) {
  const session = await requireAuth();
  const trimmed = (reason || "").trim();
  if (!trimmed) throw new Error("REASON_REQUIRED");

  const existingCount = await prisma.vatRejection.count({ where: { clientId, period } });
  const sequence = existingCount + 1;
  const now = new Date();

  await prisma.vatRejection.create({
    data: { clientId, period, sequence, reason: trimmed, rejectedById: session.id, rejectedAt: now },
  });
  await prisma.vatRecord.upsert({
    where: { clientId_period: { clientId, period } },
    update: { stage: "writing", rejectionCount: sequence, lastRejectedAt: now },
    create: { clientId, period, stage: "writing", rejectionCount: sequence, lastRejectedAt: now },
  });
  revalidatePath("/vat");
}

/** 반려 이력 조회 (모달/뱃지용) */
export async function getVatRejections(clientId: number, period: string) {
  await requireAuth();
  const rows = await prisma.vatRejection.findMany({
    where: { clientId, period },
    orderBy: { sequence: "asc" },
    include: { rejectedBy: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    reason: r.reason,
    rejectedAt: r.rejectedAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    rejectedByName: r.rejectedBy?.name ?? null,
  }));
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
