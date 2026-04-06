import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIds } = await req.json();
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return NextResponse.json({ error: "No clients selected" }, { status: 400 });
  }

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, isDeleted: false },
    include: { assignedUser: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const rows = clients.map((c) => ({
    "고객사명": c.name,
    "대표자명": c.ceoName ?? "",
    "사업자번호": c.bizNumber ?? "",
    "전화번호": c.phone ?? "",
    "구분": c.clientType === "corporate" ? "법인" : "개인",
    "세금유형": c.taxTypes ?? "",
    "신고유형": c.laborTypes ?? "",
    "출금은행": c.bankName ?? "",
    "계좌번호": c.bankAccount ?? "",
    "월 기장료": c.monthlyFee ?? "",
    "담당자": c.assignedUser?.name ?? "",
    "회계프로그램": c.accountingProgram ?? "",
    "소통방법": c.contactMethod ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // 열 너비 설정
  ws["!cols"] = [
    { wch: 20 }, // 고객사명
    { wch: 12 }, // 대표자명
    { wch: 15 }, // 사업자번호
    { wch: 15 }, // 전화번호
    { wch: 6 },  // 구분
    { wch: 12 }, // 세금유형
    { wch: 20 }, // 신고유형
    { wch: 12 }, // 출금은행
    { wch: 18 }, // 계좌번호
    { wch: 12 }, // 월 기장료
    { wch: 10 }, // 담당자
    { wch: 12 }, // 회계프로그램
  ];

  XLSX.utils.book_append_sheet(wb, ws, "고객사정보");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clients_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
