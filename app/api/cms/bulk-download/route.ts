import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import path from "path";
import ExcelJS from "exceljs";

const BANK_CODE_MAP: Record<string, string> = {
  "산업": "002", "산업은행": "002",
  "기업": "003", "기업은행": "003",
  "국민": "004", "국민은행": "004", "KB": "004", "kb": "004",
  "외환": "005", "외환은행": "005",
  "수협": "007", "수협은행": "007",
  "농협": "011", "농협은행": "011", "NH": "011", "nh": "011",
  "우리": "020", "우리은행": "020",
  "SC제일": "023", "SC": "023", "제일": "023", "제일은행": "023",
  "씨티": "027", "씨티은행": "027", "시티": "027",
  "대구": "031", "대구은행": "031", "iM뱅크": "031", "iM": "031", "IM": "031",
  "부산": "032", "부산은행": "032",
  "광주": "034", "광주은행": "034",
  "제주": "035", "제주은행": "035",
  "전북": "037", "전북은행": "037",
  "경남": "039", "경남은행": "039",
  "새마을": "045", "새마을금고": "045",
  "신협": "048",
  "우체국": "071",
  "하나": "081", "하나은행": "081",
  "신한": "088", "신한은행": "088",
  "케이": "089", "케이뱅크": "089", "K뱅크": "089",
  "카카오": "090", "카카오뱅크": "090",
  "토스": "092", "토스뱅크": "092",
};

function getBankCode(bankName: string | null): string {
  if (!bankName) return "";
  const trimmed = bankName.trim();
  if (BANK_CODE_MAP[trimmed]) return BANK_CODE_MAP[trimmed];
  // 부분 매칭
  for (const [key, code] of Object.entries(BANK_CODE_MAP)) {
    if (trimmed.includes(key)) return code;
  }
  return "";
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientIds } = await req.json();
  if (!clientIds || clientIds.length === 0) {
    return NextResponse.json({ error: "선택된 고객사가 없습니다" }, { status: 400 });
  }

  // 설정에서 템플릿 경로 가져오기
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { cmsBulkExcelPath: true },
  });

  if (!settings?.cmsBulkExcelPath) {
    return NextResponse.json({ error: "설정에서 CMS 일괄등록 엑셀 템플릿을 먼저 업로드해주세요" }, { status: 400 });
  }

  // 고객사 데이터 가져오기
  const clients = await prisma.client.findMany({
    where: {
      id: { in: clientIds.map(Number) },
      assignedUserId: session.id,
    },
    select: {
      name: true,
      ceoName: true,
      phone: true,
      bankName: true,
      bankAccount: true,
      residentNumber: true,
      bizNumber: true,
      clientType: true,
      monthlyFee: true,
      firstWithdrawalMonth: true,
    },
    orderBy: { name: "asc" },
  });

  if (clients.length === 0) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }

  // 템플릿 파일 읽기
  const templateRelPath = settings.cmsBulkExcelPath.replace(/^\/api\/uploads\//, "/uploads/");
  const templatePath = path.join(process.cwd(), "public", templateRelPath);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(templatePath);
  } catch {
    return NextResponse.json({ error: "CMS 일괄등록 엑셀 템플릿 파일을 찾을 수 없습니다" }, { status: 404 });
  }
  const ws = workbook.worksheets[0];

  // 데이터 입력 (A4부터 시작)
  clients.forEach((client, i) => {
    const row = 4 + i;
    const phone = (client.phone || "").replace(/[-\s]/g, "");
    const bankCode = getBankCode(client.bankName);
    const bankAccount = (client.bankAccount || "").replace(/[-\s]/g, "");

    // K: 예금주명 - 개인이면 대표자명, 법인이면 거래처명
    const depositor = client.clientType === "corporate" ? client.name : (client.ceoName || "");

    // L: 개인사업자는 주민번호 앞6자리, 법인은 사업자번호 10자리
    let idNumber = "";
    if (client.clientType === "corporate") {
      idNumber = (client.bizNumber || "").replace(/[-\s]/g, "").slice(0, 10);
    } else {
      idNumber = (client.residentNumber || "").replace(/[-\s]/g, "").slice(0, 6);
    }

    // P: 최초출금월 YYYYMM
    const firstMonth = (client.firstWithdrawalMonth || "").replace("-", "");

    ws.getCell(`A${row}`).value = client.name;
    ws.getCell(`E${row}`).value = phone;
    ws.getCell(`I${row}`).value = bankCode;
    ws.getCell(`J${row}`).value = bankAccount;
    ws.getCell(`K${row}`).value = depositor;
    ws.getCell(`L${row}`).value = idNumber;
    ws.getCell(`M${row}`).value = client.monthlyFee ?? 0;
    ws.getCell(`N${row}`).value = "05";
    ws.getCell(`O${row}`).value = "99";
    ws.getCell(`P${row}`).value = firstMonth;
    ws.getCell(`AA${row}`).value = "N";
  });

  // Excel 파일 생성
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CMS_bulk_register.xlsx"`,
    },
  });
}
