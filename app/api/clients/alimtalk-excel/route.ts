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

  // 헤더 (1행)
  ws.columns = [
    { header: "휴대폰번호", key: "phone", width: 18 },
    { header: "이름", key: "name", width: 12 },
    { header: "[*1*]", key: "v1", width: 10 },
    { header: "[*2*]", key: "v2", width: 10 },
    { header: "[*3*]", key: "v3", width: 10 },
    { header: "[*4*]", key: "v4", width: 25 },
    { header: "수신거부", key: "reject", width: 10 },
  ];

  // 데이터 (2행부터)
  for (const c of unique) {
    ws.addRow({
      phone: c.phone || "",
      name: c.ceoName || "",
      v1: "대표님",
      v2: "",
      v3: "",
      v4: "세무법인 세이브택스 논현지점",
      reject: "N",
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
