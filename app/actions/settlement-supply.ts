"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { SUPPLY_PEOPLE, parseParticipants, joinParticipants } from "@/lib/settlement-supply";

async function requireAuth() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

// 비품 항목 추가
export async function createSupply(data: {
  yearMonth: string;
  item: string;
  amount: number;
  payer: string;
  channel?: string;
  participants: string[];
}) {
  const session = await requireAuth();
  await prisma.settlementSupply.create({
    data: {
      yearMonth: data.yearMonth,
      item: data.item.trim(),
      amount: data.amount || 0,
      payer: data.payer,
      channel: data.channel?.trim() || null,
      participants: joinParticipants(data.participants),
      createdByUserId: session.id,
    },
  });
  revalidatePath("/settlement");
}

// 비품 항목 수정 (항목/금액/결제자/채널)
export async function updateSupply(
  id: number,
  data: { item?: string; amount?: number; payer?: string; channel?: string | null },
) {
  await requireAuth();

  // 결제자가 바뀌면 분배 대상에도 자동 포함 (결제자 자동 체크 규칙)
  let participants: string | undefined;
  if (data.payer !== undefined) {
    const row = await prisma.settlementSupply.findUnique({ where: { id } });
    if (row) {
      const set = new Set(parseParticipants(row.participants));
      set.add(data.payer);
      participants = joinParticipants([...set]);
    }
  }

  await prisma.settlementSupply.update({
    where: { id },
    data: {
      ...(data.item !== undefined && { item: data.item.trim() }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.payer !== undefined && { payer: data.payer }),
      ...(data.channel !== undefined && { channel: data.channel?.trim() || null }),
      ...(participants !== undefined && { participants }),
    },
  });
  revalidatePath("/settlement");
}

// 분배 체크박스 토글 (한 사람씩)
export async function toggleSupplyParticipant(id: number, person: string) {
  await requireAuth();
  if (!(SUPPLY_PEOPLE as readonly string[]).includes(person)) return;
  const row = await prisma.settlementSupply.findUnique({ where: { id } });
  if (!row) return;
  const cur = new Set(parseParticipants(row.participants));
  if (cur.has(person)) cur.delete(person);
  else cur.add(person);
  await prisma.settlementSupply.update({
    where: { id },
    data: { participants: joinParticipants([...cur]) },
  });
  revalidatePath("/settlement");
}

// 비품 항목 삭제
export async function deleteSupply(id: number) {
  await requireAuth();
  await prisma.settlementSupply.delete({ where: { id } });
  revalidatePath("/settlement");
}

// 월별 정산완료 토글 (사람 단위)
export async function toggleSupplySettled(yearMonth: string, person: string) {
  await requireAuth();
  if (!(SUPPLY_PEOPLE as readonly string[]).includes(person)) return;
  const existing = await prisma.settlementSupplySettled.findUnique({
    where: { yearMonth_person: { yearMonth, person } },
  });
  await prisma.settlementSupplySettled.upsert({
    where: { yearMonth_person: { yearMonth, person } },
    create: { yearMonth, person, settled: true },
    update: { settled: !(existing?.settled ?? false) },
  });
  revalidatePath("/settlement");
}
