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

// 느슨한 매칭 키 — 괄호 안 내용(영문 상호·지점 표기 등)과 특수문자까지 제거
// 예: "주식회사 위커밋(WECOMMIT Co., Ltd.)" ↔ NICE 회원명 "주식회사위커밋" → 둘 다 "위커밋"
export function looseClientNameKey(raw: string): string {
  const base = normalizeClientName(raw)
    .replace(/[(（\[【][^)）\]】]*[)）\]】]/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
  return base || normalizeClientName(raw);
}
