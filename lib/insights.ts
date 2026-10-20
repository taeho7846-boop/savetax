import { prisma } from "@/lib/prisma";
import { getClientScopeWhere } from "@/lib/client-scope";

/**
 * 거래처 인사이트 — 거래처 전체를 한 표로. 거래처 프로필(한 곳)과 같은 데이터를 가로로 펼친다.
 *
 * 1차 규칙: 성실신고확인대상 달성률
 *  - 업종 그룹별 기준수입금액: A 15억(도소매·농림어업·부동산매매 등) / B 7.5억(제조·건설·음식숙박·운수·정보통신 등) / C 5억(서비스·임대·전문직 등)
 *  - 연간 달성률 = 올해 누적 매출(세모리포트 공급가액, 지난달까지) ÷ 기준
 *  - 월 달성률  = 월평균 매출 ÷ (기준 ÷ 12)  → 100% 넘으면 이 속도면 연말에 기준을 넘는다는 뜻
 *  - 그룹은 거래처에 지정(Client.sincereGroup)한 값이 우선, 없으면 업태·종목·업종코드로 추정
 */

export type { SincereGroup, InsightRow, InsightsData } from "@/lib/insights-types";
export { SINCERE_GROUPS, guessSincereGroup } from "@/lib/insights-types";
import { SINCERE_GROUPS, guessSincereGroup, type InsightRow, type InsightsData } from "@/lib/insights-types";

type SessionLike = { id: number; role: string };

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function getClientInsights(session: SessionLike, today: string): Promise<InsightsData> {
  const scope = await getClientScopeWhere(session);
  const thisMonth = today.slice(0, 7);
  const through = prevMonth(thisMonth);               // 지난달까지
  const year = parseInt(through.slice(0, 4));         // 1월이면 작년이 '올해 누적' 기준
  const periodMonths = parseInt(through.slice(5, 7));
  const from = `${year}-01`;
  const prevFrom = `${year - 1}-01`, prevTo = `${year - 1}-${through.slice(5, 7)}`;

  const clients = await prisma.client.findMany({
    where: { ...scope, contractStatus: "active" },
    select: {
      id: true, name: true, clientType: true, bizCategory: true, bizItem: true, bizType: true, sincereGroup: true,
      assignedUser: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const ids = clients.map(c => c.id);
  if (ids.length === 0) return { today, year, throughMonth: through, rows: [] };

  const [ledger, payroll] = await Promise.all([
    prisma.semoLedgerMonth.findMany({
      where: { clientId: { in: ids }, OR: [{ yearMonth: { gte: from, lte: through } }, { yearMonth: { gte: prevFrom, lte: prevTo } }] },
      select: { clientId: true, yearMonth: true, saleSupply: true, buySupply: true },
    }),
    prisma.payrollMonth.findMany({
      where: { clientId: { in: ids }, yearMonth: { gte: from, lte: through } },
      select: { clientId: true, yearMonth: true, gross: true },
    }),
  ]);

  type Acc = { sale: number; buy: number; months: Set<string>; prevSale: number; prevMonths: number; pay: number; payMonths: Set<string> };
  const acc = new Map<number, Acc>();
  const of = (id: number) => { let a = acc.get(id); if (!a) { a = { sale: 0, buy: 0, months: new Set(), prevSale: 0, prevMonths: 0, pay: 0, payMonths: new Set() }; acc.set(id, a); } return a; };
  for (const r of ledger) {
    const a = of(r.clientId);
    if (r.yearMonth >= from) { a.sale += Number(r.saleSupply); a.buy += Number(r.buySupply); a.months.add(r.yearMonth); }
    else { a.prevSale += Number(r.saleSupply); a.prevMonths++; }
  }
  for (const r of payroll) { const a = of(r.clientId); a.pay += Number(r.gross); a.payMonths.add(r.yearMonth); }

  const rows: InsightRow[] = clients.map(c => {
    const a = acc.get(c.id);
    const hasLedger = !!a && a.months.size > 0;
    const dataMonths = a?.months.size ?? 0;
    const set = (c.sincereGroup === "A" || c.sincereGroup === "B" || c.sincereGroup === "C") ? c.sincereGroup : null;
    const guessed = set ? null : guessSincereGroup(c.bizCategory, c.bizItem, c.bizType);
    const group = set ?? guessed;
    const threshold = group ? SINCERE_GROUPS[group].threshold : null;
    const ytdSale = a?.sale ?? 0, ytdBuy = a?.buy ?? 0, ytdPay = a?.pay ?? 0;
    const avgSale = hasLedger ? Math.round(ytdSale / dataMonths) : null;
    const projectedSale = avgSale != null ? avgSale * 12 : null;
    const profit = ytdSale - ytdBuy - ytdPay;
    const isIndiv = c.clientType !== "corporate";
    return {
      id: c.id, name: c.name, clientType: c.clientType, assignedUser: c.assignedUser?.name ?? null,
      bizCategory: c.bizCategory, bizItem: c.bizItem, bizType: c.bizType,
      group, groupSource: set ? "set" : guessed ? "guess" : null, threshold,
      ytdSale, ytdBuy, ytdPay, profit, marginPct: ytdSale > 0 ? Math.round((profit / ytdSale) * 100) : null,
      dataMonths, periodMonths, avgSale, projectedSale,
      annualRate: isIndiv && threshold && hasLedger ? Math.round((ytdSale / threshold) * 1000) / 10 : null,
      paceRate: isIndiv && threshold && avgSale != null ? Math.round((avgSale / (threshold / 12)) * 1000) / 10 : null,
      prevSale: a && a.prevMonths > 0 ? a.prevSale : null,
      saleDeltaPct: a && a.prevMonths > 0 && a.prevSale > 0 ? Math.round(((ytdSale - a.prevSale) / a.prevSale) * 100) : null,
      hasLedger, hasPayroll: !!a && a.payMonths.size > 0,
    };
  });

  return { today, year, throughMonth: through, rows };
}
