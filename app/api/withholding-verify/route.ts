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

// 접수증일괄조회 과세자료종류 → 원천세 테이블 추가서류 컬럼 키
function kindToTaskKey(kind: string): string | null {
  if (kind.includes("간이지급명세서")) {
    if (kind.includes("근로")) return "간이지급명세서_근로";
    if (kind.includes("사업")) return "간이지급명세서_사업";
    return null;
  }
  if (kind.includes("일용")) return "지급명세서_일용";
  if (kind.includes("근로소득")) return "지급명세서_근로";
  if (kind.includes("사업소득")) return "지급명세서_사업";
  return null;
}

// 명세서 귀속년월 → 체크 표시할 페이지 월
// 간이(근로)는 반기 제출(6월/12월 페이지), 연간 지급명세서(근로·사업)는 다음 해 2월 페이지
function statementPageYm(taskKey: string, taxYmRaw: string): string | null {
  const d = digits(taxYmRaw);
  if (d.length < 4) return null;
  const year = parseInt(d.slice(0, 4));
  const monthNum = d.length >= 6 ? parseInt(d.slice(4, 6)) : null;
  if (taskKey === "간이지급명세서_근로") {
    if (!monthNum || monthNum > 12) return null;
    return monthNum <= 6 ? `${year}-06` : `${year}-12`;
  }
  if (taskKey === "지급명세서_근로" || taskKey === "지급명세서_사업") {
    return `${year + 1}-02`;
  }
  if (!monthNum || monthNum > 12) return null;
  return `${year}-${String(monthNum).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  const yearMonth = formData.get("yearMonth") as string;
  if (files.length === 0 || !yearMonth) return NextResponse.json({ error: "file, yearMonth 필요" }, { status: 400 });

  // 파일별 파싱 — 헤더로 종류 자동 인식
  // 신고접수내역조회: F(5)=과세연월, I(8)=신고유형, J(9)=상호, K(10)=사업자번호
  // 접수증일괄조회: D(3)=귀속년월, E(4)=제출구분, F(5)=과세자료종류, G(6)=사업자번호, H(7)=상호
  const regularByBiz = new Map<string, Set<string>>();
  const specialRows: { name: string; bizNumber: string; biz: string; taxYm: string; filingType: string }[] = [];
  const receiptRows: { name: string; bizNumber: string; biz: string; taxYm: string; kind: string }[] = [];
  let hasFiling = false;
  let hasReceipt = false;

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const header = (rows[0] || []).map(h => String(h ?? "")).join("|");

    if (header.includes("과세자료종류")) {
      hasReceipt = true;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[6]) continue;
        const biz = digits(row[6]);
        if (biz.length < 10) continue;
        receiptRows.push({
          name: String(row[7] ?? ""),
          bizNumber: String(row[6]),
          biz,
          taxYm: String(row[3] ?? ""),
          kind: String(row[5] ?? ""),
        });
      }
    } else if (header.includes("신고서")) {
      hasFiling = true;
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
    }
  }

  if (!hasFiling && !hasReceipt) {
    return NextResponse.json({ error: "인식할 수 없는 파일입니다. 홈택스 신고접수내역조회 또는 접수증일괄조회 엑셀을 올려주세요." }, { status: 400 });
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

  // 전체 거래처 (수정/기한후·명세서 매칭용) — 크로스체크는 ABC 그룹만
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

  // ── 원천세 정기신고 크로스체크 (신고접수내역 파일이 있을 때만) ──
  const abcClients = allClients.filter(c => ["A", "B", "C"].includes(c.withholdingType || ""));
  const checkedNotInExcel: { clientId: number; name: string; bizNumber: string; type: string }[] = [];
  const notCheckedButInExcel: { clientId: number; name: string; bizNumber: string; type: string }[] = [];
  const verifiedClientIds: number[] = [];

  if (hasFiling) {
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

      if (inExcel) verifiedClientIds.push(client.id);

      if (isChecked && !inExcel) {
        checkedNotInExcel.push({ clientId: client.id, name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
      }
      if (!isChecked && inExcel) {
        notCheckedButInExcel.push({ clientId: client.id, name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
      }
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

  // ── 간이·지급명세서 접수증 처리 ──
  // 확인된 제출 건은 해당 컬럼의 "{키}_검증" 레코드로 표시 (칸 강조용)
  const statementMarks = new Map<string, { clientId: number; pageYm: string; taskKey: string }>();
  const statementByKind: Record<string, number> = {};
  const statementUnmatched: { name: string; bizNumber: string; kind: string }[] = [];

  for (const r of receiptRows) {
    const taskKey = kindToTaskKey(r.kind);
    if (!taskKey) continue;
    const client = clientByBiz.get(r.biz);
    if (!client) {
      statementUnmatched.push({ name: r.name, bizNumber: r.bizNumber, kind: r.kind });
      continue;
    }
    const pageYm = statementPageYm(taskKey, r.taxYm);
    if (!pageYm) continue;
    const key = `${client.id}|${pageYm}|${taskKey}`;
    if (!statementMarks.has(key)) {
      statementMarks.set(key, { clientId: client.id, pageYm, taskKey });
      statementByKind[taskKey] = (statementByKind[taskKey] || 0) + 1;
    }
  }

  // 자동 체크: 원천세 검증 컬럼 + 명세서 검증 표시
  const upserts = [
    ...verifiedClientIds.map(clientId =>
      prisma.withholdingRecord.upsert({
        where: { clientId_yearMonth_taskType: { clientId, yearMonth, taskType: "검증" } },
        update: { done: true },
        create: { clientId, yearMonth, taskType: "검증", done: true },
      })
    ),
    ...[...statementMarks.values()].map(m =>
      prisma.withholdingRecord.upsert({
        where: { clientId_yearMonth_taskType: { clientId: m.clientId, yearMonth: m.pageYm, taskType: `${m.taskKey}_검증` } },
        update: { done: true },
        create: { clientId: m.clientId, yearMonth: m.pageYm, taskType: `${m.taskKey}_검증`, done: true },
      })
    ),
  ];
  if (upserts.length > 0) await prisma.$transaction(upserts);

  return NextResponse.json({
    hasFiling,
    hasReceipt,
    excelCount: regularByBiz.size,
    clientCount: abcClients.length,
    verifiedCount: verifiedClientIds.length,
    checkedNotInExcel,
    notCheckedButInExcel,
    specialFilings,
    statementVerified: { total: statementMarks.size, byKind: statementByKind },
    statementUnmatched,
    allMatch: checkedNotInExcel.length === 0 && notCheckedButInExcel.length === 0,
  });
}
