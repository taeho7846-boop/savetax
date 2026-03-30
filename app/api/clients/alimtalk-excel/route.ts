import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ExcelJS from "exceljs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 모든 사용자의 거래처에서 대표자명 + 전화번호 조회
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: "active",
      ceoName: { not: "" },
      phone: { not: "" },
    },
    select: {
      name: true,
      ceoName: true,
      phone: true,
    },
    orderBy: { ceoName: "asc" },
  });

  // 대표자명 + 전화번호 기준 중복 제거 (같은 대표님이 사업장 여러개인 경우)
  const seen = new Set<string>();
  const unique = clients.filter((c) => {
    const key = `${c.ceoName}|${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("알림톡 발송 목록");

  // 헤더
  ws.columns = [
    { header: "대표자명", key: "ceoName", width: 15 },
    { header: "전화번호", key: "phone", width: 18 },
  ];

  // 헤더 스타일
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF94A3B8" } },
    };
  });

  // 데이터
  for (const c of unique) {
    ws.addRow({
      ceoName: c.ceoName || "",
      phone: c.phone || "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("알림톡_발송목록.xlsx")}`,
    },
  });
}
