import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCloseCheckProgress, setCloseCheckProgress } from "@/lib/efile-jobs";

// 원천세 자동신고 — 위하고 마감상태 수신/조회
//
// POST /api/withholding/filing/close-check
//   크롬 확장이 위하고 전자신고 화면(SWER0101 원천세 / SWER0109 지방소득세)을 조회한 결과를 보낸다.
//   { kind: "income"|"local", payYm: "202609", rows: [{ cno, ccode, name, reportType, attribYm, payYm, amount, keyClose, singo }],
//     scopeCnos?: [cno] }   ← 실제로 조회한 수임처 목록. 있으면 그 안에서 목록에 없는 거래처만 미마감 처리
//   → 거래처(wehagoCno)와 매칭해 WithholdingFiling upsert.
//
// GET  /api/withholding/filing/close-check?ym=2026-09           → kind별 마지막 조회 시각·마감 건수·진행 상황 (원천세 탭 폴링용)
// GET  /api/withholding/filing/close-check?ym=2026-09&scope=1   → 확장용: 로그인 사용자 관할 거래처의 위하고 cno 목록 (조회 범위 축소)
// PATCH /api/withholding/filing/close-check { kind, payYm, progress: { state, done, total, closed, message } } → 확장이 진행 상황 보고

type Row = {
  cno?: string | null; ccode?: string | null; name?: string | null; reportType?: string | null;
  attribYm?: string | null; payYm?: string | null; amount?: number | string | null; keyClose?: number | null; singo?: string | null;
};

function toYearMonth(payYm: string) { return `${payYm.slice(0, 4)}-${payYm.slice(4, 6)}`; }

// 원천세 탭과 같은 관할 필터 (매니저: 본인+직원 담당, 직원: 담당/부담당)
async function scopeFilter(session: { id: number; role: string }) {
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  if (!isManager) return { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
  const employees = await prisma.user.findMany({ where: { managerId: session.id, isActive: true }, select: { id: true } });
  return { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const payYm = String(body?.payYm || "");
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
  const scopeCnos: string[] | null = Array.isArray(body?.scopeCnos) ? body.scopeCnos.map(String) : null;
  if ((kind !== "income" && kind !== "local") || !/^\d{6}$/.test(payYm)) {
    return NextResponse.json({ ok: false, error: "kind(income|local), payYm(YYYYMM) 필요" }, { status: 400 });
  }
  const yearMonth = toYearMonth(payYm);
  const now = new Date();

  // 위하고 연동된 모든 거래처 (마감 여부는 사무실 공통 사실이라 담당자 구분 없이 반영)
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, wehagoCno: { not: null } },
    select: { id: true, name: true, wehagoCno: true },
  });
  const byCno = new Map<string, typeof clients[number]>();
  for (const c of clients) if (c.wehagoCno) byCno.set(c.wehagoCno, c);

  const closedClientIds = new Set<number>();
  const unmatched: string[] = [];
  let matched = 0;
  for (const r of rows) {
    const client = byCno.get(String(r.cno || ""));
    if (!client) { unmatched.push(String(r.name || r.cno)); continue; }
    const amountNum = r.amount == null || r.amount === "" ? null : Math.round(Number(r.amount));
    const data = {
      closed: true,
      amount: Number.isFinite(amountNum as number) ? amountNum : null,
      reportType: r.reportType || null,
      attribYm: r.attribYm || null,
      wehagoKey: r.keyClose ?? null,
      checkedAt: now, checkedById: session.id,
    };
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId: client.id, yearMonth, kind } },
      create: { clientId: client.id, yearMonth, kind, ...data },
      update: data,
    });
    closedClientIds.add(client.id);
    matched++;
  }

  // 조회 범위 안에 있는데 목록에 없는 거래처 → 미마감 (제출 완료 상태는 유지, 마감 플래그만 갱신)
  const scope = scopeCnos ? new Set(scopeCnos) : null;
  const notClosed = clients.filter(c => !closedClientIds.has(c.id) && (!scope || scope.has(c.wehagoCno!)));
  for (const c of notClosed) {
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId: c.id, yearMonth, kind } },
      create: { clientId: c.id, yearMonth, kind, closed: false, checkedAt: now, checkedById: session.id },
      update: { closed: false, checkedAt: now, checkedById: session.id },
    });
  }
  setCloseCheckProgress(session.id, yearMonth, kind, { state: "done", done: scope ? scope.size : rows.length, total: scope ? scope.size : rows.length, closed: matched, message: `완료 · 마감 ${matched}곳` });
  return NextResponse.json({ ok: true, kind, yearMonth, matched, unmatched, notClosed: notClosed.length });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const ym = req.nextUrl.searchParams.get("ym") || "";
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ ok: false, error: "ym(YYYY-MM) 필요" }, { status: 400 });

  if (req.nextUrl.searchParams.get("scope") === "1") {
    const where = { isDeleted: false, contractStatus: "active", wehagoCno: { not: null }, AND: [await scopeFilter(session)] };
    const list = await prisma.client.findMany({ where, select: { wehagoCno: true, withholdingType: true } });
    // D(1인사업자)는 원천세가 없으니 제외
    const cnos = list.filter(c => c.withholdingType !== "D").map(c => c.wehagoCno!);
    return NextResponse.json({ ok: true, cnos });
  }

  const result: Record<string, unknown> = {};
  for (const kind of ["income", "local"]) {
    const latest = await prisma.withholdingFiling.findFirst({ where: { yearMonth: ym, kind }, orderBy: { checkedAt: "desc" }, select: { checkedAt: true } });
    const closedCount = await prisma.withholdingFiling.count({ where: { yearMonth: ym, kind, closed: true } });
    result[kind] = { checkedAt: latest?.checkedAt?.toISOString() ?? null, closedCount, progress: getCloseCheckProgress(session.id, ym, kind) };
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const payYm = String(body?.payYm || "");
  if ((kind !== "income" && kind !== "local") || !/^\d{6}$/.test(payYm)) {
    return NextResponse.json({ ok: false, error: "kind, payYm 필요" }, { status: 400 });
  }
  const p = body?.progress || {};
  setCloseCheckProgress(session.id, toYearMonth(payYm), kind, {
    state: p.state || "running", done: Number(p.done || 0), total: Number(p.total || 0), closed: Number(p.closed || 0), message: String(p.message || ""),
  });
  return NextResponse.json({ ok: true });
}
