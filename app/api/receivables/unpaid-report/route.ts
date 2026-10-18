import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lastBillableMonth } from "@/lib/withdrawal";
import { buildUnpaidReportPdf, type UnpaidReportRow } from "@/lib/unpaid-report";

/**
 * 미수금 현황 보고서 PDF — 채권관리(/receivables)와 동일한 범위·판정으로 미수가 있는 거래처만 모아 출력.
 * ?group=save|personal 로 소속 한쪽만 출력 가능 (기본 전체).
 */

function getAllMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

const CONTACT_LABEL: Record<string, string> = { promise: "상환약속", absent: "부재중", bluff: "공수표", other: "연락" };
const md = (d: string | Date) => {
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  return `${parseInt(s.slice(5, 7))}/${parseInt(s.slice(8, 10))}`;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const group = req.nextUrl.searchParams.get("group"); // save | personal | null

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
    },
    select: {
      id: true, name: true, monthlyFee: true, firstWithdrawalMonth: true, affiliation: true, cmsAffiliation: true,
      withdrawalDay: true, billingTiming: true, contractStatus: true, terminationMonth: true,
      feeRecords: { select: { yearMonth: true, status: true } },
      unpaidPostpone: { select: { postponedUntil: true, note: true } },
      collectionContacts: { orderBy: { contactedAt: "desc" }, take: 1, select: { result: true, promiseDate: true, contactedAt: true, memo: true } },
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
    const accountantName = au ? (au.role === "employee" && au.manager ? au.manager.name : au.name) : null;
    const wt = { withdrawalDay: c.withdrawalDay, billingTiming: c.billingTiming, cmsAffiliation: c.cmsAffiliation, affiliation: c.affiliation, accountantName };
    const billableEnd = lastBillableMonth(wt);
    const isTerminated = c.contractStatus !== "active";
    const endMonth = isTerminated && c.terminationMonth
      ? (c.terminationMonth < billableEnd ? c.terminationMonth : billableEnd)
      : billableEnd;
    const settled = new Set(c.feeRecords.filter(r => r.status === "paid" || r.status === "exempt").map(r => r.yearMonth));
    const unpaidMonths = getAllMonths(c.firstWithdrawalMonth!, endMonth).filter(m => !settled.has(m));
    if (unpaidMonths.length === 0) continue;

    let lastAction: string | null = null;
    const pp = c.unpaidPostpone;
    if (pp && pp.postponedUntil > today) {
      lastAction = `보류 ~${md(pp.postponedUntil)}${pp.note ? ` · ${pp.note}` : ""}`;
    } else if (c.collectionContacts[0]) {
      const ct = c.collectionContacts[0];
      const label = CONTACT_LABEL[ct.result] ?? ct.result;
      lastAction = ct.result === "promise" && ct.promiseDate
        ? `${label} ${md(ct.promiseDate)} (${md(ct.contactedAt)} 연락)`
        : `${label} ${md(ct.contactedAt)}${ct.memo ? ` · ${ct.memo}` : ""}`;
    }

    rows.push({
      name: c.name,
      affiliation: c.affiliation,
      assignedUserName: au?.name ?? null,
      monthlyFee: c.monthlyFee ?? 0,
      unpaidMonths,
      unpaidAmount: (c.monthlyFee ?? 0) * unpaidMonths.length,
      terminated: isTerminated,
      lastAction,
    });
  }

  const titleSuffix = group === "save" ? " (세이브택스)" : group === "personal" ? " (개인세무거래처)" : "";
  const pdf = await buildUnpaidReportPdf({
    asOf,
    printedAt,
    author: session.name,
    title: `미수금 현황 보고${titleSuffix}`,
    rows,
  });

  const filename = `미수금현황_${asOf}${group === "save" ? "_세이브택스" : group === "personal" ? "_개인" : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
