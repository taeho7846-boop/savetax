import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

// 과세연월(YYYYMM) → 원천세 페이지의 조회 월(YYYY-MM)
// 반기납 업체는 홈택스 과세연월이 반기 시작월(1월/7월)로 찍히므로 6월/12월 페이지로 매핑
function toPageYearMonth(taxYm: string, halfYearTax: boolean): string | null {
  if (taxYm.length !== 6) return null;
  const year = taxYm.slice(0, 4);
  const month = parseInt(taxYm.slice(4, 6));
  if (!month || month > 12) return null;
  if (halfYearTax && month === 1) return `${year}-06`;
  if (halfYearTax && month === 7) return `${year}-12`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const yearMonth = formData.get("yearMonth") as string;
  if (!file || !yearMonth) return NextResponse.json({ error: "file, yearMonth 필요" }, { status: 400 });

  // 엑셀 파싱 - F열(5) 과세연월, I열(8) 신고유형, J열(9) 상호, K열(10) 사업자등록번호
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

  // 정기신고: 사업자번호별 과세연월 집합 (크로스체크용)
  // 수정신고·기한후신고: 별도 안내 목록
  const regularByBiz = new Map<string, Set<string>>();
  const specialRows: { name: string; bizNumber: string; biz: string; taxYm: string; filingType: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[10]) continue;
    const biz = digits(row[10]);
    if (biz.length < 10) continue;
    const taxYm = digits(row[5]);
    const filingType = String(row[8] ?? "").trim();
    if (filingType === "정기신고") {
      if (!regularByBiz.has(biz)) regularByBiz.set(biz, new Set());
      regularByBiz.get(biz)!.add(taxYm);
    } else if (filingType) {
      specialRows.push({ name: String(row[9] ?? ""), bizNumber: String(row[10]), biz, taxYm, filingType });
    }
  }

  // 조회 월 기준 정상 과세연월: 매월 업체 = 조회 월, 반기납 업체 = 반기 시작월(6월→1월, 12월→7월)
  const ymDigits = yearMonth.replace(/[^0-9]/g, "");
  const [ymYear, ymMonthStr] = yearMonth.split("-");
  const ymMonth = parseInt(ymMonthStr);
  const halfYmDigits = ymMonth === 6 ? `${ymYear}01` : ymMonth === 12 ? `${ymYear}07` : null;

  // 사용자 필터 (매니저면 부하직원 포함)
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 전체 거래처 (수정/기한후 매칭용) — 크로스체크는 ABC 그룹만
  const allClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
    },
    select: {
      id: true,
      name: true,
      bizNumber: true,
      withholdingType: true,
      halfYearTax: true,
      withholdingRecords: {
        where: { yearMonth },
      },
    },
  });
  const clientByBiz = new Map(
    allClients.filter(c => c.bizNumber).map(c => [digits(c.bizNumber), c])
  );

  // 정기신고 크로스체크 (ABC 그룹)
  const abcClients = allClients.filter(c => ["A", "B", "C"].includes(c.withholdingType || ""));
  const checkedNotInExcel: { clientId: number; name: string; bizNumber: string; type: string }[] = [];
  const notCheckedButInExcel: { clientId: number; name: string; bizNumber: string; type: string }[] = [];

  for (const client of abcClients) {
    const biz = digits(client.bizNumber);
    if (!biz) continue;

    // 반기납 업체는 신고 단계가 있는 6월·12월 페이지에서만 검증
    const expectedYm = client.halfYearTax ? halfYmDigits : ymDigits;
    if (!expectedYm) continue;

    const doneMap = new Map(client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    const isSkipped = doneMap.has("신고없음");
    const isChecked = doneMap.has("원천세신고");
    const inExcel = regularByBiz.get(biz)?.has(expectedYm) ?? false;

    if (isSkipped) continue; // 신고없음은 제외

    if (isChecked && !inExcel) {
      checkedNotInExcel.push({ clientId: client.id, name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
    }
    if (!isChecked && inExcel) {
      notCheckedButInExcel.push({ clientId: client.id, name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
    }
  }

  // 수정신고·기한후신고 안내 목록 (거래처 매칭 + 해당 월 체크 여부)
  const specialFilings = specialRows.map(s => {
    const client = clientByBiz.get(s.biz);
    const pageYearMonth = client ? toPageYearMonth(s.taxYm, !!client.halfYearTax) : toPageYearMonth(s.taxYm, false);
    return {
      name: s.name,
      bizNumber: s.bizNumber,
      taxYearMonth: s.taxYm.length === 6 ? `${s.taxYm.slice(0, 4)}-${s.taxYm.slice(4, 6)}` : s.taxYm,
      filingType: s.filingType,
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
      pageYearMonth: client ? pageYearMonth : null,
      checked: false,
    };
  });

  // 매칭된 거래처의 해당 월 원천세신고 체크 여부 조회
  const pairs = specialFilings.filter(s => s.clientId && s.pageYearMonth);
  if (pairs.length > 0) {
    const records = await prisma.withholdingRecord.findMany({
      where: {
        taskType: "원천세신고",
        done: true,
        OR: pairs.map(s => ({ clientId: s.clientId!, yearMonth: s.pageYearMonth! })),
      },
      select: { clientId: true, yearMonth: true },
    });
    const doneSet = new Set(records.map(r => `${r.clientId}|${r.yearMonth}`));
    for (const s of specialFilings) {
      if (s.clientId && s.pageYearMonth && doneSet.has(`${s.clientId}|${s.pageYearMonth}`)) s.checked = true;
    }
  }

  return NextResponse.json({
    excelCount: regularByBiz.size,
    clientCount: abcClients.length,
    checkedNotInExcel,
    notCheckedButInExcel,
    specialFilings,
    allMatch: checkedNotInExcel.length === 0 && notCheckedButInExcel.length === 0,
  });
}
