// 거래처명 매칭용 정규화 키 생성
// 법인 표기("주식회사 OO" ↔ "(주)OO" ↔ "㈜OO"), 공백, 영문 대소문자 차이를 무시하고 비교
export function normalizeClientName(raw: string): string {
  const stripped = raw
    .replace(/㈜/g, "")
    .replace(/\((주|유|합|재|사)\)/g, "")
    .replace(/주식회사|유한회사|유한책임회사|합자회사|합명회사|사단법인|재단법인|농업회사법인|영농조합법인/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  // 이름 전체가 법인 표기뿐이면 공백만 제거한 원본으로 fallback
  return stripped || raw.replace(/\s+/g, "").toLowerCase();
}
