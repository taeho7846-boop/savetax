// 설정 타입: year(년도), yearRange(년~년), monthRange(월~월), dateRange(날짜~날짜), vatPeriod(부가세 기수), none(없음)
export type SettingType = "year" | "yearRange" | "monthRange" | "dateRange" | "vatPeriod" | "none";

export type DocType = {
  key: string;
  label: string;
  source: string;
  settingType: SettingType;
};

// 홈택스 수집 문서 목록
export const DOC_TYPES: DocType[] = [
  { key: "종합소득세_신고도움", label: "종합소득세 신고도움 서비스", source: "홈택스", settingType: "year" },
  { key: "종합소득세_신고서", label: "종합소득세 신고서", source: "홈택스", settingType: "dateRange" },
  { key: "부가가치세_신고서", label: "부가가치세 신고서", source: "홈택스", settingType: "dateRange" },
  { key: "부가가치세_과세표준증명", label: "부가가치세 과세표준증명", source: "홈택스", settingType: "vatPeriod" },
  { key: "간이지급명세서", label: "간이 지급명세서", source: "홈택스", settingType: "monthRange" },
  { key: "사업소득_지급명세서", label: "사업소득 지급명세서", source: "홈택스", settingType: "monthRange" },
  { key: "납부내역증명", label: "납부내역증명(납세사실증명)", source: "홈택스", settingType: "dateRange" },
  { key: "법인소득세_신고서", label: "법인소득세 신고서", source: "홈택스", settingType: "dateRange" },
  { key: "사업자등록증명원", label: "사업자등록증명원", source: "홈택스", settingType: "none" },
  { key: "양도소득세_신고서", label: "양도소득세 신고서", source: "홈택스", settingType: "dateRange" },
  { key: "연말정산_간소화", label: "연말정산 간소화 자료", source: "홈택스", settingType: "year" },
  { key: "증여세_신고서", label: "증여세 신고서", source: "홈택스", settingType: "dateRange" },
];

// 기본값 계산
export function getDefaultParams(settingType: SettingType, taxYear: string) {
  const y = parseInt(taxYear);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yearAgo = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const monthAgo12 = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  switch (settingType) {
    case "year": return { year: String(y) };
    case "yearRange": return { startYear: String(y), endYear: String(y + 1) };
    case "monthRange": return { startMonth: monthAgo12, endMonth: thisMonth };
    case "dateRange": return { startDate: yearAgo, endDate: today };
    case "vatPeriod": return { startYear: String(y), startPeriod: "1", endYear: String(y + 1), endPeriod: "2" };
    case "none": return {};
  }
}
