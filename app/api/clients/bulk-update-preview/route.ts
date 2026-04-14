import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

function parseWithdrawalMonth(val: string): string | null {
  // 1) 엑셀 시리얼 번호
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // 2) YYYY-MM-DD 또는 YYYY-MM
  const ym = val.match(/(\d{4})[.\-/](\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  // 3) YYYYMM
  const digits = val.replace(/[^0-9]/g, "");
  if (digits.length === 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  return null;
}

// POST: 미리보기 (최초출금월 변경 목록 반환)
// PUT: 실제 덮어쓰기 실행
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

  if (rows.length < 2) return NextResponse.json({ error: "데이터가 없습니다" }, { status: 400 });

  const headerRow = rows[0];
  let bizCol = -1;
  let withdrawalCol = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const raw = String(headerRow[i] ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (raw.includes("사업자") && (raw.includes("번호") || raw.includes("등록"))) bizCol = i;
    if (raw.includes("출금월") || raw.includes("최초출금")) withdrawalCol = i;
  }

  if (bizCol === -1) return NextResponse.json({ error: "사업자등록번호 열을 찾을 수 없습니다" }, { status: 400 });
  if (withdrawalCol === -1) return NextResponse.json({ error: "최초출금월 열을 찾을 수 없습니다" }, { status: 400 });

  const changes: { clientId: number; clientName: string; bizNumber: string; currentValue: string | null; newValue: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawBiz = String(row[bizCol] ?? "").trim();
    if (!rawBiz) continue;

    const bizClean = rawBiz.replace(/[^0-9]/g, "");
    if (bizClean.length < 10) continue;

    let rawVal = row[withdrawalCol];
    if (rawVal instanceof Date) {
      rawVal = `${rawVal.getFullYear()}-${String(rawVal.getMonth() + 1).padStart(2, "0")}`;
    }
    const val = String(rawVal ?? "").trim();
    if (!val) continue;

    const newValue = parseWithdrawalMonth(val);
    if (!newValue) continue;

    const bizFormatted = `${bizClean.slice(0, 3)}-${bizClean.slice(3, 5)}-${bizClean.slice(5, 10)}`;
    const client = await prisma.client.findFirst({
      where: {
        isDeleted: false,
        OR: [{ bizNumber: bizClean }, { bizNumber: bizFormatted }, { bizNumber: rawBiz }],
      },
      select: { id: true, name: true, bizNumber: true, firstWithdrawalMonth: true },
    });

    if (!client) continue;

    // 값이 다른 경우만 (새로 채우기 + 덮어쓰기 모두 포함)
    if (client.firstWithdrawalMonth !== newValue) {
      changes.push({
        clientId: client.id,
        clientName: client.name,
        bizNumber: client.bizNumber || rawBiz,
        currentValue: client.firstWithdrawalMonth,
        newValue,
      });
    }
  }

  return NextResponse.json({ changes, total: changes.length });
}

// PUT: 실제 덮어쓰기 실행
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { changes } = await req.json() as { changes: { clientId: number; newValue: string }[] };

  let updated = 0;
  for (const c of changes) {
    await prisma.client.update({
      where: { id: c.clientId },
      data: { firstWithdrawalMonth: c.newValue },
    });
    updated++;
  }

  return NextResponse.json({ updated });
}
