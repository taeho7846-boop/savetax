import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientScopeWhere, normalizeBizNumber } from "@/lib/client-scope";
import { SEMO_LEDGER_RUN_KEY as RUN_KEY, type SemoLedgerRun } from "@/lib/semo-ledger";

/**
 * 세모리포트 '고객 매입매출장' 월별 요약 가져오기.
 * 크롬 확장(content-semoreport.js)이 세모리포트 JSON을 거래처별로 읽어 여기로 보낸다.
 *
 *  POST { phase: "start",  total, years }                 — 수집 시작(진행 상태 초기화)
 *  POST { phase: "batch",  clients: [{ name, bizNo, semoKey, rows: [{ yearMonth, ...세모 필드 }] }] }
 *  POST { phase: "finish", error? }                       — 수집 종료
 *  GET                                                     — 마지막 수집 상태 + 저장 현황
 *
 * 진행 상태는 AppConfig(semoLedger:run) 한 줄에 JSON으로 두고, 화면이 2초마다 GET으로 읽는다.
 */

type IncomingRow = Record<string, unknown> & { yearMonth: string };
type IncomingClient = { name: string; bizNo: string; semoKey?: string | null; industryCode?: string | null; industryName?: string | null; rows: IncomingRow[] };

function toInt(v: unknown): number {
  if (v == null || v === "" || v === "-") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function toBig(v: unknown): bigint {
  return BigInt(toInt(v));
}
function toFloat(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function readRun(): Promise<SemoLedgerRun | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: RUN_KEY } });
  if (!row) return null;
  try { return JSON.parse(row.value) as SemoLedgerRun; } catch { return null; }
}
async function writeRun(run: SemoLedgerRun) {
  await prisma.appConfig.upsert({
    where: { key: RUN_KEY },
    create: { key: RUN_KEY, value: JSON.stringify(run) },
    update: { value: JSON.stringify(run) },
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const [run, agg, latest] = await Promise.all([
    readRun(),
    prisma.semoLedgerMonth.groupBy({ by: ["yearMonth"], _count: { _all: true }, orderBy: { yearMonth: "desc" }, take: 48 }),
    prisma.semoLedgerMonth.findFirst({ orderBy: { collectedAt: "desc" }, select: { collectedAt: true } }),
  ]);
  const clientCount = await prisma.semoLedgerMonth.findMany({ distinct: ["clientId"], select: { clientId: true } });

  return NextResponse.json({
    run,
    stored: {
      clients: clientCount.length,
      months: agg.map(a => ({ yearMonth: a.yearMonth, clients: a._count._all })),
      latestCollectedAt: latest?.collectedAt ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (session.role === "readonly") return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  let body: { phase?: string; total?: number; years?: string[]; clients?: IncomingClient[]; error?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }

  if (body.phase === "start") {
    const run: SemoLedgerRun = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      years: Array.isArray(body.years) ? body.years.map(String) : [],
      total: toInt(body.total),
      done: 0, matched: 0, rows: 0, unmatched: [],
      error: null,
      byUserId: session.id,
    };
    await writeRun(run);
    return NextResponse.json({ ok: true, run });
  }

  if (body.phase === "finish") {
    const run = await readRun();
    if (run) {
      run.finishedAt = new Date().toISOString();
      if (body.error) run.error = String(body.error);
      await writeRun(run);
    }
    return NextResponse.json({ ok: true, run });
  }

  if (body.phase !== "batch" || !Array.isArray(body.clients)) {
    return NextResponse.json({ error: "phase 가 올바르지 않습니다" }, { status: 400 });
  }

  // 매칭 대상: 거래처 목록과 같은 권한 범위. 해지 거래처도 데이터 성격이라 포함(contractStatus 미필터)
  const scope = await getClientScopeWhere(session);
  const dbClients = await prisma.client.findMany({
    where: { ...scope, bizNumber: { not: null } },
    select: { id: true, name: true, bizNumber: true, bizType: true, bizCategory: true },
  });
  const byBiz = new Map<string, { id: number; name: string; bizType: string | null; bizCategory: string | null }>();
  for (const c of dbClients) {
    const b = normalizeBizNumber(c.bizNumber);
    if (b && !byBiz.has(b)) byBiz.set(b, { id: c.id, name: c.name, bizType: c.bizType, bizCategory: c.bizCategory });
  }

  const collectedAt = new Date();
  let matched = 0, rows = 0;
  const unmatched: { name: string; bizNo: string }[] = [];

  for (const c of body.clients) {
    const biz = normalizeBizNumber(c.bizNo);
    const target = biz ? byBiz.get(biz) : undefined;
    if (!target) { unmatched.push({ name: String(c.name ?? ""), bizNo: biz }); continue; }
    matched++;

    // 세모리포트의 업종코드·업태명으로 거래처의 빈 칸만 채운다 (수정 모달에서 입력한 값은 보존)
    const fill: { bizType?: string; bizCategory?: string } = {};
    const code = String(c.industryCode ?? "").trim(), nameKo = String(c.industryName ?? "").trim();
    if (!target.bizType && code) fill.bizType = code;
    if (!target.bizCategory && nameKo) fill.bizCategory = nameKo;
    if (Object.keys(fill).length) {
      await prisma.client.update({ where: { id: target.id }, data: fill }).catch(() => {});
      target.bizType = fill.bizType ?? target.bizType; target.bizCategory = fill.bizCategory ?? target.bizCategory;
    }

    const ops = [];
    for (const r of c.rows || []) {
      const ym = String(r.yearMonth || "");
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;
      // 세모리포트에서 아직 수집 안 된 달(전부 null)은 건너뛴다 — 기존 데이터 유지
      const hasData = r.TOTL_SALE_CNT != null || r.TOTL_BUY_CNT != null;
      if (!hasData) continue;
      const { yearMonth: _ym, ...detail } = r;
      void _ym;
      const data = {
        saleCount: toInt(r.TOTL_SALE_CNT),
        saleTotal: toBig(r.TOTL_SALE_AMT),
        saleSupply: toBig(r.TOTL_SALE_SPLY_AMT),
        saleVat: toBig(r.TOTL_SALE_VAT_AMT),
        buyCount: toInt(r.TOTL_BUY_CNT),
        buyTotal: toBig(r.TOTL_BUY_AMT),
        buySupply: toBig(r.TOTL_BUY_SPLY_AMT),
        buyVat: toBig(r.TOTL_BUY_VAT_AMT),
        purchasingRate: toFloat(r.PURCHASING_RATE),
        detail: JSON.stringify(detail),
        semoBzaqKey: c.semoKey ? String(c.semoKey) : null,
        collectedAt,
      };
      ops.push(prisma.semoLedgerMonth.upsert({
        where: { clientId_yearMonth: { clientId: target.id, yearMonth: ym } },
        create: { clientId: target.id, yearMonth: ym, ...data },
        update: data,
      }));
    }
    if (ops.length) { await prisma.$transaction(ops); rows += ops.length; }
  }

  const run = await readRun();
  if (run && !run.finishedAt) {
    run.done += body.clients.length;
    run.matched += matched;
    run.rows += rows;
    run.unmatched.push(...unmatched);
    await writeRun(run);
  }

  return NextResponse.json({ ok: true, matched, rows, unmatched: unmatched.length });
}
