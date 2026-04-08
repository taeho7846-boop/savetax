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

export async function upsertBookkeepingSettlement(
  clientId: number,
  yearMonth: string,
  data: { headquarterFee?: number; notes?: string; settlementStartMonth?: string }
) {
  await requireAuth();
  const { settlementStartMonth, ...bookkeepingData } = data;
  // 출금시작월은 Client 모델에 저장
  if (settlementStartMonth !== undefined) {
    await prisma.client.update({
      where: { id: clientId },
      data: { settlementStartMonth: settlementStartMonth || null },
    });
  }
  await prisma.settlementBookkeeping.upsert({
    where: { clientId_yearMonth: { clientId, yearMonth } },
    update: bookkeepingData,
    create: { clientId, yearMonth, ...bookkeepingData },
  });
  revalidatePath("/settlement");
}

export async function toggleBookkeepingField(
  clientId: number,
  yearMonth: string,
  field: "withdrawn" | "remitted" | "tiIssued"
) {
  await requireAuth();
  const existing = await prisma.settlementBookkeeping.findUnique({
    where: { clientId_yearMonth: { clientId, yearMonth } },
  });
  if (existing) {
    await prisma.settlementBookkeeping.update({
      where: { id: existing.id },
      data: { [field]: !existing[field] },
    });
  } else {
    await prisma.settlementBookkeeping.create({
      data: { clientId, yearMonth, [field]: true },
    });
  }
  revalidatePath("/settlement");
}

// === 단건 정산 ===

export async function createOneoffSettlement(data: {
  yearMonth: string;
  clientName: string;
  ceoName?: string;
  assignedUserName?: string;
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
