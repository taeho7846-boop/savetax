import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookkeepingTable } from "./BookkeepingTable";
import { OneoffTable } from "./OneoffTable";
import { RefundTable } from "./RefundTable";

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearMonth = params.ym || defaultYM;
  const tab = params.tab || "bookkeeping";
  const [year, mon] = yearMonth.split("-");

  function changeMonth(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  if (tab === "refund") {
    const refunds = await prisma.settlementRefund.findMany({
      where: { yearMonth },
      orderBy: { createdAt: "asc" },
    });

    return (
      <div>
        <Header year={year} mon={mon} yearMonth={yearMonth} tab={tab} prevYM={changeMonth(-1)} nextYM={changeMonth(1)} />
        <RefundTable items={refunds} yearMonth={yearMonth} />
      </div>
    );
  }

  if (tab === "oneoff") {
    const oneoffs = await prisma.settlementOneoff.findMany({
      where: { yearMonth },
      orderBy: { createdAt: "asc" },
    });

    return (
      <div>
        <Header year={year} mon={mon} yearMonth={yearMonth} tab={tab} prevYM={changeMonth(-1)} nextYM={changeMonth(1)} />
        <OneoffTable items={oneoffs} yearMonth={yearMonth} />
      </div>
    );
  }

  // 기장 탭: 독립형 레코드 조회
  const bookkeepings = await prisma.settlementBookkeeping.findMany({
    orderBy: { clientName: "asc" },
  });

  return (
    <div>
      <Header year={year} mon={mon} yearMonth={yearMonth} tab={tab} prevYM={changeMonth(-1)} nextYM={changeMonth(1)} />
      <BookkeepingTable rows={bookkeepings} yearMonth={yearMonth} />
    </div>
  );
}

function Header({ year, mon, yearMonth, tab, prevYM, nextYM }: {
  year: string; mon: string; yearMonth: string; tab: string; prevYM: string; nextYM: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight">Savetax 정산</h1>
        <div className="flex items-center gap-2 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-1 py-1">
          <Link href={`/settlement?ym=${prevYM}&tab=${tab}`} className="px-2 py-1 text-[#6B7684] hover:text-[#191F28] hover:bg-[#F2F4F6] rounded text-sm">◀</Link>
          <span className="text-sm font-medium text-[#191F28] min-w-[100px] text-center">{year}년 {parseInt(mon)}월</span>
          <Link href={`/settlement?ym=${nextYM}&tab=${tab}`} className="px-2 py-1 text-[#6B7684] hover:text-[#191F28] hover:bg-[#F2F4F6] rounded text-sm">▶</Link>
        </div>
      </div>
      <div className="flex gap-1 mb-6 border-b border-[#E5E8EB]">
        <Link
          href={`/settlement?ym=${yearMonth}&tab=bookkeeping`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "bookkeeping"
              ? "border-[#3182F6] text-[#191F28]"
              : "border-transparent text-[#6B7684] hover:text-[#333D4B]"
          }`}
        >
          기장
        </Link>
        <Link
          href={`/settlement?ym=${yearMonth}&tab=oneoff`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "oneoff"
              ? "border-[#3182F6] text-[#191F28]"
              : "border-transparent text-[#6B7684] hover:text-[#333D4B]"
          }`}
        >
          단건
        </Link>
        <Link
          href={`/settlement?ym=${yearMonth}&tab=refund`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "refund"
              ? "border-[#3182F6] text-[#191F28]"
              : "border-transparent text-[#6B7684] hover:text-[#333D4B]"
          }`}
        >
          환불
        </Link>
      </div>
    </>
  );
}
