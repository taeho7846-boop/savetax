import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const headers = [
    "고객사명", "사업자등록번호", "대표자명", "주민등록번호", "연락처",
    "구분(개인/법인)", "과세유형(과세/면세/간이)", "신고유형(기장대리/신고대리)",
    "인건비(1인사업자,근로소득,사업소득,일용직)", "개업년월일(YYYY-MM-DD)", "6개월납(Y/N)",
    "홈택스ID", "홈택스PW",
    "월기장료", "무료기장(개월)", "최초출금월(YYYY-MM)", "출금은행", "출금계좌번호",
    "소속", "주소", "특이사항", "마이박스링크",
  ];

  // 예시 데이터
  const sample = [
    "홍길동세무", "123-45-67890", "홍길동", "900101-1234567", "010-1234-5678",
    "개인", "과세", "기장대리",
    "근로소득,사업소득", "2019-03-01", "N",
    "hong123", "pw1234",
    "110000", "2", "2026-04", "국민은행", "123-456-789012",
    "세이브택스", "서울시 강남구", "특이사항 없음", "",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);

  // 컬럼 너비 설정
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length * 2, 14) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "거래처 대량등록");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=savetax-bulk-template.xlsx",
    },
  });
}
