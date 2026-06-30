import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SupplyTable } from "../settlement/SupplyTable";
import { SUPPLY_PEOPLE, parseParticipants } from "@/lib/settlement-supply";

export default async function SupplySettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearMonth = params.ym || defaultYM;
  const [year, mon] = yearMonth.split("-");

  function changeMonth(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const prevYM = changeMonth(-1);
  const nextYM = changeMonth(1);

  const [supplies, settledRows] = await Promise.all([
    prisma.settlementSupply.findMany({
      where: { yearMonth },
      orderBy: { createdAt: "asc" },
    }),
    prisma.settlementSupplySettled.findMany({ where: { yearMonth } }),
  ]);
  const items = supplies.map((s) => ({
    id: s.id,
    item: s.item,
    amount: s.amount,
    payer: s.payer,
    channel: s.channel,
    participants: parseParticipants(s.participants),
  }));
  const settledMap: Record<string, boolean> = {};
  for (const p of SUPPLY_PEOPLE) settledMap[p] = false;
  for (const r of settledRows) settledMap[r.person] = r.settled;

  return (
    <div>
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">{year}년 {parseInt(mon)}월 정산</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">비품정산</h1>
        </div>
        <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
          <Link href={`/supply-settlement?ym=${prevYM}`} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</Link>
          <span className="text-[13px] font-bold text-[#191F28] min-w-[90px] text-center">{year}년 {parseInt(mon)}월</span>
          <Link href={`/supply-settlement?ym=${nextYM}`} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</Link>
        </div>
      </div>
      <SupplyTable items={items} yearMonth={yearMonth} settledMap={settledMap} />
    </div>
  );
}
