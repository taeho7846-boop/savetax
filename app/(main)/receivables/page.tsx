import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReceivablesTable } from "./ReceivablesTable";

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

  // 최초 출금월 + 기장료가 설정된 고객사 + 모든 수납 기록
  const rawClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
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
      yearRecords,
      cumulativeUnpaid: unpaid,
    };
  });

  const totalUnpaid = totalExpected - totalPaid;

  const tab = params.tab ?? "receivables";

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">채권 관리</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          href={`/receivables?year=${year}&tab=receivables`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "receivables"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          채권
        </Link>
        <Link
          href={`/receivables?year=${year}&tab=cms`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "cms"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          CMS
        </Link>
      </div>

      {tab === "cms" ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
          CMS 기능 준비 중
        </div>
      ) : (
      <>
      {/* 연도 네비게이션 */}
      <div className="flex items-center justify-end mb-5">
        <div className="flex items-center gap-2">
          <Link
            href={`/receivables?year=${year - 1}&tab=receivables`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            ← {year - 1}년
          </Link>
          <span className="px-4 py-1.5 text-sm font-bold text-[#1a2e4a] bg-[#f0f4f8] rounded-lg">
            {year}년
          </span>
          <Link
            href={`/receivables?year=${year + 1}&tab=receivables`}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            {year + 1}년 →
          </Link>
        </div>
      </div>

      {/* 검색 */}
      <form className="flex gap-3 mb-5">
        <input type="hidden" name="year" value={year} />
        <input
          name="q"
          defaultValue={q}
          placeholder="고객사명 검색"
          autoComplete="off"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        <button
          type="submit"
          className="bg-gray-100 border border-gray-300 text-gray-800 text-sm px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          검색
        </button>
        {q && (
          <Link
            href={`/receivables?year=${year}`}
            className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            초기화
          </Link>
        )}
      </form>

      <ReceivablesTable
        clients={clients}
        months={months12}
        currentYM={currentYM}
        summary={{ totalExpected, totalPaid, totalUnpaid }}
      />

      {clients.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-4">
          고객사 수정에서 <strong>월 기장료</strong>와 <strong>최초 출금월</strong>을 입력하면 여기에 표시됩니다.
        </p>
      )}
      </>
      )}
    </div>
  );
}
