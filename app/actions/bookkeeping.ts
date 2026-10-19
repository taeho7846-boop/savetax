"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getClientScopeWhere, getSemoFlags } from "@/lib/client-scope";
import { STAGE_ORDER, TARGET_DAY_KEY, DEFAULT_TARGET_DAY, effectiveStage, type BookkeepingStage } from "@/lib/bookkeeping";

const YM = /^\d{4}-\d{2}$/;

async function assertInScope(session: { id: number; role: string }, clientIds: number[]) {
  const scope = await getClientScopeWhere(session);
  const n = await prisma.client.count({ where: { ...scope, id: { in: clientIds } } });
  if (n !== clientIds.length) throw new Error("FORBIDDEN");
}

/** 단계 변경 (한 거래처 · 한 달) */
export async function setBookkeepingStage(clientId: number, yearMonth: string, stage: BookkeepingStage) {
  const session = await requireAuth();
  if (session.role === "readonly") throw new Error("FORBIDDEN");
  if (!YM.test(yearMonth) || !STAGE_ORDER.includes(stage)) throw new Error("BAD_INPUT");
  await assertInScope(session, [clientId]);
  const flags = await getSemoFlags([clientId]);
  const st = effectiveStage(stage, flags.get(clientId) ?? true); // 세모 미적용 거래처는 기장완료가 끝
  await prisma.bookkeepingMonth.upsert({
    where: { clientId_yearMonth: { clientId, yearMonth } },
    update: { stage: st, updatedByUserId: session.id },
    create: { clientId, yearMonth, stage: st, updatedByUserId: session.id },
  });
  revalidatePath("/bookkeeping");
  revalidatePath("/dashboard");
  return { ok: true, stage: st };
}

/** 여러 거래처 같은 달 일괄 단계 변경 */
export async function bulkSetBookkeepingStage(clientIds: number[], yearMonth: string, stage: BookkeepingStage) {
  const session = await requireAuth();
  if (session.role === "readonly") throw new Error("FORBIDDEN");
  if (!YM.test(yearMonth) || !STAGE_ORDER.includes(stage) || clientIds.length === 0) throw new Error("BAD_INPUT");
  await assertInScope(session, clientIds);
  const flags = await getSemoFlags(clientIds);
  await prisma.$transaction(
    clientIds.map(clientId => {
      const st = effectiveStage(stage, flags.get(clientId) ?? true);
      return prisma.bookkeepingMonth.upsert({
        where: { clientId_yearMonth: { clientId, yearMonth } },
        update: { stage: st, updatedByUserId: session.id },
        create: { clientId, yearMonth, stage: st, updatedByUserId: session.id },
      });
    })
  );
  revalidatePath("/bookkeeping");
  revalidatePath("/dashboard");
  return { updated: clientIds.length };
}

/**
 * 기간 일괄 완료 — fromYM~toYM 사이 모든 달을 done(세모리포트 완료) 으로.
 * 예) 부가세 신고가 끝난 상반기(01~06월분)를 한 번에 완료 처리.
 */
export async function bulkCloseThrough(clientIds: number[], fromYM: string, toYM: string) {
  const session = await requireAuth();
  if (session.role === "readonly") throw new Error("FORBIDDEN");
  if (!YM.test(fromYM) || !YM.test(toYM) || fromYM > toYM || clientIds.length === 0) throw new Error("BAD_INPUT");
  await assertInScope(session, clientIds);
  const months: string[] = [];
  let [y, m] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  if (months.length > 36) throw new Error("BAD_INPUT");
  const flags = await getSemoFlags(clientIds);
  const ops = [];
  for (const clientId of clientIds) {
    const st = (flags.get(clientId) ?? true) ? "done" : "booked"; // 세모 미적용 거래처는 기장완료가 곧 마감
    for (const yearMonth of months) {
      ops.push(prisma.bookkeepingMonth.upsert({
        where: { clientId_yearMonth: { clientId, yearMonth } },
        update: { stage: st, updatedByUserId: session.id },
        create: { clientId, yearMonth, stage: st, updatedByUserId: session.id },
      }));
    }
  }
  await prisma.$transaction(ops);
  revalidatePath("/bookkeeping");
  revalidatePath("/dashboard");
  return { clients: clientIds.length, months: months.length };
}

/** 월별 메모 */
export async function setBookkeepingMemo(clientId: number, yearMonth: string, memo: string) {
  const session = await requireAuth();
  if (session.role === "readonly") throw new Error("FORBIDDEN");
  if (!YM.test(yearMonth)) throw new Error("BAD_INPUT");
  await assertInScope(session, [clientId]);
  const value = memo.trim() || null;
  await prisma.bookkeepingMonth.upsert({
    where: { clientId_yearMonth: { clientId, yearMonth } },
    update: { memo: value, updatedByUserId: session.id },
    create: { clientId, yearMonth, memo: value, updatedByUserId: session.id },
  });
  revalidatePath("/bookkeeping");
  return { ok: true };
}

/** 마감 목표일(사무실 공통) 변경 — 대표/관리자/세무사만 */
export async function setBookkeepingTargetDay(day: number) {
  const session = await requireAuth();
  if (!["owner", "admin", "accountant"].includes(session.role)) throw new Error("FORBIDDEN");
  const d = Math.round(day);
  if (!(d >= 1 && d <= 31)) throw new Error("BAD_INPUT");
  await prisma.appConfig.upsert({
    where: { key: TARGET_DAY_KEY },
    update: { value: String(d) },
    create: { key: TARGET_DAY_KEY, value: String(d) },
  });
  revalidatePath("/bookkeeping");
  revalidatePath("/dashboard");
  return { day: d };
}

export async function getBookkeepingTargetDay(): Promise<number> {
  const row = await prisma.appConfig.findUnique({ where: { key: TARGET_DAY_KEY } });
  const n = row ? parseInt(row.value) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : DEFAULT_TARGET_DAY;
}
