"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

// === 기장 정산 ===

export async function createBookkeepingSettlement(data: {
  clientName: string;
  ceoName?: string;
  assignedUserName?: string;
  affiliation?: string;
  monthlyFee: number;
  headquarterFee: number;
  startMonth?: string;
  notes?: string;
}) {
  const session = await requireAuth();
  await prisma.settlementBookkeeping.create({
    data: { ...data, yearMonth: "", createdByUserId: session.id },
  });
  revalidatePath("/settlement");
}

export async function updateBookkeepingSettlement(
  id: number,
  data: {
    clientName?: string;
    ceoName?: string;
    assignedUserName?: string;
    affiliation?: string;
    monthlyFee?: number;
    headquarterFee?: number;
    startMonth?: string;
    notes?: string;
  }
) {
  await requireAuth();
  await prisma.settlementBookkeeping.update({ where: { id }, data });
  revalidatePath("/settlement");
}

export async function toggleBookkeepingField(
  id: number,
  yearMonth: string,
  field: "withdrawn" | "remitted" | "tiIssued"
) {
  await requireAuth();
  if (!yearMonth) return;
  // 출금/송금/T/I 체크는 (기장 거래처 × 월)별로 분리 저장한다.
  // 해당 월에 직접 체크한 것만 그 달에 남고, 다른 달에는 영향이 없다.
  const existing = await prisma.settlementBookkeepingCheck.findUnique({
    where: { bookkeepingId_yearMonth: { bookkeepingId: id, yearMonth } },
  });
  const current = existing?.[field] ?? false;
  await prisma.settlementBookkeepingCheck.upsert({
    where: { bookkeepingId_yearMonth: { bookkeepingId: id, yearMonth } },
    update: { [field]: !current },
    create: { bookkeepingId: id, yearMonth, [field]: true },
  });
  revalidatePath("/settlement");
}

export async function deleteBookkeepingSettlement(id: number) {
  await requireAuth();
  await prisma.settlementBookkeeping.delete({ where: { id } });
  revalidatePath("/settlement");
}

// === 단건 정산 ===

export async function createOneoffSettlement(data: {
  yearMonth: string;
  clientName: string;
  ceoName?: string;
  assignedUserName?: string;
  affiliation?: string;
  withdrawalAmount: number;
  fee: number;
  notes?: string;
}) {
  const session = await requireAuth();
  await prisma.settlementOneoff.create({
    data: { ...data, createdByUserId: session.id },
  });
  revalidatePath("/settlement");
}

export async function updateOneoffSettlement(
  id: number,
  data: {
    clientName?: string;
    ceoName?: string;
    assignedUserName?: string;
    affiliation?: string;
    withdrawalAmount?: number;
    fee?: number;
    notes?: string;
  }
) {
  await requireAuth();
  await prisma.settlementOneoff.update({ where: { id }, data });
  revalidatePath("/settlement");
}

export async function toggleOneoffField(
  id: number,
  field: "withdrawn" | "remitted" | "tiIssued"
) {
  await requireAuth();
  const existing = await prisma.settlementOneoff.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.settlementOneoff.update({
    where: { id },
    data: { [field]: !existing[field] },
  });
  revalidatePath("/settlement");
}

export async function deleteOneoffSettlement(id: number) {
  await requireAuth();
  await prisma.settlementOneoff.delete({ where: { id } });
  revalidatePath("/settlement");
}

// === 환불 정산 ===

export async function createRefundSettlement(data: {
  yearMonth: string;
  clientName: string;
  ceoName?: string;
  assignedUserName?: string;
  affiliation?: string;
  withdrawalAmount: number;
  fee: number;
  notes?: string;
}) {
  const session = await requireAuth();
  await prisma.settlementRefund.create({
    data: { ...data, createdByUserId: session.id },
  });
  revalidatePath("/settlement");
}

export async function updateRefundSettlement(
  id: number,
  data: {
    clientName?: string;
    ceoName?: string;
    assignedUserName?: string;
    affiliation?: string;
    withdrawalAmount?: number;
    fee?: number;
    notes?: string;
  }
) {
  await requireAuth();
  await prisma.settlementRefund.update({ where: { id }, data });
  revalidatePath("/settlement");
}

export async function toggleRefundField(
  id: number,
  field: "withdrawn" | "remitted"
) {
  await requireAuth();
  const existing = await prisma.settlementRefund.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.settlementRefund.update({
    where: { id },
    data: { [field]: !existing[field] },
  });
  revalidatePath("/settlement");
}

export async function deleteRefundSettlement(id: number) {
  await requireAuth();
  await prisma.settlementRefund.delete({ where: { id } });
  revalidatePath("/settlement");
}
