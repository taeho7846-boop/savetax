import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeReceivable } from "@/lib/receivables";
import { buildUnpaidReportPdf, type UnpaidReportRow } from "@/lib/unpaid-report";

/**
 * 미수금 현황 보고서 PDF — 채권관리(/receivables)와 동일한 범위·판정으로 미수가 있는 거래처만 모아 출력.
 * ?group=save|personal 로 소속 한쪽만, ?users=이름,이름 로 담당자만, ?aff= / ?cmsAff= 로 소속·CMS 청구처만 출력 가능 (기본 전체).
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const group = sp.get("group"); // save | personal | null
  const list = (k: string) => (sp.get(k) ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const users = list("users");     // 담당자(사수) 이름
  const affs = list("aff");        // 소속
  const cmsAffs = list("cmsAff");  // CMS 청구처

  // 채권관리 페이지와 동일 범위: 세무사/관리자/대표는 본인 + 소속 직원, 직원은 본인
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: Record<string, unknown> = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({ where: { managerId: session.id, isActive: true }, select: { id: true } });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [{ taxTypes: null }, { NOT: { taxTypes: { contains: "신고대리" } } }],
      ...(group === "save" ? { affiliation: "세이브택스" } : group === "personal" ? { NOT: { affiliation: "세이브택스" } } : {}),
      ...(users.length > 0 ? { assignedUser: { name: { in: users } } } : {}),
      ...(affs.length > 0 ? { affiliation: { in: affs } } : {}),
      ...(cmsAffs.length > 0 ? { cmsAffiliation: { in: cmsAffs } } : {}),
    },
    select: {
      id: true, name: true, monthlyFee: true, firstWithdrawalMonth: true, affiliation: true, cmsAffiliation: true,
      withdrawalDay: true, billingTiming: true, contractStatus: true, terminationMonth: true,
      feeRecords: { select: { yearMonth: true, status: true } },
      assignedUser: { select: { name: true, role: true, manager: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const today = new Date();
  const kst = new Date(today.getTime() + 9 * 3600 * 1000);
  const asOf = kst.toISOString().slice(0, 10);
  const printedAt = `${asOf} ${kst.toISOString().slice(11, 16)}`;

  const rows: UnpaidReportRow[] = [];
  for (const c of clients) {
    const au = c.assignedUser;
    const { isTerminated, unpaidMonths } = computeReceivable(c);
    // 기장료가 0원이거나 미수 달이 없으면 보고서에서 제외
    if (unpaidMonths.length === 0 || (c.monthlyFee ?? 0) <= 0) continue;

    rows.push({
      name: c.name,
      affiliation: c.affiliation,
      assignedUserName: au?.name ?? null,
      monthlyFee: c.monthlyFee ?? 0,
      unpaidMonths,
      unpaidAmount: (c.monthlyFee ?? 0) * unpaidMonths.length,
      terminated: isTerminated,
    });
  }

  const suffixParts = [
    group === "save" ? "세이브택스" : group === "personal" ? "개인세무거래처" : "",
    users.length > 0 ? `담당 ${users.join("·")}` : "",
    affs.length > 0 ? affs.join("·") : "",
    cmsAffs.length > 0 ? `CMS ${cmsAffs.join("·")}` : "",
  ].filter(Boolean);
  const titleSuffix = suffixParts.length > 0 ? ` (${suffixParts.join(" · ")})` : "";
  const pdf = await buildUnpaidReportPdf({
    asOf,
    printedAt,
    author: session.name,
    title: `미수금 현황 보고${titleSuffix}`,
    rows,
  });

  const fileSuffix = [
    group === "save" ? "세이브택스" : group === "personal" ? "개인" : "",
    users.length > 0 ? users.join("_") : "",
  ].filter(Boolean).map(s => `_${s}`).join("");
  const filename = `미수금현황_${asOf}${fileSuffix}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
