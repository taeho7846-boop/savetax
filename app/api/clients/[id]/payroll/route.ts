import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getClientScopeWhere } from "@/lib/client-scope";
import { collectPayrollMonth, getPayrollMonths, type PayrollType } from "@/lib/payroll";
import { kstToday } from "@/lib/bookkeeping";

/**
 * 거래처 인건비(급여) 데이터 — 프로필 > 인건비 상세 모달(ClientPayrollModal)
 *  GET  /api/clients/[id]/payroll                      → { today, client, months[] }
 *  POST /api/clients/[id]/payroll { yearMonths: [] }   → 드라이브의 위하고 엑셀을 읽어 저장(과거분 채우기), 월별 결과 반환
 */

async function findClient(session: { id: number; role: string }, clientId: number) {
  const scope = await getClientScopeWhere(session);
  return prisma.client.findFirst({
    where: { id: clientId, isDeleted: false, AND: [scope.AND[0]] },
    select: { id: true, name: true, laborTypes: true, withholdingType: true },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const client = await findClient(session, clientId);
  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없거나 권한 범위 밖입니다" }, { status: 404 });

  const months = await getPayrollMonths(clientId);
  return NextResponse.json({ today: kstToday(), client, months }, { headers: { "Cache-Control": "no-store" } });
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

  // 거래처의 인건비 유형에 맞는 파일만 찾는다 (없으면 3종 모두)
  const labor = client.laborTypes ?? "";
  const types: PayrollType[] = body.types ?? (
    labor ? ([
      labor.includes("근로소득") ? "salary" : null,
      labor.includes("사업소득") ? "business" : null,
      labor.includes("일용직") ? "daily" : null,
    ].filter(Boolean) as PayrollType[]) : ["salary", "business", "daily"]
  );
  if (types.length === 0) return NextResponse.json({ results: [], months: await getPayrollMonths(clientId) });

  const results = [];
  for (const ym of yearMonths) results.push(await collectPayrollMonth(client, ym, types));
  const months = await getPayrollMonths(clientId);
  return NextResponse.json({ results, months });
}
