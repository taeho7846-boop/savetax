"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  canEditTaehoSettlement,
  getTaehoParticipant,
  isValidYM,
  loadTaehoSettlement,
  prevYM,
  type RevenueSource,
} from "@/lib/taeho-settlement";

const PATH = "/settlement-taeho";

/** 공통비용 입력·차수 확정은 대표(owner)·관리자(admin)만 */
async function requireOwner() {
  const session = await requireAuth();
  if (!canEditTaehoSettlement(session)) throw new Error("FORBIDDEN");
  return session;
}

export type ExpenseInput = {
  label: string;
  amount: number; // 공급대가(부가세 포함)
  shareRate: number; // 참여자 부담 %
  recurring: boolean;
  roundSeq?: number; // 몇 차에서 차감 (기본 1)
  note?: string | null;
};

function sanitize(input: ExpenseInput) {
  const label = (input.label ?? "").trim();
  if (!label) throw new Error("항목명을 입력하세요.");
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  const shareRate = Math.min(100, Math.max(0, Math.round(Number(input.shareRate) || 0)));
  const roundSeq = Math.min(20, Math.max(1, Math.round(Number(input.roundSeq) || 1)));
  return { label, amount, shareRate, recurring: !!input.recurring, roundSeq, note: input.note?.trim() || null };
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
 * 차수는 1차로 복사한다 (새 달은 1차부터 시작하므로).
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
      roundSeq: 1,
      note: e.note,
      sortOrder: ++order,
      createdByUserId: session.id,
    })),
  });
  revalidatePath(PATH);
  return toCreate.length;
}

/**
 * 매출 행 하나를 이 달 계산에서 제외/다시 포함. 원본(채권관리 수납 체크·Savetax 출금 체크·단건 행)은 건드리지 않는다.
 * 이미 확정 차수에 들어간 건은 제외할 수 없다 (확정 취소 후 가능).
 * @param source client(refId=clientId) | pulled(refId=bookkeepingId) | oneoff(refId=oneoffId)
 */
export async function setTaehoRevenueExcluded(
  yearMonth: string,
  source: RevenueSource,
  refId: number,
  excluded: boolean,
  label?: string
) {
  const session = await requireOwner();
  if (!isValidYM(yearMonth)) throw new Error("잘못된 월입니다.");
  if (!["client", "pulled", "oneoff"].includes(source)) throw new Error("잘못된 출처입니다.");
  if (excluded) {
    const confirmed = await prisma.taehoSettlementRoundItem.findFirst({
      where: { source, refId, round: { yearMonth } },
      select: { round: { select: { seq: true } } },
    });
    if (confirmed) throw new Error(`이미 ${confirmed.round.seq}차로 확정된 건이에요. 확정을 취소한 뒤 제외할 수 있어요.`);
    await prisma.taehoSettlementExclusion.upsert({
      where: { yearMonth_source_refId: { yearMonth, source, refId } },
      update: { label: label ?? undefined },
      create: { yearMonth, source, refId, label: label ?? null, createdByUserId: session.id },
    });
  } else {
    await prisma.taehoSettlementExclusion.deleteMany({ where: { yearMonth, source, refId } });
  }
  revalidatePath(PATH);
}

/**
 * N차 정산 확정 — 지금 '미정산'에 있는 입금 건(제외된 건 빼고)을 다음 차수로 스냅샷한다.
 * @returns 확정된 차수 번호와 건수
 */
export async function confirmTaehoRound(yearMonth: string, participantId: number, note?: string) {
  const session = await requireOwner();
  if (!isValidYM(yearMonth)) throw new Error("잘못된 월입니다.");
  const participant = await getTaehoParticipant(participantId);
  if (!participant) throw new Error("정산 참여자가 아니에요.");

  const data = await loadTaehoSettlement(participant, yearMonth);
  const rows = data.draft.statement.revenue.items.flatMap((i) => i.rows).filter((r) => !r.excluded);
  if (rows.length === 0) throw new Error("미정산 입금 건이 없어요.");
  const seq = data.rounds.length + 1;

  await prisma.taehoSettlementRound.create({
    data: {
      yearMonth,
      participantId,
      seq,
      note: note?.trim() || null,
      createdByUserId: session.id,
      items: {
        create: rows.map((r) => ({ source: r.source, refId: r.refId, name: r.name, amount: r.amount })),
      },
    },
  });
  revalidatePath(PATH);
  return { seq, count: rows.length };
}

/** 마지막 차수 확정 취소 — 그 차수의 입금 건은 다시 '미정산'으로 돌아간다. 마지막 차수만 취소 가능. */
export async function cancelLastTaehoRound(yearMonth: string, participantId: number) {
  await requireOwner();
  const last = await prisma.taehoSettlementRound.findFirst({
    where: { yearMonth, participantId },
    orderBy: { seq: "desc" },
    select: { id: true, seq: true },
  });
  if (!last) throw new Error("취소할 확정 차수가 없어요.");
  await prisma.taehoSettlementRound.delete({ where: { id: last.id } });
  revalidatePath(PATH);
  return last.seq;
}
