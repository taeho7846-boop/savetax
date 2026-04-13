import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const targetMonth = formData.get("targetMonth") as string; // "2026-04"
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  if (!targetMonth) return NextResponse.json({ error: "대상 월을 선택해주세요" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ error: "엑셀에 데이터가 없습니다" }, { status: 400 });
  }

  // 컬럼 탐색
  const keys = Object.keys(rows[0]);
  const nameKey = keys.find(k => /^회원명$/.test(k))
    || keys.find(k => /상호명|거래처명|상호|업체명/.test(k));
  // Q열: 출금결과 컬럼 — "출금성공 [자동출금]", "정산완료" 등이 들어있는 컬럼 자동 탐색
  // 먼저 이름으로 찾고, 못 찾으면 값에 "출금성공" 또는 "정산완료"가 있는 컬럼 탐색
  let resultKey = keys.find(k => /^상태$|설명|출금결과|출금상태|결과|수납결과|수납상태|비고/.test(k));
  if (!resultKey) {
    // 값 기반 탐색: 첫 10행에서 "출금성공" 또는 "정산완료" 텍스트가 있는 컬럼 찾기
    const sampleRows = rows.slice(0, 10);
    for (const key of keys) {
      const hasKeyword = sampleRows.some(r => {
        const v = String(r[key] || "");
        return v.includes("출금성공") || v.includes("정산완료") || v.includes("출금실패");
      });
      if (hasKeyword) { resultKey = key; break; }
    }
  }
  const amountKey = keys.find(k => /출금액|수납액|금액/.test(k));

  if (!nameKey) {
    return NextResponse.json({ error: "회원명 컬럼을 찾을 수 없습니다." }, { status: 400 });
  }

  // 엑셀 파싱
  type ExcelEntry = {
    name: string;
    result: string;
    isSuccess: boolean;
    amount: number;
  };
  const excelEntries: ExcelEntry[] = [];
  for (const r of rows) {
    const name = String(r[nameKey] || "").trim();
    if (!name) continue;
    const result = resultKey ? String(r[resultKey] || "").trim() : "";
    // 출금 성공: "출금성공" 또는 "정산완료" 포함 → 성공, 나머지 → 실패
    const isSuccess = result.includes("출금성공") || result.includes("정산완료");
    const rawAmount = amountKey ? r[amountKey] : 0;
    const amount = typeof rawAmount === "number" ? rawAmount : parseInt(String(rawAmount).replace(/[^0-9]/g, "")) || 0;
    excelEntries.push({ name, result, isSuccess, amount });
  }

  // 엑셀 이름 → Map (같은 이름 여러 건 있을 수 있으므로 첫 번째 사용)
  const excelMap = new Map<string, ExcelEntry>();
  for (const entry of excelEntries) {
    if (!excelMap.has(entry.name)) {
      excelMap.set(entry.name, entry);
    }
  }

  // DB에서 내 거래처 조회 (채권 탭과 동일 조건)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }

  const dbClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      monthlyFee: true,
      firstWithdrawalMonth: true,
    },
  });

  // 해당 월의 기존 수납 상태 조회
  const feeRecords = await prisma.feeRecord.findMany({
    where: {
      clientId: { in: dbClients.map(c => c.id) },
      yearMonth: targetMonth,
    },
  });
  const paidMap = new Map(feeRecords.map(r => [r.clientId, r.status]));

  // 매칭
  type MatchedItem = {
    clientId: number;
    clientName: string;
    monthlyFee: number | null;
    excelResult: string;
    excelSuccess: boolean;
    excelAmount: number;
    currentPaid: boolean;
  };

  const success: MatchedItem[] = [];
  const failed: MatchedItem[] = [];
  const notInExcel: { clientId: number; clientName: string; monthlyFee: number | null; currentPaid: boolean }[] = [];

  for (const client of dbClients) {
    // 최초출금월 이전이면 스킵
    if (client.firstWithdrawalMonth && targetMonth < client.firstWithdrawalMonth) continue;

    const excel = excelMap.get(client.name.trim());
    const currentPaid = paidMap.get(client.id) === "paid";

    if (excel) {
      const item: MatchedItem = {
        clientId: client.id,
        clientName: client.name,
        monthlyFee: client.monthlyFee,
        excelResult: excel.result,
        excelSuccess: excel.isSuccess,
        excelAmount: excel.amount,
        currentPaid,
      };
      if (excel.isSuccess) {
        success.push(item);
      } else {
        failed.push(item);
      }
    } else {
      notInExcel.push({
        clientId: client.id,
        clientName: client.name,
        monthlyFee: client.monthlyFee,
        currentPaid,
      });
    }
  }

  return NextResponse.json({
    targetMonth,
    totalExcel: excelMap.size,
    totalClients: dbClients.length,
    success,
    failed,
    notInExcel,
    debug: { nameKey, resultKey, amountKey, allColumns: keys, sampleResults: excelEntries.slice(0, 3).map(e => ({ name: e.name, result: e.result, isSuccess: e.isSuccess })) },
  });
}
