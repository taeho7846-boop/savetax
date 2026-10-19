import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getClientScopeWhere } from "@/lib/client-scope";
import { parseLedgerDetail, type LedgerDetailMonth } from "@/lib/semo-ledger";
import { kstToday } from "@/lib/bookkeeping";

/**
 * GET /api/clients/[id]/ledger — 거래처 한 곳의 세모리포트 월별 매출·매입 전체(증빙 유형별 포함).
 * 거래처 프로필 > 매출·매입 상세 모달(ClientLedgerModal)이 쓴다. 권한 범위 밖이면 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const scope = await getClientScopeWhere(session);
  const client = await prisma.client.findFirst({
    where: { id: clientId, isDeleted: false, AND: [scope.AND[0]] },
    select: { id: true, name: true, clientType: true, taxationType: true },
  });
  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없거나 권한 범위 밖입니다" }, { status: 404 });

  const rows = await prisma.semoLedgerMonth.findMany({
    where: { clientId },
    orderBy: { yearMonth: "asc" },
    select: {
      yearMonth: true, saleCount: true, saleSupply: true, saleVat: true, saleTotal: true,
      buyCount: true, buySupply: true, buyVat: true, buyTotal: true, purchasingRate: true, detail: true, collectedAt: true,
    },
  });

  const months: LedgerDetailMonth[] = rows.map(r => {
    const { sale, buy } = parseLedgerDetail(r.detail);
    return {
      yearMonth: r.yearMonth,
      saleCount: r.saleCount, saleSupply: Number(r.saleSupply), saleVat: Number(r.saleVat), saleTotal: Number(r.saleTotal),
      buyCount: r.buyCount, buySupply: Number(r.buySupply), buyVat: Number(r.buyVat), buyTotal: Number(r.buyTotal),
      purchasingRate: r.purchasingRate, sale, buy, collectedAt: r.collectedAt.toISOString(),
    };
  });

  return NextResponse.json(
    { today: kstToday(), client: { id: client.id, name: client.name, clientType: client.clientType, taxationType: client.taxationType }, months },
    { headers: { "Cache-Control": "no-store" } },
  );
}
