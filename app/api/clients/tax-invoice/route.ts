import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { readFile } from "fs/promises";
import { join } from "path";

const COL_KEYS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
  "P","Q","R","S","T","U","V","W","X","Y","Z",
  "AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY"
];

function getLastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function colIndex(key: string): number {
  return COL_KEYS.indexOf(key);
}

async function loadTemplate(filePath: string | null | undefined): Promise<XLSX.WorkBook | null> {
  if (!filePath) return null;
  try {
    // /api/uploads/settings/file.xlsx → public/uploads/settings/file.xlsx
    const localPath = filePath.replace(/^\/api\/uploads\//, "uploads/");
    const fullPath = join(process.cwd(), "public", localPath);
    console.log("[T/I] 템플릿 로드:", fullPath);
    const buf = await readFile(fullPath);
    return XLSX.read(buf, { type: "buffer" });
  } catch (err) {
    console.error("[T/I] 템플릿 로드 실패:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIds, yearMonth } = await req.json();
  if (!Array.isArray(clientIds) || clientIds.length === 0 || !yearMonth) {
    return NextResponse.json({ error: "clientIds와 yearMonth 필요" }, { status: 400 });
  }

  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = getLastDay(year, month);
  const dateStr = `${year}${String(month).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
  const dayStr = String(lastDay).padStart(2, "0");

  const [clients, settings] = await Promise.all([
    prisma.client.findMany({
      where: { id: { in: clientIds }, isDeleted: false },
      orderBy: { name: "asc" },
    }),
    prisma.settings.findUnique({ where: { userId: session.id } }),
  ]);

  const validClients = clients.filter((c) => c.monthlyFee && c.monthlyFee > 0);
  const isBulk = validClients.length > 100;
  const START_ROW = 6; // 7행 = index 6

  // 공급자 정보 (설정에서)
  const supplierBizNum = (settings?.tiSupplierBizNum ?? "").replace(/-/g, "");
  const supplierName = settings?.tiSupplierName ?? "";
  const supplierCeoName = settings?.tiSupplierCeoName ?? "";

  // 템플릿 로드
  const templatePath = isBulk ? settings?.tiBulkExcelPath : settings?.tiNormalExcelPath;
  const templateWb = await loadTemplate(templatePath);

  let wb: XLSX.WorkBook;
  let ws: XLSX.WorkSheet;

  if (templateWb) {
    wb = templateWb;
    ws = wb.Sheets[wb.SheetNames[0]];
  } else {
    return NextResponse.json(
      { error: `설정에서 ${isBulk ? "대량등록발행" : "일반발행"} 엑셀 템플릿을 먼저 업로드하세요` },
      { status: 400 }
    );
  }

  validClients.forEach((c, i) => {
    const row = START_ROW + i;
    const fee = c.monthlyFee!;
    const supply = Math.round(fee / 1.1 / 10) * 10;
    const vat = fee - supply;
    const clientBizNum = (c.bizNumber ?? "").replace(/-/g, "");

    // 빈 행 배열 (A~AY = 51 columns)
    const cells: (string | number)[] = new Array(51).fill("");

    if (isBulk) {
      // === 대량발행 (기존 형식, 7행부터) ===
      cells[colIndex("A")] = "01";
      cells[colIndex("B")] = dateStr;
      cells[colIndex("C")] = clientBizNum;
      cells[colIndex("E")] = c.name;
      cells[colIndex("F")] = c.ceoName ?? "";
      cells[colIndex("L")] = supply;
      cells[colIndex("M")] = vat;
      cells[colIndex("O")] = dayStr;
      cells[colIndex("T")] = supply;
      cells[colIndex("U")] = vat;
      cells[colIndex("AY")] = "01";
    } else {
      // === 일반발행 (공급자 정보 포함, 7행부터) ===
      cells[colIndex("A")] = "01";
      cells[colIndex("B")] = dateStr;
      cells[colIndex("C")] = supplierBizNum;       // 공급자 사업자등록번호
      cells[colIndex("E")] = supplierName;          // 공급자 상호
      cells[colIndex("F")] = supplierCeoName;       // 공급자 성명
      cells[colIndex("K")] = clientBizNum;           // 공급받는자 사업자등록번호
      cells[colIndex("M")] = c.name;                 // 공급받는자 상호
      cells[colIndex("N")] = c.ceoName ?? "";         // 공급받는자 성명
      cells[colIndex("T")] = supply;                  // 공급가액
      cells[colIndex("U")] = vat;                     // 부가세
      cells[colIndex("W")] = dayStr;                  // 일자 (2자리)
      cells[colIndex("AB")] = supply;                 // = T
      cells[colIndex("AC")] = vat;                    // = U
      cells[colIndex("AY")] = "01";
    }

    // 셀 쓰기
    cells.forEach((val, ci) => {
      if (val === "") return;
      const cellRef = XLSX.utils.encode_cell({ r: row, c: ci });
      ws[cellRef] = { t: typeof val === "number" ? "n" : "s", v: val };
    });
  });

  // 시트 범위 업데이트
  const lastDataRow = START_ROW + validClients.length - 1;
  const existingRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
  existingRange.e.r = Math.max(existingRange.e.r, lastDataRow);
  existingRange.e.c = Math.max(existingRange.e.c, 50); // AY = 50
  ws["!ref"] = XLSX.utils.encode_range(existingRange);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fileName = isBulk ? `TI_대량_${yearMonth}.xlsx` : `TI_일반_${yearMonth}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
