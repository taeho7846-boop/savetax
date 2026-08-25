import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SavetaxReceivablesTable } from "./SavetaxReceivablesTable";
import { CollectionBoard } from "./CollectionBoard";
import { lastBillableMonth, dueDayOfMonth } from "@/lib/withdrawal";

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

export default async function SavetaxReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; q?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // 세무사 전용 (대표 + 세무사). 직원·외부 차단.
  if (!(session.role === "owner" || session.role === "accountant")) redirect("/dashboard");

  const params = await searchParams;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentYM = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = params.year ? parseInt(params.year) : currentYear;
  const q = params.q ?? "";
  const tab = params.tab ?? "receivables";

  const months12 = getMonthsOfYear(year); // 항상 1~12월

  // 세이브택스 소속 거래처 전체 (모든 세무사) — 담당 세무사 + 추심 컨택 이력 함께 조회
  const rawClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      affiliation: "세이브택스",
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(q && tab !== "collection" && { name: { contains: q } }),
    },
    include: {
      feeRecords: true, // 전체 기간
      assignedUser: {
        select: { name: true, role: true, manager: { select: { name: true } } },
      },
      collectionContacts: { orderBy: { contactedAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  const clients = rawClients.map((c) => {
    // 출금일이 아직 안 지난 당월은 미수로 잡지 않는다 (출금일 다음날부터 미수)
    const billableEnd = lastBillableMonth(c, now);
    // 해지 거래처는 해지월(마지막 청구월)까지만 채권 집계. 미설정 시 청구 가능월까지.
    const isTerminated = c.contractStatus !== "active";
    const endMonth = isTerminated && c.terminationMonth
      ? (c.terminationMonth < billableEnd ? c.terminationMonth : billableEnd)
      : billableEnd;

    const allMonths = getAllMonths(c.firstWithdrawalMonth!, endMonth);
    const expected = (c.monthlyFee ?? 0) * allMonths.length;
    const paidCount = c.feeRecords.filter(
      (r) => r.status === "paid" && r.yearMonth >= c.firstWithdrawalMonth! && r.yearMonth <= endMonth
    ).length;
    const paid = (c.monthlyFee ?? 0) * paidCount;
    const unpaid = expected - paid;

    const allRecords = Object.fromEntries(c.feeRecords.map((r) => [r.yearMonth, r.status]));
    // 해당 연도 기록만 필터
    const yearRecords: Record<string, string> = {};
    months12.forEach((m) => { if (allRecords[m]) yearRecords[m] = allRecords[m]; });

    // 담당 세무사: 담당자가 직원이면 상위 세무사(매니저) 이름, 아니면 본인 이름
    const au = c.assignedUser;
    const accountantName = au
      ? (au.role === "employee" && au.manager ? au.manager.name : au.name)
      : "미배정";

    return {
      id: c.id,
      name: c.name,
      monthlyFee: c.monthlyFee,
      firstWithdrawalMonth: c.firstWithdrawalMonth,
      accountantName,
      yearRecords,
      cumulativeUnpaid: unpaid,
      contractStatus: c.contractStatus,
      terminationMonth: isTerminated ? c.terminationMonth : null,
      billableEndMonth: billableEnd,
      dueDay: dueDayOfMonth(c, currentYM),
      contacts: c.collectionContacts.map((ct) => ({
        id: ct.id,
        contactedAt: ct.contactedAt.toISOString(),
        result: ct.result,
        promiseDate: ct.promiseDate,
        memo: ct.memo,
      })),
    };
  });

  // 미수 특별관리 탭: 미수금 있는 거래처만
  const collectionClients = clients
    .filter((c) => c.cumulativeUnpaid > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      accountantName: c.accountantName,
      cumulativeUnpaid: c.cumulativeUnpaid,
      contractStatus: c.contractStatus,
      terminationMonth: c.terminationMonth,
      contacts: c.contacts,
    }));

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">SAVETAX RECEIVABLES</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            세이브택스 채권관리
            {tab !== "collection" && <span className="text-[18px] font-bold text-[#3182F6]">{year}년</span>}
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1">세무사 전체 · 세이브택스 소속 거래처 통합 채권 현황</div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        <Link
          href={`/savetax-receivables?year=${year}&tab=receivables`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition flex items-center gap-1.5 ${
            tab !== "collection"
              ? "text-white bg-[#3182F6]"
              : "glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
          }`}
        >
          💰 채권 (월별)
        </Link>
        <Link
          href={`/savetax-receivables?tab=collection`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition flex items-center gap-1.5 ${
            tab === "collection"
              ? "text-white bg-[#3182F6]"
              : "glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
          }`}
        >
          📞 미수 특별관리
          {collectionClients.length > 0 && (
            <span className={`text-[11px] rounded-full px-1.5 ${tab === "collection" ? "bg-white/25" : "bg-[#FEE2E2] text-[#DC2626]"}`}>
              {collectionClients.length}
            </span>
          )}
        </Link>
      </div>

      {tab === "collection" ? (
        <CollectionBoard clients={collectionClients} />
      ) : (
        <>
          {/* 연도 네비게이션 + 검색 (글래스 카드) */}
          <div className="glass rounded-3xl p-3 mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 glass-strong rounded-2xl px-1 h-10">
              <Link
                href={`/savetax-receivables?year=${year - 1}`}
                className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
              >
                ◀
              </Link>
              <span className="text-[13px] font-bold text-[#191F28] min-w-[64px] text-center">{year}년</span>
              <Link
                href={`/savetax-receivables?year=${year + 1}`}
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
                  href={`/savetax-receivables?year=${year}`}
                  className="glass-strong text-[#4E5968] text-[13px] font-bold px-4 h-10 rounded-2xl flex items-center"
                >
                  초기화
                </Link>
              )}
            </form>
          </div>

          <SavetaxReceivablesTable
            clients={clients}
            months={months12}
            currentYM={currentYM}
          />

          {clients.length === 0 && (
            <p className="text-center text-sm text-[#8B95A1] mt-4">
              세이브택스 소속이면서 <strong>월 기장료</strong>와 <strong>최초 출금월</strong>이 입력된 거래처가 없습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
