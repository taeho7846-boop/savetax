import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookkeepingTable } from "./BookkeepingTable";
import { OneoffTable } from "./OneoffTable";

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
        <h1 className="text-xl font-bold text-gray-900">Savetax 정산</h1>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <Link href={`/settlement?ym=${prevYM}&tab=${tab}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">◀</Link>
          <span className="text-sm font-medium text-gray-800 min-w-[100px] text-center">{year}년 {parseInt(mon)}월</span>
          <Link href={`/settlement?ym=${nextYM}&tab=${tab}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">▶</Link>
        </div>
      </div>
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          href={`/settlement?ym=${yearMonth}&tab=bookkeeping`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "bookkeeping"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          기장
        </Link>
        <Link
          href={`/settlement?ym=${yearMonth}&tab=oneoff`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "oneoff"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          단건
        </Link>
      </div>
    </>
  );
}
