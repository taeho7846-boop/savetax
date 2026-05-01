"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleIncomeTaxCheck(
  clientId: number,
  taxYear: string,
  field: string
) {
  await requireAuth();

  const boolFields = [
    "noticeSent", "linkPass", "depreciation", "interestExpense",
    "insurance", "donation", "preSettlement",
    "bookkeepingCredit", "startupReduction", "smeReduction",
    "investCredit", "employmentCredit", "depositReceived", "filingDone", "paymentSent",
  ];
  if (!boolFields.includes(field)) return;

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data: { [field]: !(existing as any)[field] },
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, [field]: true },
    });
  }

  revalidatePath("/income-tax");
}

export async function updateIncomeTaxField(
  clientId: number,
  taxYear: string,
  field: string,
  value: string
) {
  await requireAuth();

  const textFields = ["bookkeepingDuty", "filingType"];
  const numberFields = ["prevSales", "prevIncome", "prevTax", "currSales", "currIncome", "currTax", "adjustmentFee"];

  let data: Record<string, any> = {};
  if (textFields.includes(field)) {
    data[field] = value || null;
  } else if (numberFields.includes(field)) {
    data[field] = value ? BigInt(value.replace(/[^0-9-]/g, "")) : null;
  } else {
    return;
  }

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, ...data },
    });
  }

  revalidatePath("/income-tax");
}

export async function setIncomeTaxMemo(
  clientId: number,
  taxYear: string,
  memo: string
) {
  await requireAuth();

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data: { memo: memo || null },
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, memo: memo || null },
    });
  }

  revalidatePath("/income-tax");
}

// 작성중 → 결재 단계로 이동
export async function moveToApproval(clientId: number, taxYear: string) {
  await requireAuth();
  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    // 반려된 게 있으면 가장 최근 반려를 resolved 처리
    await prisma.incomeTaxRejection.updateMany({
      where: { clientId, taxYear, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data: { preSettlement: true },
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, preSettlement: true },
    });
  }
  revalidatePath("/income-tax");
}

// 결재 → 컨펌 단계
export async function confirmIncomeTaxReport(clientId: number, taxYear: string) {
  await requireAuth();
  await prisma.incomeTaxRecord.update({
    where: { clientId_taxYear: { clientId, taxYear } },
    data: { depositReceived: true },
  });
  revalidatePath("/income-tax");
}

// 결재 → 반려 (작성중 단계로 복귀, 반려 히스토리 기록)
export async function rejectIncomeTaxReport(
  clientId: number,
  taxYear: string,
  reason: string
) {
  const session = await requireAuth();
  const trimmed = (reason || "").trim();
  if (!trimmed) throw new Error("REASON_REQUIRED");

  // 현재 차수 = 기존 반려 + 1
  const existingCount = await prisma.incomeTaxRejection.count({
    where: { clientId, taxYear },
  });
  const sequence = existingCount + 1;

  const now = new Date();
  await prisma.incomeTaxRejection.create({
    data: {
      clientId,
      taxYear,
      sequence,
      reason: trimmed,
      rejectedById: session.id,
      rejectedAt: now,
    },
  });

  await prisma.incomeTaxRecord.update({
    where: { clientId_taxYear: { clientId, taxYear } },
    data: {
      preSettlement: false,
      rejectionCount: sequence,
      lastRejectedAt: now,
    },
  });

  revalidatePath("/income-tax");
}

// 반려 히스토리 조회 (모달/뱃지용)
export async function getIncomeTaxRejections(clientId: number, taxYear: string) {
  await requireAuth();
  const rows = await prisma.incomeTaxRejection.findMany({
    where: { clientId, taxYear },
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

// 신고도움서비스 분석 결과 적용 — 유형/매출/메모
export async function applyNoticeAnalysis(
  clientId: number,
  taxYear: string,
  fields: {
    filingType?: string | null;
    memoAppend?: string | null;
    currSales?: string | null;
    prevSales?: string | null;
    prevIncome?: string | null;
    prevTax?: string | null;
  }
) {
  await requireAuth();
  const data: Record<string, any> = {};
  if (fields.filingType !== undefined) data.filingType = fields.filingType || null;

  const toBig = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (!v) return null;
    const cleaned = v.replace(/[^0-9-]/g, "");
    return cleaned ? BigInt(cleaned) : null;
  };
  const cs = toBig(fields.currSales);
  if (cs !== undefined) data.currSales = cs;
  const ps = toBig(fields.prevSales);
  if (ps !== undefined) data.prevSales = ps;
  const pi = toBig(fields.prevIncome);
  if (pi !== undefined) data.prevIncome = pi;
  const pt = toBig(fields.prevTax);
  if (pt !== undefined) data.prevTax = pt;

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (fields.memoAppend) {
    const prev = existing?.memo ?? "";
    data.memo = (prev ? prev + "\n" : "") + fields.memoAppend;
  }

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, ...data },
    });
  }

  // 직원 검토 표시
  await prisma.clientNoticeAnalysis.updateMany({
    where: { clientId, taxYear },
    data: { reviewedByStaffAt: new Date() },
  });

  revalidatePath("/income-tax");
}
