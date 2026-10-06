import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 원천세 자동신고 — 위하고 마감상태 수신/조회
//
// POST /api/withholding/filing/close-check
//   크롬 확장이 위하고 전자신고 화면(SWER0101 원천세 / SWER0109 지방소득세)을 조회한 결과를 보낸다.
//   { kind: "income"|"local", payYm: "202609", rows: [{ cno, ccode, name, reportType, attribYm, payYm, amount, keyClose, singo }] }
//   → 거래처(wehagoCno/wehagoCdCom)와 매칭해 WithholdingFiling upsert. 목록에 없는 연동 거래처는 closed=false.
//
// GET /api/withholding/filing/close-check?ym=2026-09
//   kind별 마지막 조회 시각 + 마감 건수 (원천세 탭 폴링용)

type Row = {
  cno?: string | null;
  ccode?: string | null;
  name?: string | null;
  reportType?: string | null;
  attribYm?: string | null;
  payYm?: string | null;
  amount?: number | string | null;
  keyClose?: number | null;
  singo?: string | null;
};

function toYearMonth(payYm: string) {
  return `${payYm.slice(0, 4)}-${payYm.slice(4, 6)}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const payYm = String(body?.payYm || "");
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
  if ((kind !== "income" && kind !== "local") || !/^\d{6}$/.test(payYm)) {
    return NextResponse.json({ ok: false, error: "kind(income|local), payYm(YYYYMM) 필요" }, { status: 400 });
  }
  const yearMonth = toYearMonth(payYm);
  const now = new Date();

  // 위하고 연동된 모든 거래처 (마감 여부는 사무실 공통 사실이라 담당자 구분 없이 반영)
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, wehagoCno: { not: null } },
    select: { id: true, name: true, wehagoCno: true, wehagoCdCom: true },
  });
  const byCno = new Map<string, typeof clients[number]>();
  for (const c of clients) if (c.wehagoCno) byCno.set(c.wehagoCno, c);

  const closedClientIds = new Set<number>();
  const unmatched: string[] = [];
  let matched = 0;

  for (const r of rows) {
    const cno = String(r.cno || "");
    const client = byCno.get(cno);
    if (!client) { unmatched.push(String(r.name || cno)); continue; }
    // 반기 업체 등 지급월이 조회월과 다른 행이 섞일 수 있어 지급월은 조회 기준(payYm)으로 고정
    const amountNum = r.amount == null || r.amount === "" ? null : Math.round(Number(r.amount));
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId: client.id, yearMonth, kind } },
      create: {
        clientId: client.id, yearMonth, kind,
        closed: true,
        amount: Number.isFinite(amountNum as number) ? amountNum : null,
        reportType: r.reportType || null,
        attribYm: r.attribYm || null,
        wehagoKey: r.keyClose ?? null,
        checkedAt: now, checkedById: session.id,
      },
      update: {
        closed: true,
        amount: Number.isFinite(amountNum as number) ? amountNum : null,
        reportType: r.reportType || null,
        attribYm: r.attribYm || null,
        wehagoKey: r.keyClose ?? null,
        checkedAt: now, checkedById: session.id,
      },
    });
    closedClientIds.add(client.id);
    matched++;
  }

  // 목록에 없는 연동 거래처 → 미마감으로 표시 (제출 완료된 건은 상태 유지, 마감 플래그만 갱신)
  const notClosed = clients.filter(c => !closedClientIds.has(c.id));
  for (const c of notClosed) {
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId: c.id, yearMonth, kind } },
      create: { clientId: c.id, yearMonth, kind, closed: false, checkedAt: now, checkedById: session.id },
      update: { closed: false, checkedAt: now, checkedById: session.id },
    });
  }

  return NextResponse.json({ ok: true, kind, yearMonth, matched, unmatched, notClosed: notClosed.length });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const ym = req.nextUrl.searchParams.get("ym") || "";
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ ok: false, error: "ym(YYYY-MM) 필요" }, { status: 400 });

  const result: Record<string, { checkedAt: string | null; closedCount: number }> = {};
  for (const kind of ["income", "local"]) {
    const latest = await prisma.withholdingFiling.findFirst({
      where: { yearMonth: ym, kind },
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true },
    });
    const closedCount = await prisma.withholdingFiling.count({ where: { yearMonth: ym, kind, closed: true } });
    result[kind] = { checkedAt: latest?.checkedAt?.toISOString() ?? null, closedCount };
  }
  return NextResponse.json({ ok: true, ...result });
}
