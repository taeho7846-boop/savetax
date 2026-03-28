import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import path from "path";
import { readFile, mkdir, unlink } from "fs/promises";
import { spawn } from "child_process";
import * as XLSX from "xlsx";
import archiver from "archiver";
import { Readable } from "stream";

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

  const { clientIds } = await req.json();
  if (!clientIds || clientIds.length === 0) {
    return NextResponse.json({ error: "선택된 고객사가 없습니다" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { cmsBulkExcelPath: true, cmsExcelPath: true },
  });

  if (!settings?.cmsBulkExcelPath) {
    return NextResponse.json({ error: "설정에서 CMS 일괄등록 엑셀을 먼저 업로드해주세요" }, { status: 400 });
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

  // === 1. 일괄등록 엑셀 생성 ===
  const bulkRelPath = settings.cmsBulkExcelPath.replace(/^\/api\/uploads\//, "/uploads/");
  const bulkTemplatePath = path.join(process.cwd(), "public", bulkRelPath);

  let bulkBuf: Buffer;
  try {
    const raw = await readFile(bulkTemplatePath);
    const wb = XLSX.read(raw, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    clients.forEach((client, i) => {
      const row = 4 + i;
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

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const lastRow = 4 + clients.length - 1;
    if (lastRow > range.e.r + 1) range.e.r = lastRow - 1;
    if (26 > range.e.c) range.e.c = 26;
    ws["!ref"] = XLSX.utils.encode_range(range);

    bulkBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" }) as Buffer;
  } catch {
    return NextResponse.json({ error: "일괄등록 엑셀 생성 실패" }, { status: 500 });
  }

  // === 2. 각 거래처별 CMS 신청서 PDF 생성 ===
  const pdfFiles: { name: string; data: Buffer }[] = [];

  if (settings.cmsExcelPath) {
    const cmsRelPath = settings.cmsExcelPath.replace(/^\/api\/uploads\//, "/uploads/");
    const cmsTemplatePath = path.join(process.cwd(), "public", cmsRelPath);
    const scriptPath = path.join(process.cwd(), "scripts", "generate_cms_form.py");
    const tmpDir = path.join(process.cwd(), "tmp", "cms_pdfs");
    await mkdir(tmpDir, { recursive: true });

    for (const client of clients) {
      const phone = (client.phone || "").replace(/[-\s]/g, "");
      const bankAccount = (client.bankAccount || "").replace(/[-\s]/g, "");
      const depositor = client.clientType === "corporate" ? client.name : (client.ceoName || "");
      const resident6 = client.clientType === "individual"
        ? (client.residentNumber || "").replace(/[-\s]/g, "").slice(0, 6)
        : "";
      const bizNumber = client.clientType === "corporate"
        ? (client.bizNumber || "").replace(/[-\s]/g, "")
        : "";
      const firstMonth = (client.firstWithdrawalMonth || "").replace("-", "");
      const stampName = client.clientType === "corporate" ? client.name : (client.ceoName || client.name);

      const safeName = client.name.replace(/[/\\:*?"<>|]/g, "_");
      const outputPdf = path.join(tmpDir, `${safeName}_CMS신청서.pdf`);

      const result = await runPython([
        scriptPath,
        cmsTemplatePath,
        outputPdf,
        firstMonth,
        depositor,
        resident6,
        client.bankName || "",
        bizNumber,
        bankAccount,
        phone,
        stampName,
        client.clientType || "individual",
      ]);

      if (result.ok) {
        try {
          const pdfData = await readFile(outputPdf);
          pdfFiles.push({ name: `${safeName}_CMS신청서.pdf`, data: pdfData });
        } catch {}
      }

      // 임시 파일 삭제
      try { await unlink(outputPdf); } catch {}
    }
  }

  // === 3. ZIP으로 묶기 ===
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Buffer[] = [];

  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  // 일괄등록 엑셀 추가
  archive.append(bulkBuf, { name: "CMS_일괄등록.xls" });

  // PDF 파일들 추가
  for (const pdf of pdfFiles) {
    archive.append(pdf.data, { name: pdf.name });
  }

  await archive.finalize();
  await archiveFinished;

  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''CMS_%EC%9D%BC%EA%B4%84%EB%93%B1%EB%A1%9D.zip`,
    },
  });
}
