import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientScopeWhere } from "@/lib/client-scope";
import { kstToday, addMonths } from "@/lib/bookkeeping";
import { staffMonthsMap, parseSchedule, periodFromFor, AGENT_ONLINE_MS } from "@/lib/autobook";
import { AutobookBoard, type AbClient, type AbJob, type AbAlert } from "./AutobookBoard";

/**
 * AI자동기장 — 체크한 거래처를 직원 각자 PC의 자동기장 실행기가 위하고에서 처리한다.
 * 범위는 기장대리 목록과 동일(본인 + 소속 직원), 계약중 · 위하고 거래처만.
 */
export default async function AutobookPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const currentYM = kstToday().slice(0, 7);
  // 기준 = N월분(기장 대상 월). 기본은 전월분: 9월 매입자료는 10월 중순 이후 열리므로 10월엔 9월분을 처리 (월기장 보드와 같음)
  const defaultFocus = addMonths(currentYM, -1);
  const focus = params.focus && /^\d{4}-\d{2}$/.test(params.focus) ? params.focus : defaultFocus;
  const year = focus.slice(0, 4);

  const scope = await getClientScopeWhere(session);
  const clientsRaw = await prisma.client.findMany({
    where: { ...scope, contractStatus: "active", accountingProgram: { contains: "위하고" } },
    select: {
      id: true, name: true, clientType: true, bizCategory: true, bizItem: true, wehagoCno: true, driveFolderId: true,
      assignedUser: { select: { name: true } },
      autobookSetting: true,
    },
    orderBy: { name: "asc" },
  });
  const ids = clientsRaw.map(c => c.id);
  const [staffMonths, jobsRaw, alertsRaw, agent] = await Promise.all([
    staffMonthsMap(ids, periodFromFor(focus).slice(0, 7), focus), // 과세기간 시작 달 ~ 기준 달, 급여가 있는 달
    prisma.autobookJob.findMany({
      where: { clientId: { in: ids }, yearMonth: { startsWith: year } },
      orderBy: { id: "asc" },
    }),
    prisma.autobookAlert.findMany({ where: { clientId: { in: ids }, resolvedAt: null }, orderBy: { id: "asc" } }),
    prisma.autobookAgent.findUnique({ where: { userId: session.id } }),
  ]);

  const clients: AbClient[] = clientsRaw.map(c => {
    const s = c.autobookSetting;
    return {
      id: c.id, name: c.name, corporate: c.clientType === "corporate", industry: s?.industry || c.bizItem || c.bizCategory || "",
      assignedUserName: c.assignedUser?.name ?? null, hasCno: !!c.wehagoCno, hasDrive: !!c.driveFolderId,
      setting: {
        staffMonths: staffMonths.get(c.id) ?? [],
        vehicleDeduct: s?.vehicleDeduct ?? false, deemedPurchase: s?.deemedPurchase ?? false,
        foodAccount: (s?.foodAccount as "146" | "830") ?? "146", industry: s?.industry ?? "", memo: s?.memo ?? "",
        configured: !!s,
      },
    };
  });
  const jobs: AbJob[] = jobsRaw.map(j => ({
    id: j.id, clientId: j.clientId, userId: j.userId, yearMonth: j.yearMonth, mode: j.mode, status: j.status, step: j.step,
    steps: JSON.parse(j.steps || "{}"), summary: j.summary ? JSON.parse(j.summary) : null, message: j.message,
    log: JSON.parse(j.log || "[]"), reportName: j.reportName, reportLink: j.reportLink,
    createdAt: j.createdAt.toISOString(), startedAt: j.startedAt?.toISOString() ?? null, finishedAt: j.finishedAt?.toISOString() ?? null,
  }));
  const alerts: AbAlert[] = alertsRaw.map(a => ({ id: a.id, jobId: a.jobId, clientId: a.clientId, kind: a.kind, date: a.date, trade: a.trade, amount: a.amount, note: a.note }));

  return (
    <div className="flex flex-col h-full min-h-0">
      <AutobookBoard
        clients={clients}
        jobs={jobs}
        alerts={alerts}
        focus={focus}
        defaultFocus={defaultFocus}
        readonly={session.role === "readonly"}
        agent={agent ? {
          connected: true,
          online: !!agent.lastSeenAt && Date.now() - agent.lastSeenAt.getTime() < AGENT_ONLINE_MS,
          lastSeenAt: agent.lastSeenAt?.toISOString() ?? null, machine: agent.machine, version: agent.version,
          wehagoLoggedIn: agent.wehagoLoggedIn, schedule: parseSchedule(agent.schedule),
        } : null}
      />
    </div>
  );
}
