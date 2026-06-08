import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReceivablesTable } from "./ReceivablesTable";
import { CmsTable } from "./CmsTable";

/** 해당 연도 12개월 전부 반환 (미래 포함) */
function getMonthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
}

/** firstWithdrawalMonth 부터 currentYM 까지 모든 월 */
function getAllMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentYM = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = params.year ? parseInt(params.year) : currentYear;
  const q = params.q ?? "";

  const months12 = getMonthsOfYear(year); // 항상 1~12월

  // 세무사/관리자: 본인 + 소속 직원 거래처
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 최초 출금월 + 기장료가 설정된 고객사 + 모든 수납 기록
  const rawClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(q && { name: { contains: q } }),
    },
    include: {
      feeRecords: true, // 전체 기간
    },
    orderBy: { name: "asc" },
  });

  // 누적 요약 계산 (전체 기간)
  let totalExpected = 0;
  let totalPaid = 0;

  const clients = rawClients.map((c) => {
    const allMonths = getAllMonths(c.firstWithdrawalMonth!, currentYM);
    const expected = (c.monthlyFee ?? 0) * allMonths.length;
    const paidCount = c.feeRecords.filter(
      (r) => r.status === "paid" && r.yearMonth >= c.firstWithdrawalMonth! && r.yearMonth <= currentYM
    ).length;
    const paid = (c.monthlyFee ?? 0) * paidCount;
    const unpaid = expected - paid;

    totalExpected += expected;
    totalPaid += paid;

    const allRecords = Object.fromEntries(c.feeRecords.map((r) => [r.yearMonth, r.status]));
    // 해당 연도 기록만 필터
    const yearRecords: Record<string, string> = {};
    months12.forEach((m) => { if (allRecords[m]) yearRecords[m] = allRecords[m]; });

    return {
      id: c.id,
      name: c.name,
      monthlyFee: c.monthlyFee,
      firstWithdrawalMonth: c.firstWithdrawalMonth,
      affiliation: c.affiliation,
      yearRecords,
      cumulativeUnpaid: unpaid,
    };
  });

  const totalUnpaid = totalExpected - totalPaid;

  const tab = params.tab ?? "receivables";

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">RECEIVABLES</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            채권 관리
            <span className="text-[18px] font-bold text-[#3182F6]">{year}년</span>
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1">월별 기장료 수납 · CMS 자동이체 현황</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <Link
          href={`/receivables?year=${year}&tab=receivables`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition flex items-center gap-1.5 ${
            tab === "receivables"
              ? "text-white bg-[#3182F6]"
              : "glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
          }`}
        >
          💰 채권 (월별)
        </Link>
        <Link
          href={`/receivables?year=${year}&tab=cms`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition flex items-center gap-1.5 ${
            tab === "cms"
              ? "text-white bg-[#3182F6]"
              : "glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
          }`}
        >
          ⚡ CMS 자동이체
        </Link>
      </div>

      {tab === "cms" ? (
        <CmsTab sessionId={session.id} role={session.role} />
      ) : (
      <>
      {/* 연도 네비게이션 + 검색 (글래스 카드) */}
      <div className="glass rounded-3xl p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 glass-strong rounded-2xl px-1 h-10">
          <Link
            href={`/receivables?year=${year - 1}&tab=receivables`}
            className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
          >
            ◀
          </Link>
          <span className="text-[13px] font-bold text-[#191F28] min-w-[64px] text-center">{year}년</span>
          <Link
            href={`/receivables?year=${year + 1}&tab=receivables`}
            className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
          >
            ▶
          </Link>
        </div>

        <form className="flex-1 flex gap-2 min-w-[220px]">
          <input type="hidden" name="year" value={year} />
          <div className="flex-1 bg-white/80 rounded-2xl flex items-center gap-2 px-4 h-10">
            <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
            <input
              name="q"
              defaultValue={q}
              placeholder="고객사명 검색"
              autoComplete="off"
              className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#3182F6] text-white text-[13px] font-bold px-5 h-10 rounded-2xl hover:bg-[#1B64DA] transition-colors"
          >
            검색
          </button>
          {q && (
            <Link
              href={`/receivables?year=${year}`}
              className="glass-strong text-[#4E5968] text-[13px] font-bold px-4 h-10 rounded-2xl flex items-center"
            >
              초기화
            </Link>
          )}
        </form>
      </div>

      <ReceivablesTable
        clients={clients}
        months={months12}
        currentYM={currentYM}
        summary={{ totalExpected, totalPaid, totalUnpaid }}
      />

      {clients.length === 0 && (
        <p className="text-center text-sm text-[#8B95A1] mt-4">
          고객사 수정에서 <strong>월 기장료</strong>와 <strong>최초 출금월</strong>을 입력하면 여기에 표시됩니다.
        </p>
      )}
      </>
      )}
    </div>
  );
}

async function CmsTab({ sessionId, role }: { sessionId: number; role: string }) {
  const isManager = role === "accountant" || role === "admin" || role === "owner";
  let assignedFilter: any = { assignedUserId: sessionId };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: sessionId, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [sessionId, ...employees.map(e => e.id)] } };
  }

  const cmsClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: "active",
      ...assignedFilter,
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      ceoName: true,
      monthlyFee: true,
      firstWithdrawalMonth: true,
      cmsStatus: true,
      bankName: true,
      bankAccount: true,
      affiliation: true,
    },
    orderBy: { name: "asc" },
  });

  return <CmsTable clients={cmsClients} />;
}
