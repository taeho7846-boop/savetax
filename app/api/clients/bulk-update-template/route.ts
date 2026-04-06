import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const headers = [
    "사업자등록번호",
    "고객사명",
    "대표자명",
    "주민등록번호",
    "연락처",
    "이메일",
    "구분(개인/법인)",
    "과세유형(과세/면세/간이)",
    "신고유형(기장대리/신고대리)",
    "인건비(근로소득,사업소득,일용직)",
    "6개월납(Y/N)",
    "개업년월일(YYYY-MM-DD)",
    "주소",
    "홈택스ID",
    "홈택스PW",
    "월기장료",
    "무료기장(개월)",
    "최초출금월(YYYY-MM)",
    "출금은행",
    "출금계좌번호",
    "회계프로그램(위하고/세무사랑)",
    "소통방법(메일/카톡/문자)",
    "소속",
    "담당직원",
    "법인등록번호",
    "마이박스링크",
    "특이사항",
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);

  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length * 2, 14) }));

  XLSX.utils.book_append_sheet(wb, ws, "일괄수정");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"savetax-bulk-update-template.xlsx\"",
    },
  });
}
