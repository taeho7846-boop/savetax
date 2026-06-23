import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";

// "요약" 시트 컬럼 인덱스 (0-based). 머리글: row0=제목, row1=대분류, row2=소분류, row3~=데이터
const C = {
  manager: 0,        // 담당자
  name: 1,           // 거래처명
  biz: 2,            // 사업자번호
  bizType: 3,        // 구분(법인/개인)
  taxationType: 4,   // 과세유형
  // 매출
  saleTiSupply: 7,   // 세금계산서매출 공급가액
  saleTiVat: 8,      // 세금계산서매출 세액
  saleInv: 10,       // 계산서매출 공급가액(면세)
  saleCardCredit: 11,// 카드매출 신용카드/기타결제
  saleCardBuyonly: 12,// 카드매출 구매전용/카드매출
  saleCardNontax: 13,// 카드매출 비과세금액
  saleCardTotal: 14, // 카드매출 합계금액(=11+12)
  saleCashSupply: 15,// 현금영수증매출 공급가액
  saleCashVat: 16,   // 현금영수증매출 세액
  saleZeropay: 19,   // 제로페이매출 매출금액(공급대가)
  saleOnline: 21,    // 온라인매출(판매대행) 매출금액(공급대가)
  saleExport: 22,    // 수출실적 원화환산금액(영세율)
  // 매입 (모두 공급가액 컬럼 존재)
  buyTiSupply: 23,   // 세금계산서매입 공급가액
  buyTiVat: 24,      // 세금계산서매입 세액
  buyInv: 26,        // 계산서매입 공급가액
  buyCardSupply: 27, // 카드매입(공제대상) 공급가액
  buyCardVat: 28,    // 카드매입(공제대상) 세액
  buyCashSupply: 33, // 현금영수증매입(공제대상) 공급가액
  buyFreight: 39,    // 화물복지카드(공제대상) 공급가액
  // 예정고지
  noticeTarget: 45,  // 고지대상 (여/부)
  noticeExclude: 46, // 제외사유
  filingDuty: 47,    // 신고의무
  prevSupply: 48,    // 직전공급가액
  noticeAmount: 49,  // 예정고지세액
} as const;

const digits = (s: unknown) => String(s ?? "").replace(/[^0-9]/g, "");
function num(row: any[], i: number): number {
  const v = row[i];
  if (typeof v === "number") return Math.round(v);
  const n = parseInt(String(v ?? "").replace(/[^0-9.-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
// 공급대가 → 공급가액 환산 (부가세 10% 별도)
const toSupply = (gross: number) => Math.round(gross / 1.1);

function parseSummaryRow(row: any[]) {
  const saleTi = num(row, C.saleTiSupply);
  const saleInv = num(row, C.saleInv);
  const saleCash = num(row, C.saleCashSupply);
  const cardTotal = num(row, C.saleCardTotal);
  const cardNontax = num(row, C.saleCardNontax);
  const saleCard = toSupply(Math.max(0, cardTotal - cardNontax)) + cardNontax; // 과세분만 환산, 비과세는 그대로
  const zeropayGross = num(row, C.saleZeropay);
  const saleZeropay = toSupply(zeropayGross);
  const onlineGross = num(row, C.saleOnline);
  const saleOnline = toSupply(onlineGross);
  const saleExport = num(row, C.saleExport); // 영세율: 공급가액 = 금액
  const saleSupplyTotal = saleTi + saleInv + saleCash + saleCard + saleZeropay + saleOnline + saleExport;

  const buyTi = num(row, C.buyTiSupply);
  const buyInv = num(row, C.buyInv);
  const buyCard = num(row, C.buyCardSupply);
  const buyCash = num(row, C.buyCashSupply);
  const buyFreight = num(row, C.buyFreight);
  const buySupplyTotal = buyTi + buyInv + buyCard + buyCash + buyFreight;

  return {
    v: 1,
    bizType: String(row[C.bizType] ?? "").trim(),
    taxationType: String(row[C.taxationType] ?? "").trim(),
    sales: {
      ti: saleTi, tiVat: num(row, C.saleTiVat),
      inv: saleInv,
      card: saleCard, cardGross: cardTotal, cardNontax,
      cash: saleCash, cashVat: num(row, C.saleCashVat),
      zeropay: saleZeropay, zeropayGross,
      online: saleOnline, onlineGross,
      export: saleExport,
      supplyTotal: saleSupplyTotal,
    },
    buy: {
      ti: buyTi, tiVat: num(row, C.buyTiVat),
      inv: buyInv,
      card: buyCard, cardVat: num(row, C.buyCardVat),
      cash: buyCash,
      freight: buyFreight,
      supplyTotal: buySupplyTotal,
    },
    notice: {
      target: String(row[C.noticeTarget] ?? "").trim(), // 여=대상 / 부=비대상
      amount: num(row, C.noticeAmount),
      excludeReason: String(row[C.noticeExclude] ?? "").trim(),
      filingDuty: String(row[C.filingDuty] ?? "").trim(),
      prevSupply: num(row, C.prevSupply),
    },
  };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const period = formData.get("period") as string | null; // "2026-1-확정"
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  if (!period) return NextResponse.json({ error: "신고 기수가 지정되지 않았습니다" }, { status: 400 });

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "엑셀 파일을 읽을 수 없습니다" }, { status: 400 });
  }

  // "요약" 시트 우선, 없으면 첫 시트
  const summaryName = workbook.SheetNames.find((n) => n.includes("요약")) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[summaryName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

  if (rows.length < 4) {
    return NextResponse.json({ error: "엑셀 형식이 올바르지 않습니다 (데이터가 없습니다)" }, { status: 400 });
  }

  // 제목(A1)에서 연도/반기 추출 → 선택한 기수와 비교
  const sheetTitle = String(rows[0]?.[0] ?? "").trim();
  const titleYear = sheetTitle.match(/(\d{4})\s*년/)?.[1] ?? null;
  const titleHalf = sheetTitle.includes("상반기") ? "1" : sheetTitle.includes("하반기") ? "2" : null;
  const [periodYear, periodGi] = period.split("-"); // ["2026","1","확정"] → year, gi
  let periodWarning: string | null = null;
  if (titleYear && titleHalf && (titleYear !== periodYear || titleHalf !== periodGi)) {
    periodWarning = `업로드한 엑셀은 "${sheetTitle}" 자료인데, 현재 선택된 기수는 ${periodYear}년 ${periodGi}기 입니다. 기수가 일치하는지 확인하세요.`;
  }

  // 수집 상태(통합조회) — "조회일시" 시트에서 사업자번호별로 추출
  const collectByBiz = new Map<string, string>();
  const statusName = workbook.SheetNames.find((n) => n.includes("조회일시"));
  if (statusName) {
    const srows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[statusName], { header: 1, defval: "" });
    for (const r of srows.slice(2)) {
      const b = digits(r[2]);
      if (!b) continue;
      collectByBiz.set(b, String(r[7] ?? "").includes("오류") ? "오류" : "정상");
    }
  }

  // 데이터 행 파싱 (사업자번호 기준)
  const parsedByBiz = new Map<string, ReturnType<typeof parseSummaryRow> & { name: string; manager: string }>();
  for (const row of rows.slice(3)) {
    const biz = digits(row[C.biz]);
    if (!biz) continue;
    parsedByBiz.set(biz, {
      ...parseSummaryRow(row),
      name: String(row[C.name] ?? "").trim(),
      manager: String(row[C.manager] ?? "").trim(),
    });
  }

  if (parsedByBiz.size === 0) {
    return NextResponse.json({ error: "엑셀에서 사업자번호를 찾을 수 없습니다. 올바른 홈택스 부가세 신고자료 파일인지 확인하세요." }, { status: 400 });
  }

  // 매칭 대상 거래처 (부가세 페이지와 동일 범위: 관리자=본인+소속직원, 직원=본인담당)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: any = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map((e) => e.id)] } };
  }
  const dbClients = await prisma.client.findMany({
    where: { isDeleted: false, bizNumber: { not: null }, ...assignedFilter },
    select: { id: true, name: true, bizNumber: true },
  });
  const clientByBiz = new Map<string, { id: number; name: string }>();
  for (const c of dbClients) {
    const b = digits(c.bizNumber);
    if (b && !clientByBiz.has(b)) clientByBiz.set(b, { id: c.id, name: c.name });
  }

  // 매칭 + 저장
  const importedAt = new Date();
  const matched: { clientId: number; name: string; biz: string }[] = [];
  const unmatched: { name: string; biz: string; manager: string }[] = [];
  const collectErrors: { name: string; biz: string }[] = [];

  for (const [biz, parsed] of parsedByBiz) {
    const client = clientByBiz.get(biz);
    const collect = collectByBiz.get(biz) ?? null;
    if (collect === "오류") collectErrors.push({ name: parsed.name, biz });
    if (!client) {
      unmatched.push({ name: parsed.name, biz, manager: parsed.manager });
      continue;
    }
    const htxData = JSON.stringify({ ...parsed, collect, sheetTitle, name: undefined, manager: undefined });
    await prisma.vatRecord.upsert({
      where: { clientId_period: { clientId: client.id, period } },
      update: { htxData, htxImportedAt: importedAt },
      create: { clientId: client.id, period, htxData, htxImportedAt: importedAt },
    });
    matched.push({ clientId: client.id, name: client.name, biz });
  }

  revalidatePath("/vat");

  return NextResponse.json({
    ok: true,
    period,
    sheetTitle,
    periodWarning,
    totalRows: parsedByBiz.size,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 100),
    collectErrors: collectErrors.slice(0, 100),
    collectErrorCount: collectErrors.length,
    importedAt: importedAt.toISOString(),
  });
}
