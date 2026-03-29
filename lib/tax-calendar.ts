// 세무 일정 데이터 (2026년 기준, 매년 날짜만 조정하면 됨)
// priority: "core" = 캘린더에 표시, "optional" = 아래 참고 목록

export type TaxEvent = {
  month: number;
  day: number;
  title: string;
  desc: string;
  priority: "core" | "optional";
};

export const TAX_EVENTS: TaxEvent[] = [
  // ── 1월 ──
  { month: 1, day: 12, title: "원천세 신고 납부", desc: "2025.12월분 (반기납: 2025.7~12월분)", priority: "core" },
  { month: 1, day: 26, title: "부가가치세 확정신고", desc: "2기 확정 (2025.7~12월분)", priority: "core" },
  { month: 1, day: 12, title: "ICL 원천공제 신고 납부", desc: "2025.12월분", priority: "optional" },
  { month: 1, day: 12, title: "인지세 납부", desc: "2025.12월 작성분", priority: "optional" },
  { month: 1, day: 26, title: "주세 신고 납부", desc: "2025.10~12월분", priority: "optional" },
  { month: 1, day: 26, title: "개별소비세 신고 납부", desc: "2025.10~12월분", priority: "optional" },

  // ── 2월 ──
  { month: 2, day: 2, title: "간이지급명세서(근로) 제출", desc: "2025.7~12월 지급분", priority: "core" },
  { month: 2, day: 2, title: "간이지급명세서(사업) 제출", desc: "2025.12월 지급분", priority: "core" },
  { month: 2, day: 2, title: "일용근로소득지급명세서 제출", desc: "2025.12월 지급분", priority: "core" },
  { month: 2, day: 10, title: "원천세 신고 납부", desc: "2026.1월분", priority: "core" },
  { month: 2, day: 10, title: "면세사업자 사업장 현황신고", desc: "2025년 귀속", priority: "core" },
  { month: 2, day: 2, title: "소득세 중간예납 분납", desc: "2025.1~6월분", priority: "optional" },
  { month: 2, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.1월분", priority: "optional" },
  { month: 2, day: 10, title: "인지세 납부", desc: "2026.1월 작성분", priority: "optional" },
  { month: 2, day: 25, title: "개별소비세 과세유흥장소", desc: "2026.1월분", priority: "optional" },

  // ── 3월 ──
  { month: 3, day: 3, title: "지급명세서 제출", desc: "2025.1~12월분 (근로·퇴직·연금 제외)", priority: "core" },
  { month: 3, day: 3, title: "간이지급명세서(사업) 제출", desc: "2026.1월 지급분", priority: "core" },
  { month: 3, day: 3, title: "일용근로소득지급명세서 제출", desc: "2026.1월 지급분", priority: "core" },
  { month: 3, day: 10, title: "근로·퇴직 등 지급명세서 제출", desc: "2025.1~12월분", priority: "core" },
  { month: 3, day: 10, title: "원천세 신고 납부 (연말정산)", desc: "2026.2월분, 2025 연말정산분", priority: "core" },
  { month: 3, day: 10, title: "연말정산 환급신청", desc: "2025 연말정산분", priority: "core" },
  { month: 3, day: 16, title: "근로장려금 신청 (하반기)", desc: "2025년 귀속 하반기분", priority: "core" },
  { month: 3, day: 31, title: "법인세 신고 납부 (12월말)", desc: "2025.1~12월분", priority: "core" },
  { month: 3, day: 31, title: "간이지급명세서(사업) 제출", desc: "2026.2월 지급분", priority: "core" },
  { month: 3, day: 31, title: "일용근로소득지급명세서 제출", desc: "2026.2월 지급분", priority: "core" },
  { month: 3, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.2월분", priority: "optional" },
  { month: 3, day: 10, title: "인지세 납부", desc: "2026.2월 작성분", priority: "optional" },
  { month: 3, day: 25, title: "개별소비세 과세유흥장소", desc: "2026.2월분", priority: "optional" },

  // ── 4월 ──
  { month: 4, day: 10, title: "원천세 신고 납부", desc: "2026.3월분", priority: "core" },
  { month: 4, day: 27, title: "부가가치세 예정신고", desc: "1기 예정 (2026.1~3월분)", priority: "core" },
  { month: 4, day: 30, title: "일용근로소득지급명세서 제출", desc: "2026.3월 지급분", priority: "core" },
  { month: 4, day: 30, title: "간이지급명세서(사업) 제출", desc: "2026.3월 지급분", priority: "core" },
  { month: 4, day: 30, title: "성실신고확인 법인 법인세", desc: "12월말 결산 (2025.1~12월분)", priority: "core" },
  { month: 4, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.3월분", priority: "optional" },
  { month: 4, day: 10, title: "인지세 납부", desc: "2026.3월 작성분", priority: "optional" },
  { month: 4, day: 27, title: "개별소비세 신고 납부", desc: "2026.1~3월분", priority: "optional" },
  { month: 4, day: 27, title: "주세 신고 납부", desc: "2026.1~3월분", priority: "optional" },

  // ── 5월 ──
  { month: 5, day: 11, title: "원천세 신고 납부", desc: "2026.4월분", priority: "core" },
  { month: 5, day: 11, title: "ICL 원천공제 신고 납부", desc: "2026.4월분", priority: "optional" },
  { month: 5, day: 11, title: "인지세 납부", desc: "2026.4월 작성분", priority: "optional" },
  { month: 5, day: 26, title: "개별소비세 과세유흥장소", desc: "2026.4월분", priority: "optional" },

  // ── 6월 ──
  { month: 6, day: 1, title: "종합소득세 확정신고 납부", desc: "2025년 귀속분", priority: "core" },
  { month: 6, day: 1, title: "근로·자녀장려금 정기 신청", desc: "2025년 귀속 정기 신청", priority: "core" },
  { month: 6, day: 1, title: "일용근로소득지급명세서 제출", desc: "2026.4월 지급분", priority: "core" },
  { month: 6, day: 1, title: "간이지급명세서(사업) 제출", desc: "2026.4월 지급분", priority: "core" },
  { month: 6, day: 10, title: "원천세 신고 납부", desc: "2026.5월분", priority: "core" },
  { month: 6, day: 30, title: "성실신고확인 종합소득세", desc: "2025년 귀속분", priority: "core" },
  { month: 6, day: 30, title: "사업용계좌 신고", desc: "2026년 복식부기의무자", priority: "core" },
  { month: 6, day: 30, title: "원천세 반기별 납부 신청", desc: "2026 하반기분", priority: "core" },
  { month: 6, day: 30, title: "간이지급명세서(사업) 제출", desc: "2026.5월 지급분", priority: "core" },
  { month: 6, day: 30, title: "일용근로소득지급명세서 제출", desc: "2026.5월 지급분", priority: "core" },
  { month: 6, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.5월분", priority: "optional" },
  { month: 6, day: 10, title: "인지세 납부", desc: "2026.5월 작성분", priority: "optional" },
  { month: 6, day: 25, title: "개별소비세 과세유흥장소", desc: "2026.5월분", priority: "optional" },
  { month: 6, day: 30, title: "ICL 납부통지서 의무상환액", desc: "2024년 귀속", priority: "optional" },

  // ── 7월 ──
  { month: 7, day: 10, title: "원천세 신고 납부", desc: "2026.6월분 (반기납: 2026.1~6월분)", priority: "core" },
  { month: 7, day: 27, title: "부가가치세 확정신고", desc: "1기 확정 (2026.1~6월분)", priority: "core" },
  { month: 7, day: 31, title: "간이지급명세서(근로) 제출", desc: "2026.1~6월 지급분", priority: "core" },
  { month: 7, day: 31, title: "간이지급명세서(사업) 제출", desc: "2026.6월 지급분", priority: "core" },
  { month: 7, day: 31, title: "일용근로소득지급명세서 제출", desc: "2026.6월 지급분", priority: "core" },
  { month: 7, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.6월분", priority: "optional" },
  { month: 7, day: 10, title: "인지세 납부", desc: "2026.6월 작성분", priority: "optional" },
  { month: 7, day: 27, title: "개별소비세 신고 납부", desc: "2026.4~6월분", priority: "optional" },
  { month: 7, day: 27, title: "주세 신고 납부", desc: "2026.4~6월분", priority: "optional" },

  // ── 8월 ──
  { month: 8, day: 3, title: "종합소득세 분납", desc: "2025년 귀속 (5월 신고분)", priority: "core" },
  { month: 8, day: 10, title: "원천세 신고 납부", desc: "2026.7월분", priority: "core" },
  { month: 8, day: 31, title: "간이지급명세서(사업) 제출", desc: "2026.7월 지급분", priority: "core" },
  { month: 8, day: 31, title: "일용근로소득지급명세서 제출", desc: "2026.7월 지급분", priority: "core" },
  { month: 8, day: 31, title: "법인세 중간예납 (12월말)", desc: "2026.1~6월분", priority: "core" },
  { month: 8, day: 31, title: "종합소득세 분납 (성실신고)", desc: "2025년 귀속분", priority: "core" },
  { month: 8, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.7월분", priority: "optional" },
  { month: 8, day: 10, title: "인지세 납부", desc: "2026.7월 작성분", priority: "optional" },
  { month: 8, day: 25, title: "개별소비세 과세유흥장소", desc: "2026.7월분", priority: "optional" },

  // ── 9월 ──
  { month: 9, day: 10, title: "원천세 신고 납부", desc: "2026.8월분", priority: "core" },
  { month: 9, day: 15, title: "근로·자녀장려금 신청 (상반기)", desc: "2026년 귀속 상반기분", priority: "core" },
  { month: 9, day: 30, title: "간이지급명세서(사업) 제출", desc: "2026.8월 지급분", priority: "core" },
  { month: 9, day: 30, title: "일용근로소득지급명세서 제출", desc: "2026.8월 지급분", priority: "core" },
  { month: 9, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.8월분", priority: "optional" },
  { month: 9, day: 10, title: "인지세 납부", desc: "2026.8월 작성분", priority: "optional" },
  { month: 9, day: 28, title: "개별소비세 과세유흥장소", desc: "2026.8월분", priority: "optional" },

  // ── 10월 ──
  { month: 10, day: 12, title: "원천세 신고 납부", desc: "2026.9월분", priority: "core" },
  { month: 10, day: 26, title: "부가가치세 예정신고", desc: "2기 예정 (2026.7~9월분)", priority: "core" },
  { month: 10, day: 12, title: "ICL 원천공제 신고 납부", desc: "2026.9월분", priority: "optional" },
  { month: 10, day: 12, title: "인지세 납부", desc: "2026.9월 작성분", priority: "optional" },
  { month: 10, day: 26, title: "개별소비세 신고 납부", desc: "2026.7~9월분", priority: "optional" },
  { month: 10, day: 26, title: "주세 신고 납부", desc: "2025.7~9월분", priority: "optional" },

  // ── 11월 ──
  { month: 11, day: 2, title: "일용근로소득지급명세서 제출", desc: "2026.9월 지급분", priority: "core" },
  { month: 11, day: 2, title: "간이지급명세서(사업) 제출", desc: "2026.9월 지급분", priority: "core" },
  { month: 11, day: 10, title: "원천세 신고 납부", desc: "2026.10월분", priority: "core" },
  { month: 11, day: 30, title: "소득세 중간예납 납부", desc: "2026.1~6월분", priority: "core" },
  { month: 11, day: 30, title: "근로·자녀장려금 기한 후 신청", desc: "2025년 귀속", priority: "core" },
  { month: 11, day: 30, title: "간이지급명세서(사업) 제출", desc: "2026.10월 지급분", priority: "core" },
  { month: 11, day: 30, title: "일용근로소득지급명세서 제출", desc: "2026.10월 지급분", priority: "core" },
  { month: 11, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.10월분", priority: "optional" },
  { month: 11, day: 10, title: "인지세 납부", desc: "2026.10월 작성분", priority: "optional" },
  { month: 11, day: 25, title: "개별소비세 과세유흥장소", desc: "2026.10월분", priority: "optional" },
  { month: 11, day: 30, title: "ICL 미리납부 (2회차)", desc: "2025년 귀속분", priority: "optional" },

  // ── 12월 ──
  { month: 12, day: 10, title: "원천세 신고 납부", desc: "2026.11월분", priority: "core" },
  { month: 12, day: 15, title: "종합부동산세 납부", desc: "2026년 귀속", priority: "core" },
  { month: 12, day: 31, title: "간이지급명세서(사업) 제출", desc: "2026.11월 지급분", priority: "core" },
  { month: 12, day: 31, title: "일용근로소득지급명세서 제출", desc: "2026.11월 지급분", priority: "core" },
  { month: 12, day: 10, title: "ICL 원천공제 신고 납부", desc: "2026.11월분", priority: "optional" },
  { month: 12, day: 10, title: "인지세 납부", desc: "2026.11월 작성분", priority: "optional" },
  { month: 12, day: 28, title: "개별소비세 과세유흥장소", desc: "2026.11월분", priority: "optional" },
];

export function getTaxEventsForMonth(month: number) {
  return TAX_EVENTS.filter(e => e.month === month);
}
