"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getClientScopeWhere } from "@/lib/client-scope";
import { kstToday } from "@/lib/bookkeeping";
import { ACTIVE_STATUS, DEFAULT_SCHEDULE, newToken, hashToken, periodFromFor, pushLog, type Schedule } from "@/lib/autobook";

async function assertInScope(session: { id: number; role: string }, clientIds: number[]) {
  const scope = await getClientScopeWhere(session);
  const n = await prisma.client.count({ where: { ...scope, id: { in: clientIds } } });
  if (n !== clientIds.length) throw new Error("FORBIDDEN");
}
const writer = async () => {
  const s = await requireAuth();
  if (s.role === "readonly") throw new Error("FORBIDDEN");
  return s;
};

export type AutobookSettingInput = {
  staff: "auto" | "yes" | "no";
  vehicleDeduct: boolean;
  deemedPurchase: boolean;
  foodAccount: "146" | "830";
  industry?: string | null;
  memo?: string | null;
};

/** 거래처별 자동기장 판단 설정 저장 */
export async function saveAutobookSetting(clientId: number, input: AutobookSettingInput) {
  const session = await writer();
  await assertInScope(session, [clientId]);
  if (!["auto", "yes", "no"].includes(input.staff) || !["146", "830"].includes(input.foodAccount)) throw new Error("BAD_INPUT");
  const data = {
    staff: input.staff, vehicleDeduct: !!input.vehicleDeduct, deemedPurchase: !!input.deemedPurchase, foodAccount: input.foodAccount,
    industry: input.industry?.trim() || null, memo: input.memo?.trim() || null, updatedByUserId: session.id,
  };
  await prisma.autobookSetting.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
  revalidatePath("/autobook");
  return { ok: true };
}

/** 체크한 거래처를 내 PC 실행기에 예약. 이미 대기·진행 중인 거래처와 위하고 미연동 거래처는 건너뜀 */
export async function enqueueAutobook(clientIds: number[], mode: "schedule" | "now" = "schedule") {
  const session = await writer();
  if (clientIds.length === 0 || clientIds.length > 200) throw new Error("BAD_INPUT");
  await assertInScope(session, clientIds);
  const yearMonth = kstToday().slice(0, 7);
  const [clients, active] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, wehagoCno: true } }),
    prisma.autobookJob.findMany({ where: { clientId: { in: clientIds }, status: { in: ACTIVE_STATUS } }, select: { clientId: true } }),
  ]);
  const busy = new Set(active.map(a => a.clientId));
  const ok = clients.filter(c => c.wehagoCno && !busy.has(c.id)).map(c => c.id);
  const who = session.name || session.username;
  await prisma.autobookJob.createMany({
    data: ok.map(clientId => ({
      clientId, userId: session.id, yearMonth, periodFrom: periodFromFor(yearMonth), mode,
      log: pushLog("[]", `${who} 예약 (${mode === "now" ? "바로 실행" : "시간표대로"})`),
    })),
  });
  revalidatePath("/autobook");
  return { queued: ok.length, skippedBusy: clients.filter(c => busy.has(c.id)).length, skippedNoCno: clients.filter(c => !c.wehagoCno).length };
}

/** 예약 취소 — 대기 중이면 바로 빠지고, 진행 중이면 실행기가 다음 보고 때 멈춘다 */
export async function cancelAutobookJob(jobId: number) {
  const session = await writer();
  const job = await prisma.autobookJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("NOT_FOUND");
  await assertInScope(session, [job.clientId]);
  if (!ACTIVE_STATUS.includes(job.status as never)) return { ok: true };
  await prisma.autobookJob.update({
    where: { id: jobId },
    data: { status: "canceled", finishedAt: new Date(), log: pushLog(job.log, `${session.name || session.username} 취소`) },
  });
  revalidatePath("/autobook");
  return { ok: true };
}

/** '대표님 확인 필요' 항목 확인 완료 */
export async function resolveAutobookAlert(alertId: number) {
  const session = await writer();
  const a = await prisma.autobookAlert.findUnique({ where: { id: alertId } });
  if (!a) throw new Error("NOT_FOUND");
  await assertInScope(session, [a.clientId]);
  await prisma.autobookAlert.update({ where: { id: alertId }, data: { resolvedAt: new Date(), resolvedByUserId: session.id } });
  revalidatePath("/autobook");
  return { ok: true };
}

/** 내 PC 실행기 연결 토큰 발급(다시 발급하면 이전 토큰은 못 씀). 원문은 이때 한 번만 보여준다 */
export async function issueAgentToken() {
  const session = await writer();
  const token = newToken();
  await prisma.autobookAgent.upsert({
    where: { userId: session.id },
    update: { tokenHash: hashToken(token), lastSeenAt: null, wehagoLoggedIn: false },
    create: { userId: session.id, tokenHash: hashToken(token), schedule: JSON.stringify(DEFAULT_SCHEDULE) },
  });
  revalidatePath("/autobook");
  return { token };
}

/** 내 실행 시간표 저장 (근무시간·수집 마감). 홈택스 수집 불가 00~06시는 고정 */
export async function saveAgentSchedule(s: Schedule) {
  const session = await writer();
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hm.test(s.workFrom) || !hm.test(s.workTo) || !hm.test(s.collectStop) || s.workFrom >= s.workTo) throw new Error("BAD_INPUT");
  const agent = await prisma.autobookAgent.findUnique({ where: { userId: session.id } });
  if (!agent) throw new Error("실행기를 먼저 연결하세요");
  await prisma.autobookAgent.update({ where: { id: agent.id }, data: { schedule: JSON.stringify(s) } });
  revalidatePath("/autobook");
  return { ok: true };
}
