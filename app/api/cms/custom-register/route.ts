import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import path from "path";
import { readFile, mkdir, unlink } from "fs/promises";
import { spawn } from "child_process";
import * as XLSX from "xlsx";
import archiver from "archiver";

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

function runPython(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(cmd, args, {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, output: "시간 초과" }); }, 120000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: code === 0 ? stdout : stderr || stdout });
    });
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const {
    withdrawalType,    // "auto" | "instant" (기본 auto)
    office,            // "savetax" | "personal"
    clientType,        // "individual" | "corporate"
    name,
    ceoName,
    phone,
    bankName,
    bankAccount,
    residentNumber,
    bizNumber,
    amount,            // 금액 (number | string)
    firstMonth,        // 최초출금월 "YYYY-MM" or "YYYYMM"
    withdrawalDay,     // 출금일 (number | string)
  } = body ?? {};

  const isInstant = withdrawalType === "instant";  // 바로출금

  // === 입력값 검증 ===
  if (!name?.trim()) {
    return NextResponse.json({ error: "거래처명을 입력해주세요" }, { status: 400 });
  }
  if (!bankName?.trim() || !bankAccount?.trim()) {
    return NextResponse.json({ error: "은행명과 계좌번호를 입력해주세요" }, { status: 400 });
  }
  const isCorp = clientType === "corporate";
  const depositor = isCorp ? name : (ceoName || "");
  if (!depositor.trim()) {
    return NextResponse.json({ error: "예금주(개인은 대표자명)를 입력해주세요" }, { status: 400 });
  }
  if (amount === undefined || amount === null || amount === "" || isNaN(Number(amount))) {
    return NextResponse.json({ error: "금액을 입력해주세요" }, { status: 400 });
  }
  // 바로출금은 최초출금월·출금일 불필요
  let firstMonthDigits = "";
  let withdrawalDay2 = "";
  if (!isInstant) {
    firstMonthDigits = String(firstMonth ?? "").replace(/\D/g, "");
    if (firstMonthDigits.length !== 6) {
      return NextResponse.json({ error: "최초출금월을 선택해주세요" }, { status: 400 });
    }
    const dayNum = parseInt(String(withdrawalDay), 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      return NextResponse.json({ error: "출금일을 1~31 사이로 입력해주세요" }, { status: 400 });
    }
    withdrawalDay2 = String(dayNum).padStart(2, "0");
  }

  // === 설정에서 양식 경로 ===
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { cmsBulkExcelPath: true, cmsInstantExcelPath: true, cmsExcelPath: true, cmsExcelPersonalPath: true },
  });

  // 자동이체 → 일괄등록 엑셀 / 바로출금 → 바로출금 엑셀
  const bulkExcelPath = isInstant ? settings?.cmsInstantExcelPath : settings?.cmsBulkExcelPath;
  if (!bulkExcelPath) {
    return NextResponse.json(
      { error: isInstant ? "설정에서 바로출금 일괄등록 엑셀을 먼저 업로드해주세요" : "설정에서 CMS 일괄등록 엑셀을 먼저 업로드해주세요" },
      { status: 400 }
    );
  }
  const formPath = office === "personal" ? settings?.cmsExcelPersonalPath : settings?.cmsExcelPath;
  if (!formPath) {
    const label = office === "personal" ? "개인 세무회계사무소" : "세이브택스 논현지점";
    return NextResponse.json({ error: `설정 → 파일 업로드에서 ${label} CMS 신청서 양식을 먼저 업로드해주세요` }, { status: 400 });
  }

  // 공통 값
  const phoneClean = (phone || "").replace(/[-\s]/g, "");
  const bankAccountClean = (bankAccount || "").replace(/[-\s]/g, "");
  const bizDigits = (bizNumber || "").replace(/[-\s]/g, "");
  const idNumber = isCorp
    ? bizDigits.slice(0, 10)
    : (residentNumber || "").replace(/[-\s]/g, "").slice(0, 6);
  const safeName = name.replace(/[/\\:*?"<>|]/g, "_");

  // === 1. 일괄등록 엑셀 생성 (단일 행) ===
  const bulkRelPath = bulkExcelPath.replace(/^\/api\/uploads\//, "/uploads/");
  const bulkTemplatePath = path.join(process.cwd(), "public", bulkRelPath);

  let bulkBuf: Buffer;
  try {
    const raw = await readFile(bulkTemplatePath);
    const wb = XLSX.read(raw, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const row = 4;
    let maxCol = 0;
    if (isInstant) {
      // 바로출금 엑셀: 출금월·출금일 칼럼 없이 한 칸씩 당겨진 양식
      ws[`A${row}`] = { t: "s", v: name };               // 회원명 = 거래처명
      ws[`D${row}`] = { t: "s", v: phoneClean };          // 휴대폰번호 (숫자만)
      ws[`H${row}`] = { t: "s", v: getBankCode(bankName) }; // 출금은행 (은행코드)
      ws[`I${row}`] = { t: "s", v: bankAccountClean };    // 계좌번호
      ws[`J${row}`] = { t: "s", v: depositor };           // 예금주명
      ws[`K${row}`] = { t: "s", v: idNumber };            // (개인)주민6 / (법인)사업자번호
      ws[`L${row}`] = { t: "n", v: Number(amount) };      // 납부금액 (숫자만)
      maxCol = 11; // L
    } else {
      // 자동이체 일괄등록 엑셀
      ws[`A${row}`] = { t: "s", v: name };
      ws[`E${row}`] = { t: "s", v: phoneClean };
      ws[`I${row}`] = { t: "s", v: getBankCode(bankName) };
      ws[`J${row}`] = { t: "s", v: bankAccountClean };
      ws[`K${row}`] = { t: "s", v: depositor };
      ws[`L${row}`] = { t: "s", v: idNumber };
      ws[`M${row}`] = { t: "n", v: Number(amount) };
      ws[`N${row}`] = { t: "s", v: withdrawalDay2 };
      ws[`O${row}`] = { t: "s", v: "99" };
      ws[`P${row}`] = { t: "s", v: firstMonthDigits };
      ws[`R${row}`] = { t: "s", v: bizDigits };
      ws[`AA${row}`] = { t: "s", v: "N" };
      maxCol = 26; // AA
    }

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    if (row > range.e.r + 1) range.e.r = row - 1;
    if (maxCol > range.e.c) range.e.c = maxCol;
    ws["!ref"] = XLSX.utils.encode_range(range);

    bulkBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" }) as Buffer;
  } catch {
    return NextResponse.json({ error: "일괄등록 엑셀 생성 실패" }, { status: 500 });
  }

  // === 2. CMS 신청서 PDF 생성 (선택한 양식 + 도장) ===
  const cmsRelPath = formPath.replace(/^\/api\/uploads\//, "/uploads/");
  const cmsTemplatePath = path.join(process.cwd(), "public", cmsRelPath);
  const scriptPath = path.join(process.cwd(), "scripts", "generate_cms_form.py");
  const tmpDir = path.join(process.cwd(), "tmp", "cms_pdfs");
  await mkdir(tmpDir, { recursive: true });
  const outputPdf = path.join(tmpDir, `${safeName}_CMS신청서.pdf`);
  const stampName = isCorp ? name : (ceoName || name);

  let pdfBuf: Buffer | null = null;
  const result = await runPython([
    scriptPath,
    cmsTemplatePath,
    outputPdf,
    firstMonthDigits,
    depositor,
    isCorp ? "" : idNumber,
    bankName || "",
    isCorp ? bizDigits : "",
    bankAccountClean,
    phoneClean,
    stampName,
    isCorp ? "corporate" : "individual",
    withdrawalDay2,   // 출금일 → PDF 신청서 D9
  ]);
  if (result.ok) {
    try { pdfBuf = await readFile(outputPdf); } catch {}
  }
  try { await unlink(outputPdf); } catch {}

  if (!pdfBuf) {
    return NextResponse.json({ error: `CMS 신청서 PDF 생성 실패: ${result.output.slice(0, 300)}` }, { status: 500 });
  }

  // === 3. ZIP으로 묶기 ===
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  archive.append(bulkBuf, { name: isInstant ? "바로출금_일괄등록.xls" : "CMS_일괄등록.xls" });
  archive.append(pdfBuf, { name: `${safeName}_CMS신청서.pdf` });

  await archive.finalize();
  await archiveFinished;

  const zipBuffer = Buffer.concat(chunks);
  const zipName = `${safeName}_CMS.zip`;

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  });
}
