"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { canEditTaehoSettlement, isValidYM, prevYM } from "@/lib/taeho-settlement";

const PATH = "/settlement-taeho";

/** 공통비용 입력은 대표(owner)·관리자(admin)만 */
async function requireOwner() {
  const session = await requireAuth();
  if (!canEditTaehoSettlement(session)) throw new Error("FORBIDDEN");
  return session;
}

export type ExpenseInput = {
  label: string;
  amount: number; // 공급가
  shareRate: number; // 참여자 부담 %
  recurring: boolean;
  note?: string | null;
};

function sanitize(input: ExpenseInput) {
  const label = (input.label ?? "").trim();
  if (!label) throw new Error("항목명을 입력하세요.");
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  const shareRate = Math.min(100, Math.max(0, Math.round(Number(input.shareRate) || 0)));
  return { label, amount, shareRate, recurring: !!input.recurring, note: input.note?.trim() || null };
}

export async function createTaehoExpense(yearMonth: string, input: ExpenseInput) {
  const session = await requireOwner();
  if (!isValidYM(yearMonth)) throw new Error("잘못된 월입니다.");
  const last = await prisma.taehoSettlementExpense.findFirst({
    where: { yearMonth },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.taehoSettlementExpense.create({
    data: { yearMonth, ...sanitize(input), sortOrder: (last?.sortOrder ?? 0) + 1, createdByUserId: session.id },
  });
  revalidatePath(PATH);
}

export async function updateTaehoExpense(id: number, input: ExpenseInput) {
  await requireOwner();
  await prisma.taehoSettlementExpense.update({ where: { id }, data: sanitize(input) });
  revalidatePath(PATH);
}

export async function deleteTaehoExpense(id: number) {
  await requireOwner();
  await prisma.taehoSettlementExpense.delete({ where: { id } });
  revalidatePath(PATH);
}

/**
 * 전월의 반복(recurring) 항목을 이번 달로 복사. 이번 달에 이미 같은 항목명이 있으면 건너뛴다.
 * @returns 복사된 건수
 */
export async function copyRecurringExpenses(yearMonth: string): Promise<number> {
  const session = await requireOwner();
  if (!isValidYM(yearMonth)) throw new Error("잘못된 월입니다.");
  const prev = prevYM(yearMonth);
  const [source, existing] = await Promise.all([
    prisma.taehoSettlementExpense.findMany({
      where: { yearMonth: prev, recurring: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.taehoSettlementExpense.findMany({ where: { yearMonth }, select: { label: true, sortOrder: true } }),
  ]);
  const have = new Set(existing.map((e) => e.label));
  let order = existing.reduce((m, e) => Math.max(m, e.sortOrder), 0);
  const toCreate = source.filter((e) => !have.has(e.label));
  if (toCreate.length === 0) return 0;
  await prisma.taehoSettlementExpense.createMany({
    data: toCreate.map((e) => ({
      yearMonth,
      label: e.label,
      amount: e.amount,
      shareRate: e.shareRate,
      recurring: true,
      note: e.note,
      sortOrder: ++order,
      createdByUserId: session.id,
    })),
  });
  revalidatePath(PATH);
  return toCreate.length;
}
