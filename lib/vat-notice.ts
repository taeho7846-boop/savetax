/**
 * 부가세 예정 기간 '예정고지형(신고 불필요)' 판정 — 부가세 페이지(VatTable)와 대시보드 집계(filing-status)가 같은 기준을 쓴다.
 *
 * 판정 순서:
 *  1) 거래처별 토글 report_notice (checklist JSON, true=예정고지/6개월, false=예정신고/3개월)
 *  2) 홈택스 업로드 자료의 신고의무(여/부) → 고지대상(여)
 *  3) 마지막에만 개인=예정고지 · 법인=예정신고 추정
 * 법인/개인으로 자동 단정하지 않는다는 기조(거래처별 지정값 우선)를 유지한다.
 */

type HtxNoticeLike = { notice?: { target?: string; filingDuty?: string } | null } | null | undefined;

function yn(v: string | undefined): boolean | null {
  const t = (v || "").trim();
  if (!t) return null;
  if (/여|있|^Y$/i.test(t)) return true;
  if (/부|없|^N$/i.test(t)) return false;
  return null;
}

/** 홈택스 자료로 예정고지형 여부 추정. 판단 불가 시 null */
export function inferNoticeFromHtx(htx: HtxNoticeLike): boolean | null {
  const n = htx?.notice;
  if (!n) return null;
  const d = (n.filingDuty || "").trim();
  const duty = yn(d);
  if (duty !== null) return !duty; // 신고의무 없음 = 예정고지형
  if (d.includes("고지")) return true;
  if (d.includes("신고")) return false;
  if (yn(n.target) === true) return true;
  return null;
}

/** 예정고지형(확정 6개월) 여부 */
export function isNoticeType(
  clientType: string | null | undefined,
  checklist: Record<string, unknown>,
  htx: HtxNoticeLike,
): boolean {
  const rn = checklist["report_notice"];
  if (typeof rn === "boolean") return rn;
  return inferNoticeFromHtx(htx) ?? clientType !== "corporate";
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** 체크리스트 키: 대표에게 예정고지 납부서를 보냈는지 */
export const NOTICE_BILL_SENT_KEY = "notice_bill_sent";

/** 예정고지세액: 수기/자동 입력값(noticeTax) 우선, 없으면 홈택스 자료의 예정고지세액 */
export function noticeAmountOf(noticeTax: number | null | undefined, htxDataJson: string | null | undefined): number {
  if (typeof noticeTax === "number") return noticeTax;
  const h = parseJson<{ notice?: { amount?: number } } | null>(htxDataJson, null);
  return h?.notice?.amount ?? 0;
}

export function isChecklistChecked(checklistJson: string | null | undefined, key: string): boolean {
  return parseJson<Record<string, unknown>>(checklistJson, {})[key] === true;
}

/** DB 원본(JSON 문자열)으로 바로 판정: 예정 기간 + 예정고지형 → 신고 불필요(단계 없음) */
export function isPrelimNoticeRecord(
  period: string,
  clientType: string | null | undefined,
  checklistJson: string | null | undefined,
  htxDataJson: string | null | undefined,
): boolean {
  if (!period.endsWith("예정")) return false;
  return isNoticeType(clientType, parseJson<Record<string, unknown>>(checklistJson, {}), parseJson<HtxNoticeLike>(htxDataJson, null));
}
