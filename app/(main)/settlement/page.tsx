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

  // 기장 탭: 독립형 레코드 + 해당 월 체크 병합
  const bookkeepings = await prisma.settlementBookkeeping.findMany({
    orderBy: { clientName: "asc" },
  });
  const monthChecks = await prisma.settlementBookkeepingCheck.findMany({
    where: { yearMonth },
  });
  const checkMap = new Map(monthChecks.map((c) => [c.bookkeepingId, c]));
  const bookkeepingRows = bookkeepings.map((b) => {
    const chk = checkMap.get(b.id);
    return {
      ...b,
      withdrawn: chk?.withdrawn ?? false,
      remitted: chk?.remitted ?? false,
      tiIssued: chk?.tiIssued ?? false,
    };
  });

  return (
    <div>
      <Header year={year} mon={mon} yearMonth={yearMonth} tab={tab} prevYM={changeMonth(-1)} nextYM={changeMonth(1)} />
      <BookkeepingTable rows={bookkeepingRows} yearMonth={yearMonth} />
    </div>
  );
}

function Header({ year, mon, yearMonth, tab, prevYM, nextYM }: {
  year: string; mon: string; yearMonth: string; tab: string; prevYM: string; nextYM: string;
}) {
  return (
    <>
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">{year}년 {parseInt(mon)}월 정산</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">Savetax 정산</h1>
        </div>
        <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
          <Link href={`/settlement?ym=${prevYM}&tab=${tab}`} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</Link>
          <span className="text-[13px] font-bold text-[#191F28] min-w-[90px] text-center">{year}년 {parseInt(mon)}월</span>
          <Link href={`/settlement?ym=${nextYM}&tab=${tab}`} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</Link>
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <Link
          href={`/settlement?ym=${yearMonth}&tab=bookkeeping`}
          className={`px-4 py-2 rounded-xl text-[12.5px] font-bold transition ${
            tab === "bookkeeping"
              ? "text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] shadow-md shadow-[#3182F6]/30"
              : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          기장
        </Link>
        <Link
          href={`/settlement?ym=${yearMonth}&tab=oneoff`}
          className={`px-4 py-2 rounded-xl text-[12.5px] font-bold transition ${
            tab === "oneoff"
              ? "text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] shadow-md shadow-[#3182F6]/30"
              : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          단건
        </Link>
        <Link
          href={`/settlement?ym=${yearMonth}&tab=refund`}
          className={`px-4 py-2 rounded-xl text-[12.5px] font-bold transition ${
            tab === "refund"
              ? "text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] shadow-md shadow-[#3182F6]/30"
              : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          환불
        </Link>
      </div>
    </>
  );
}
