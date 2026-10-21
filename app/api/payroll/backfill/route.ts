// 과거 인건비 일괄 수집 — 크롬 확장(content-wehago-payroll-year.js)이 위하고 '월별급상여수당지급현황' 응답을 거래처·연도별로 보낸다.
//
//  POST { phase: "start", total, years }                                   — 수집 시작(진행 상태 초기화)
//  POST { phase: "batch", clientId, year, incomeType, overwrite, rows }     — 거래처 한 곳의 1년치
//        근로(salary):   rows: [{ name, code, m01_gross, m01_ded, ... m12_ded }]           (월별급상여수당지급현황)
//        사업(business): rows: [{ name, yearMonth, payDate, gross, incomeTax, localTax, net }] (사업소득조회 지급 건별)
//        일용(daily):    rows: [{ name, yearMonth, gross, incomeTax, localTax, insurance, days }] (일용직근로소득조회 기간별 · 사람×월)
//        partial: "월별을 못 받은 사람 N명 …" — 저장은 하되 실패 목록에도 남긴다
//  POST { phase: "batch", clientId, year, error }                           — 실패 보고 (다음 거래처로 넘어감)
//  POST { phase: "finish" }                                                 — 강제 종료(화면의 '중단')
//  GET                                                                      — 진행 상태
//
// 진행 상태는 AppConfig(payrollBackfill:run) 한 줄에 JSON으로 두고, 화면이 2초마다 GET으로 읽는다.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientScopeWhere } from "@/lib/client-scope";
import { savePayrollMonth } from "@/lib/payroll";
import { PAYROLL_BACKFILL_RUN_KEY as RUN_KEY, type PayrollBackfillRun, type PayrollEmployee, type PayrollType } from "@/lib/payroll-types";

const SOURCE: Record<string, string> = { salary: "위하고 월별급상여수당지급현황", business: "위하고 사업소득조회", daily: "위하고 일용직근로소득조회" };

type IncomingRow = { name?: string; code?: string } & Record<string, unknown>;

async function readRun(): Promise<PayrollBackfillRun | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: RUN_KEY } });
  if (!row) return null;
  try { return JSON.parse(row.value) as PayrollBackfillRun; } catch { return null; }
}
async function writeRun(run: PayrollBackfillRun) {
  await prisma.appConfig.upsert({
    where: { key: RUN_KEY },
    create: { key: RUN_KEY, value: JSON.stringify(run) },
    update: { value: JSON.stringify(run) },
  });
}
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? Math.round(n) : 0; };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  return NextResponse.json({ run: await readRun() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (session.role === "readonly") return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  let body: { phase?: string; total?: number; years?: string[]; clientId?: number; year?: string; incomeType?: string; overwrite?: boolean; rows?: IncomingRow[]; error?: string; partial?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }

  if (body.phase === "start") {
    const run: PayrollBackfillRun = {
      startedAt: new Date().toISOString(), finishedAt: null,
      years: Array.isArray(body.years) ? body.years.map(String) : [],
      total: num(body.total), done: 0, saved: 0, skipped: 0, failed: [], byUserId: session.id,
    };
    await writeRun(run);
    return NextResponse.json({ ok: true, run });
  }

  if (body.phase === "finish") {
    const run = await readRun();
    if (run && !run.finishedAt) { run.finishedAt = new Date().toISOString(); await writeRun(run); }
    return NextResponse.json({ ok: true, run });
  }

  if (body.phase !== "batch" || !body.clientId || !body.year) {
    return NextResponse.json({ error: "phase 가 올바르지 않습니다" }, { status: 400 });
  }

  const run = await readRun();
  const year = String(body.year);
  const clientId = num(body.clientId);
  const incomeType: PayrollType = body.incomeType === "business" || body.incomeType === "daily" ? body.incomeType : "salary";

  // 권한 범위 안의 거래처만 (해지 거래처도 과거 자료 성격이라 포함)
  const scope = await getClientScopeWhere(session);
  const client = await prisma.client.findFirst({ where: { ...scope, id: clientId }, select: { id: true, name: true } });

  const fail = async (error: string) => {
    if (run) {
      run.done += 1;
      run.failed.push({ clientId, name: client?.name ?? `#${clientId}`, year, error });
      if (run.done >= run.total) run.finishedAt = new Date().toISOString();
      await writeRun(run);
    }
    return NextResponse.json({ ok: false, error });
  };

  if (!client) return fail("권한 범위에 없는 거래처입니다");
  if (body.error) return fail(String(body.error));
  if (!Array.isArray(body.rows)) return fail("rows 가 없습니다");

  // 월별 직원 목록 구성 (같은 이름이 여러 줄이면 — 퇴사 후 재입사, 월 2회 지급 등 — 합산)
  const byMonth = new Map<string, Map<string, PayrollEmployee>>();
  const put = (yearMonth: string, name: string, add: PayrollEmployee) => {
    if (!byMonth.has(yearMonth)) byMonth.set(yearMonth, new Map());
    const m = byMonth.get(yearMonth)!;
    const withTax = incomeType !== "salary";
    const e = m.get(name) ?? { name, gross: 0, deductions: 0, net: 0, ...(withTax ? { incomeTax: 0, localTax: 0 } : {}) };
    e.gross += add.gross; e.deductions += add.deductions; e.net += add.net;
    if (withTax) { e.incomeTax = (e.incomeTax ?? 0) + (add.incomeTax ?? 0); e.localTax = (e.localTax ?? 0) + (add.localTax ?? 0); }
    m.set(name, e);
  };
  if (incomeType === "daily") {
    for (const r of body.rows) {
      const name = String(r.name ?? "").trim();
      const yearMonth = String(r.yearMonth ?? "");
      if (!name || !/^\d{4}-\d{2}$/.test(yearMonth) || !yearMonth.startsWith(`${year}-`)) continue;
      const gross = num(r.gross), incomeTax = num(r.incomeTax), localTax = num(r.localTax), insurance = num(r.insurance);
      if (gross === 0) continue;
      const deductions = incomeTax + localTax + insurance;
      put(yearMonth, name, { name, gross, deductions, net: gross - deductions, incomeTax, localTax });
    }
  } else if (incomeType === "business") {
    for (const r of body.rows) {
      const name = String(r.name ?? "").trim();
      const yearMonth = String(r.yearMonth ?? "");
      if (!name || !/^\d{4}-\d{2}$/.test(yearMonth) || !yearMonth.startsWith(`${year}-`)) continue;
      const gross = num(r.gross), incomeTax = num(r.incomeTax), localTax = num(r.localTax);
      const net = r.net != null ? num(r.net) : gross - incomeTax - localTax;
      if (gross === 0 && net === 0) continue;
      put(yearMonth, name, { name, gross, deductions: incomeTax + localTax, net, incomeTax, localTax });
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      const k = String(m).padStart(2, "0");
      for (const r of body.rows) {
        const name = String(r.name ?? "").trim();
        const gross = num(r[`m${k}_gross`]);
        const ded = num(r[`m${k}_ded`]);
        if (!name || (gross === 0 && ded === 0)) continue;
        put(`${year}-${k}`, name, { name, gross, deductions: ded, net: gross - ded });
      }
    }
  }

  const existing = new Set(
    (await prisma.payrollMonth.findMany({ where: { clientId, incomeType, yearMonth: { startsWith: `${year}-` } }, select: { yearMonth: true } }))
      .map(r => r.yearMonth),
  );
  let saved = 0, skipped = 0;
  for (const [yearMonth, m] of [...byMonth.entries()].sort()) {
    const employees = [...m.values()];
    if (employees.length === 0) continue;                 // 지급 없는 달은 건드리지 않음
    if (existing.has(yearMonth) && !body.overwrite) { skipped++; continue; } // 이미 있는 달(엑셀 수집분 등)은 유지
    await savePayrollMonth(clientId, yearMonth, incomeType, employees, SOURCE[incomeType]);
    saved++;
  }

  if (run) {
    run.done += 1; run.saved += saved; run.skipped += skipped;
    if (body.partial) run.failed.push({ clientId, name: client.name, year, error: String(body.partial) });
    if (run.done >= run.total) run.finishedAt = new Date().toISOString();
    await writeRun(run);
  }
  return NextResponse.json({ ok: true, saved, skipped });
}
