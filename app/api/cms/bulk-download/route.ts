import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import path from "path";
import { readFile } from "fs/promises";
import XLSX from "xlsx";

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

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { cmsBulkExcelPath: true },
  });

  if (!settings?.cmsBulkExcelPath) {
    return NextResponse.json({ error: "설정에서 CMS 일괄등록 엑셀 템플릿을 먼저 업로드해주세요" }, { status: 400 });
  }

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

  let wb: XLSX.WorkBook;
  try {
    const buf = await readFile(templatePath);
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "CMS 일괄등록 엑셀 템플릿 파일을 찾을 수 없습니다" }, { status: 404 });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];

  // 데이터 입력 (A4부터 시작, 0-indexed row=3)
  clients.forEach((client, i) => {
    const row = 4 + i; // 1-indexed for cell references
    const phone = (client.phone || "").replace(/[-\s]/g, "");
    const bankCode = getBankCode(client.bankName);
    const bankAccount = (client.bankAccount || "").replace(/[-\s]/g, "");
    const depositor = client.clientType === "corporate" ? client.name : (client.ceoName || "");

    let idNumber = "";
    if (client.clientType === "corporate") {
      idNumber = (client.bizNumber || "").replace(/[-\s]/g, "").slice(0, 10);
    } else {
      idNumber = (client.residentNumber || "").replace(/[-\s]/g, "").slice(0, 6);
    }

    const firstMonth = (client.firstWithdrawalMonth || "").replace("-", "");

    ws[`A${row}`] = { t: "s", v: client.name };
    ws[`E${row}`] = { t: "s", v: phone };
    ws[`I${row}`] = { t: "s", v: bankCode };
    ws[`J${row}`] = { t: "s", v: bankAccount };
    ws[`K${row}`] = { t: "s", v: depositor };
    ws[`L${row}`] = { t: "s", v: idNumber };
    ws[`M${row}`] = { t: "n", v: client.monthlyFee ?? 0 };
    ws[`N${row}`] = { t: "s", v: "05" };
    ws[`O${row}`] = { t: "s", v: "99" };
    ws[`P${row}`] = { t: "s", v: firstMonth };
    ws[`AA${row}`] = { t: "s", v: "N" };
  });

  // 범위 업데이트
  const lastRow = 4 + clients.length - 1;
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  if (lastRow > range.e.r + 1) range.e.r = lastRow - 1;
  if (26 > range.e.c) range.e.c = 26; // AA = column 26
  ws["!ref"] = XLSX.utils.encode_range(range);

  const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

  return new NextResponse(outBuf, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": `attachment; filename="CMS_bulk_register.xls"`,
    },
  });
}
