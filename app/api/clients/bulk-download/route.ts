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

  // 일괄수정 템플릿과 동일한 헤더 순서
  const rows = clients.map((c) => ({
    "사업자등록번호": c.bizNumber ?? "",
    "고객사명": c.name,
    "대표자명": c.ceoName ?? "",
    "주민등록번호": c.residentNumber ?? "",
    "연락처": c.phone ?? "",
    "이메일": c.email ?? "",
    "구분(개인/법인)": c.clientType === "corporate" ? "법인" : "개인",
    "과세유형(과세/면세/간이)": c.taxationType ?? "",
    "신고유형(기장대리/신고대리)": c.taxTypes ?? "",
    "인건비(근로소득,사업소득,일용직)": c.laborTypes ?? "",
    "6개월납(Y/N)": c.halfYearTax ? "Y" : "N",
    "개업년월일(YYYY-MM-DD)": c.openDate ?? "",
    "주소": c.address ?? "",
    "홈택스ID": c.hometaxId ?? "",
    "홈택스PW": c.hometaxPw ?? "",
    "월기장료": c.monthlyFee ?? "",
    "무료기장(개월)": c.freeMonths ?? "",
    "최초출금월(YYYY-MM)": c.firstWithdrawalMonth ?? "",
    "출금은행": c.bankName ?? "",
    "출금계좌번호": c.bankAccount ?? "",
    "회계프로그램(위하고/세무사랑)": c.accountingProgram ?? "",
    "소통방법(메일/카톡/문자)": c.contactMethod ?? "",
    "원천세유형(A/B/C/D)": c.withholdingType ?? "",
    "CMS상태": c.cmsStatus === "done" ? "등록" : c.cmsStatus === "pending" ? "등록요청중" : "미등록",
    "소속": c.affiliation ?? "",
    "담당직원": c.assignedUser?.name ?? "",
    "법인등록번호": c.corporateNumber ?? "",
    "구글드라이브": c.driveFolderId ? `https://drive.google.com/drive/folders/${c.driveFolderId}` : "",
    "특이사항": c.notes ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 15 },
    { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 22 },
    { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
    { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 40 }, { wch: 30 },
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
