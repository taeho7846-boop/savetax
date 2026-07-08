// 설정 타입: year(년도), yearRange(년~년), monthRange(월~월), dateRange(날짜~날짜), vatPeriod(부가세 기수), none(없음)
export type SettingType = "year" | "yearRange" | "monthRange" | "dateRange" | "vatPeriod" | "none";

// 인증 요구사항:
//  "id"   - 홈택스 아이디 로그인만으로 자동 수집 가능
//  "cert" - 발급/조회에 거래처 본인의 공동·금융인증서 본인인증이 추가로 필요 (아이디만으로는 불가)
// authNote: cert인 경우 어떤 인증이 왜 필요한지 사람이 읽을 설명
export type AuthLevel = "id" | "cert";

export type DocType = {
  key: string;
  label: string;
  source: string;
  settingType: SettingType;
  auth: AuthLevel;
  authNote?: string;
};

const CERT_NOTE = "발급 시 거래처 본인의 공동·금융인증서 본인인증이 필요 (아이디 로그인만으로는 불가)";

// 홈택스 수집 문서 목록
// auth 근거: 사업자등록증명·종합소득세 신고도움은 아이디만으로 수집 실증 완료(2026-07).
//            부가가치세 과세표준증명은 발급 단계에서 본인인증 팝업 확인(2026-07) → cert.
//            납부내역증명(민원증명 계열)·연말정산 간소화는 본인인증 필요로 분류.
//            신고서 원본·지급명세서는 아이디 조회가 일반적이라 id로 두되 실행하며 확정.
export const DOC_TYPES: DocType[] = [
  { key: "종합소득세_신고도움", label: "종합소득세 신고도움 서비스", source: "홈택스", settingType: "yearRange", auth: "id" },
  { key: "종합소득세_신고서", label: "종합소득세 신고서", source: "홈택스", settingType: "dateRange", auth: "id" },
  { key: "부가가치세_신고서", label: "부가가치세 신고서", source: "홈택스", settingType: "dateRange", auth: "id" },
  { key: "부가가치세_과세표준증명", label: "부가가치세 과세표준증명", source: "홈택스", settingType: "vatPeriod", auth: "cert", authNote: CERT_NOTE },
  { key: "간이지급명세서", label: "간이 지급명세서", source: "홈택스", settingType: "monthRange", auth: "cert", authNote: CERT_NOTE },
  { key: "사업소득_지급명세서", label: "사업소득 지급명세서", source: "홈택스", settingType: "monthRange", auth: "cert", authNote: CERT_NOTE },
  { key: "납부내역증명", label: "납부내역증명(납세사실증명)", source: "홈택스", settingType: "dateRange", auth: "cert", authNote: CERT_NOTE },
  { key: "법인소득세_신고서", label: "법인소득세 신고서", source: "홈택스", settingType: "dateRange", auth: "id" },
  { key: "사업자등록증명원", label: "사업자등록증명원", source: "홈택스", settingType: "none", auth: "id" },
  { key: "양도소득세_신고서", label: "양도소득세 신고서", source: "홈택스", settingType: "dateRange", auth: "id" },
  { key: "연말정산_간소화", label: "연말정산 간소화 자료", source: "홈택스", settingType: "year", auth: "cert", authNote: "근로자 본인의 자료제공 동의·본인인증(공동·금융/간편인증)이 필요" },
  { key: "증여세_신고서", label: "증여세 신고서", source: "홈택스", settingType: "dateRange", auth: "id" },
];

// 기본값 계산
//  - taxYear = 귀속연도(y). 각 서류의 실제 신고·제출 시기에 맞춘 기본 기간을 반환.
//  - 신고서 원본 조회는 "신고서 제출일" 기준으로 잡음(귀속 y분이 제출되는 시기).
//  - docKey가 주어지면 세목별 정밀 기본값을 우선 적용, 없으면 settingType 기준 일반값.
//
//  신고·제출 시기 근거(국세청/세무 안내):
//   종합소득세  귀속 다음해 5.1~5.31(성실신고확인 6.30)
//   부가가치세  개인 1기 확정 귀속연도 7월 / 2기 확정 다음해 1월
//   법인세      12월 결산 기준 다음해 3월
//   양도소득세  예정(양도월 말일+2개월) + 확정 다음해 5월 → 수시
//   증여세      증여일 말일+3개월 → 수시
//   지급명세서  귀속연도 각 월 지급분(간이: 사업소득 매월/근로 반기)
export function getDefaultParams(
  settingType: SettingType,
  taxYear: string,
  docKey?: string,
): Record<string, string> {
  const y = parseInt(taxYear);
  const d = (year: number, m: number, day: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const m = (year: number, mon: number) => `${year}-${String(mon).padStart(2, "0")}`;

  // 세목별 정밀 기본값 (신고서 제출 시기 / 귀속연도 지급분)
  const byDoc: Record<string, Record<string, string>> = {
    // 신고서 원본(전자신고결과조회)은 과거 이력까지 한 번에 수집하는 용도 → 시작일을 2020-01-01로 고정
    // (확장이 1년 단위 구간으로 쪼개 조회하므로 긴 범위도 문제 없음. 특히 양도·증여는 수시 신고라
    //  귀속연도 기준 기간으로는 과거 신고가 통째로 빠짐 — 2026-07 실측)
    종합소득세_신고서: { startDate: d(2020, 1, 1), endDate: d(y + 1, 6, 30) },
    부가가치세_신고서: { startDate: d(2020, 1, 1), endDate: d(y + 1, 1, 31) },
    법인소득세_신고서: { startDate: d(2020, 1, 1), endDate: d(y + 1, 4, 30) },
    양도소득세_신고서: { startDate: d(2020, 1, 1), endDate: d(y + 1, 5, 31) },
    증여세_신고서: { startDate: d(2020, 1, 1), endDate: d(y + 1, 3, 31) },
    납부내역증명: { startDate: d(y, 1, 1), endDate: d(y + 1, 12, 31) },
    간이지급명세서: { startMonth: m(y, 1), endMonth: m(y, 12) },
    사업소득_지급명세서: { startMonth: m(y, 1), endMonth: m(y, 12) },
  };
  if (docKey && byDoc[docKey]) return byDoc[docKey];

  switch (settingType) {
    case "year": return { year: String(y) };
    case "yearRange": return { startYear: String(y), endYear: String(y + 1) };
    case "monthRange": return { startMonth: m(y, 1), endMonth: m(y, 12) };
    case "dateRange": return { startDate: d(y, 1, 1), endDate: d(y + 1, 5, 31) };
    case "vatPeriod": return { startYear: String(y), startPeriod: "1", endYear: String(y), endPeriod: "2" };
    case "none": return {};
  }
}
