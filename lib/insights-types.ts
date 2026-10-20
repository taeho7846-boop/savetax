/** 거래처 인사이트 타입·상수·업종 그룹 추정 — 서버 의존성 없음(클라이언트 컴포넌트에서 import 가능). 집계는 lib/insights.ts */

export type SincereGroup = "A" | "B" | "C";
export const SINCERE_GROUPS: Record<SincereGroup, { label: string; short: string; threshold: number }> = {
  A: { label: "도소매 · 농림어업 · 부동산매매 등", short: "도소매", threshold: 1_500_000_000 },
  B: { label: "제조 · 건설 · 음식숙박 · 운수 · 정보통신 등", short: "제조·건설", threshold: 750_000_000 },
  C: { label: "서비스 · 부동산임대 · 전문직 등", short: "서비스", threshold: 500_000_000 },
};

const A_WORDS = ["도매", "소매", "도소매", "판매", "유통", "농업", "임업", "어업", "축산", "광업", "부동산매매", "매매"];
const B_WORDS = ["제조", "건설", "건축", "토목", "음식", "식당", "숙박", "카페", "커피", "운수", "운송", "창고", "물류", "정보통신", "통신", "소프트웨어", "개발", "출판", "영상", "방송", "전기", "가스", "수도", "폐기물", "하수"];
const C_WORDS = ["서비스", "임대", "교육", "학원", "보건", "의료", "병원", "의원", "전문", "과학", "기술", "컨설팅", "디자인", "예술", "스포츠", "여가", "협회", "수리", "금융", "보험", "프리랜서", "인적용역", "미용", "세탁", "광고", "회계", "법무", "변호사", "세무"];

/** 업태·종목·업종코드로 성실신고 업종 그룹 추정 (홈택스 업종코드 앞 두 자리 우선, 없으면 낱말) */
export function guessSincereGroup(bizCategory: string | null, bizItem: string | null, bizType: string | null): SincereGroup | null {
  const code = (bizType ?? "").replace(/[^0-9]/g, "");
  const text = `${bizCategory ?? ""} ${bizItem ?? ""}`;
  if (code.length >= 2) {
    const h = parseInt(code.slice(0, 2));
    if (h >= 1 && h <= 9) return "A";                 // 농림어업·광업
    if (h >= 10 && h <= 44) return "B";               // 제조·전기가스·건설
    if (h === 45) return "B";                         // 건설
    if (h >= 50 && h <= 52) return "A";               // 자동차판매·도매·소매
    if (h === 55) return "B";                         // 숙박·음식
    if (h >= 60 && h <= 64) return "B";               // 운수·통신
    if (h >= 65 && h <= 67) return "C";               // 금융·보험
    if (h === 70) return /매매/.test(text) ? "A" : "C"; // 부동산: 매매 A, 임대 C
    if (h === 71) return "C";                         // 임대
    if (h === 72) return "B";                         // 정보처리·컴퓨터
    if (h >= 73 && h <= 99) return "C";               // 사업서비스·교육·보건·오락·기타서비스·인적용역
  }
  if (A_WORDS.some(w => text.includes(w))) return "A";
  if (B_WORDS.some(w => text.includes(w))) return "B";
  if (C_WORDS.some(w => text.includes(w))) return "C";
  return null;
}

export type InsightRow = {
  id: number;
  name: string;
  clientType: string;
  assignedUser: string | null;
  bizCategory: string | null;
  bizItem: string | null;
  bizType: string | null;
  /** 지정값 또는 추정값 */
  group: SincereGroup | null;
  groupSource: "set" | "guess" | null;
  threshold: number | null;
  /** 올해 누적(지난달까지) — 세모리포트 공급가액 */
  ytdSale: number;
  ytdBuy: number;
  /** 급여대장 지급액 합 */
  ytdPay: number;
  profit: number;
  marginPct: number | null;
  /** 자료 있는 달 수 / 기간 달 수 */
  dataMonths: number;
  periodMonths: number;
  avgSale: number | null;
  projectedSale: number | null;
  /** 연간 달성률(%) = 누적 ÷ 기준, 월 달성률(%) = 월평균 ÷ (기준/12) */
  annualRate: number | null;
  paceRate: number | null;
  /** 작년 같은 기간 매출과 증감 */
  prevSale: number | null;
  saleDeltaPct: number | null;
  hasLedger: boolean;
  hasPayroll: boolean;
};

export type InsightsData = {
  today: string;
  year: number;
  /** 누적 기준 마지막 달 "YYYY-MM" (지난달) */
  throughMonth: string;
  rows: InsightRow[];
};

