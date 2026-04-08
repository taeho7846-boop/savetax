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
  // 월별 체크 상태는 별도 JSON이 아닌 레코드 자체에 저장
  // 같은 거래처의 해당 월 레코드를 찾거나 생성
  const existing = await prisma.settlementBookkeeping.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.settlementBookkeeping.update({
    where: { id },
    data: { [field]: !existing[field] },
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
