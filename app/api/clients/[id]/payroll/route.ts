import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getClientScopeWhere } from "@/lib/client-scope";
import { collectPayrollMonth, getPayrollMonths, type PayrollType } from "@/lib/payroll";
import type { PayrollFilingMonth, PayrollWehago } from "@/lib/payroll-types";
import { kstToday, addMonths } from "@/lib/bookkeeping";
import { pickWithholdingMonth, withholdingSteps, deriveWithholdingStatus, type WithholdingStatus } from "@/lib/filing-status";

/**
 * 거래처 원천세·인건비 데이터 — 프로필 > 원천세·인건비 상세 모달(ClientPayrollModal)
 *  GET  /api/clients/[id]/payroll                      → { today, client, months[], filings[], wehago }
 *       months: PayrollMonth(급여대장), filings: 최근 24개월 신고 진행·납부세액, wehago: 위하고 다운로드 주소 재료
 *  POST /api/clients/[id]/payroll { yearMonths: [] }   → 드라이브의 위하고 엑셀을 읽어 저장(과거분 채우기), 월별 결과 반환
 */

const WH_STATUS: Record<WithholdingStatus, { label: string; color: string }> = {
  none: { label: "미시작", color: "#B0B8C1" },
  progress: { label: "진행중", color: "#3182F6" },
  filed: { label: "신고완료", color: "#A855F7" },
  done: { label: "납부서까지", color: "#10B981" },
};

async function findClient(session: { id: number; role: string }, clientId: number) {
  const scope = await getClientScopeWhere(session);
  return prisma.client.findFirst({
    where: { id: clientId, isDeleted: false, AND: [scope.AND[0]] },
    select: {
      id: true, name: true, laborTypes: true, withholdingType: true, halfYearTax: true, driveFolderId: true,
      wehagoCno: true, wehagoCdCom: true, wehagoColors: true,
    },
  });
}

function laborTypesOf(labor: string | null): PayrollType[] {
  if (!labor) return ["salary", "business", "daily"];
  const out: PayrollType[] = [];
  if (labor.includes("근로소득")) out.push("salary");
  if (labor.includes("사업소득")) out.push("business");
  if (labor.includes("일용직")) out.push("daily");
  return out;
}

/** 위하고 급여 화면 주소 재료 — companyID/taxNum 은 사용자 설정(없으면 소속 세무사) */
async function wehagoInfo(session: { id: number }, c: { wehagoCno: string | null; wehagoCdCom: string | null; wehagoColors: string | null; driveFolderId: string | null }): Promise<PayrollWehago> {
  const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { wehagoId: true, wehagoTaxNum: true } });
  let taxNum = settings?.wehagoTaxNum || "";
  if (!taxNum) {
    const me = await prisma.user.findUnique({ where: { id: session.id }, select: { managerId: true } });
    if (me?.managerId) {
      const mgr = await prisma.settings.findUnique({ where: { userId: me.managerId }, select: { wehagoTaxNum: true } });
      taxNum = mgr?.wehagoTaxNum || "";
    }
  }
  let colors: Record<string, string> = {};
  try { colors = JSON.parse(c.wehagoColors || "{}") as Record<string, string>; } catch { colors = {}; }
  const reasons: string[] = [];
  if (!c.wehagoCno || !c.wehagoCdCom) reasons.push("거래처에 위하고 급여 주소(cno/cd_com)가 없음");
  if (!settings?.wehagoId) reasons.push("설정에 위하고 companyID 없음");
  if (!taxNum) reasons.push("설정에 세무사번호(taxNum) 없음");
  if (!c.driveFolderId) reasons.push("거래처 구글드라이브 폴더 미연결");
  return { ready: reasons.length === 0, reason: reasons.join(" · ") || null, cno: c.wehagoCno, cdCom: c.wehagoCdCom, companyId: settings?.wehagoId || "", taxNum, colors };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const client = await findClient(session, clientId);
  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없거나 권한 범위 밖입니다" }, { status: 404 });

  const today = kstToday();
  const whMonth = pickWithholdingMonth(today);
  const start = addMonths(whMonth, -23);
  const [months, whRecords, whFilings, wehago] = await Promise.all([
    getPayrollMonths(clientId),
    prisma.withholdingRecord.findMany({ where: { clientId, yearMonth: { gte: start, lte: whMonth } }, select: { yearMonth: true, taskType: true, done: true } }),
    prisma.withholdingFiling.findMany({
      where: { clientId, yearMonth: { gte: start, lte: whMonth } },
      select: { yearMonth: true, kind: true, amount: true, reportType: true, receiptNo: true, status: true, submittedAt: true },
    }),
    wehagoInfo(session, client),
  ]);

  const recByYm = new Map<string, { taskType: string; done: boolean }[]>();
  for (const r of whRecords) { const a = recByYm.get(r.yearMonth) ?? []; a.push(r); recByYm.set(r.yearMonth, a); }
  const filings: PayrollFilingMonth[] = [];
  for (let i = 0; i < 24; i++) {
    const ym = addMonths(whMonth, -i);
    const steps = withholdingSteps(client.withholdingType, parseInt(ym.slice(5, 7)), client.halfYearTax);
    const recs = recByYm.get(ym) ?? [];
    const status = deriveWithholdingStatus(steps, recs);
    const doneSet = new Set(recs.filter(r => r.done).map(r => r.taskType));
    const fi = whFilings.find(f => f.yearMonth === ym && f.kind === "income") ?? null;
    const fl = whFilings.find(f => f.yearMonth === ym && f.kind === "local") ?? null;
    const noRecord = i > 0 && recs.length === 0 && !fi && steps.length > 0;
    filings.push({
      yearMonth: ym, steps, doneSteps: steps.filter(s => doneSet.has(s)), status,
      statusLabel: noRecord ? "기록 없음" : WH_STATUS[status].label, statusColor: noRecord ? "#D1D6DB" : WH_STATUS[status].color,
      incomeAmount: fi?.amount ?? null, localAmount: fl?.amount ?? null, reportType: fi?.reportType ?? null,
      receiptNo: fi?.receiptNo ?? null, filingStatus: fi?.status ?? null, submittedAt: fi?.submittedAt?.toISOString() ?? null, isCurrent: i === 0,
    });
  }

  return NextResponse.json(
    {
      today,
      client: { id: client.id, name: client.name, laborTypes: client.laborTypes, withholdingType: client.withholdingType, halfYearTax: client.halfYearTax, types: laborTypesOf(client.laborTypes) },
      months, filings, wehago,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "readonly") return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const client = await findClient(session, clientId);
  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없거나 권한 범위 밖입니다" }, { status: 404 });

  let body: { yearMonths?: string[]; types?: PayrollType[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const yearMonths = (body.yearMonths ?? []).filter(ym => /^\d{4}-\d{2}$/.test(ym)).slice(0, 12);
  if (yearMonths.length === 0) return NextResponse.json({ error: "yearMonths 가 필요합니다" }, { status: 400 });

  const types: PayrollType[] = body.types?.length ? body.types : laborTypesOf(client.laborTypes);
  if (types.length === 0) return NextResponse.json({ results: [], months: await getPayrollMonths(clientId) });

  const results = [];
  for (const ym of yearMonths) results.push(await collectPayrollMonth({ id: client.id, name: client.name, driveFolderId: client.driveFolderId }, ym, types));
  const months = await getPayrollMonths(clientId);
  return NextResponse.json({ results, months });
}
