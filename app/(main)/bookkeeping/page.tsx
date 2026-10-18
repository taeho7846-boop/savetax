import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientScopeWhere } from "@/lib/client-scope";
import { getBookkeepingTargetDay } from "@/app/actions/bookkeeping";
import { kstToday, addMonths } from "@/lib/bookkeeping";
import { BookkeepingBoard } from "./BookkeepingBoard";

/**
 * 월기장 보드 — 거래처 × 기장 대상 월 매트릭스.
 * 범위는 기장대리 목록과 동일(본인 + 소속 직원), 계약중 거래처만.
 */
export default async function BookkeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; focus?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = kstToday();
  const currentYM = today.slice(0, 7);
  // 기본 기준월 = 전월분 (이번 달에 작업하는 기장 대상 월)
  const defaultFocus = addMonths(currentYM, -1);
  const focus = params.focus && /^\d{4}-\d{2}$/.test(params.focus) ? params.focus : defaultFocus;
  const year = params.year ? parseInt(params.year) : parseInt(focus.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const scope = await getClientScopeWhere(session);
  const [clientsRaw, targetDay] = await Promise.all([
    prisma.client.findMany({
      where: { ...scope, contractStatus: "active" },
      select: {
        id: true, name: true, clientType: true, affiliation: true, accountingProgram: true,
        assignedUserId: true, subAssignedUserId: true,
        assignedUser: { select: { name: true } },
        bookkeepingMonths: {
          where: { yearMonth: { gte: months[0], lte: months[11] } },
          select: { yearMonth: true, stage: true, memo: true, updatedAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    getBookkeepingTargetDay(),
  ]);

  const userNames = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameById = new Map(userNames.map(u => [u.id, u.name]));

  const clients = clientsRaw.map(c => ({
    id: c.id,
    name: c.name,
    clientType: c.clientType,
    affiliation: c.affiliation,
    accountingProgram: c.accountingProgram,
    assignedUserName: c.assignedUser?.name ?? null,
    subAssignedUserName: c.subAssignedUserId != null ? nameById.get(c.subAssignedUserId) ?? null : null,
    months: Object.fromEntries(c.bookkeepingMonths.map(m => [m.yearMonth, { stage: m.stage, memo: m.memo, updatedAt: m.updatedAt.toISOString() }])),
  }));

  const canEditTarget = ["owner", "admin", "accountant"].includes(session.role);

  return (
    <div className="flex flex-col h-full">
      <BookkeepingBoard
        clients={clients}
        months={months}
        year={year}
        focus={focus}
        currentYM={currentYM}
        today={today}
        targetDay={targetDay}
        canEditTarget={canEditTarget}
        readonly={session.role === "readonly"}
      />
    </div>
  );
}
