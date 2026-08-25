/**
 * 출금일 기반 채권(미수) 판정 공통 로직.
 *
 * 거래처마다 CMS 출금일이 다르므로, 당월은 "출금일이 지났을 때"만 미수로 잡는다.
 * 예) 출금일 15일 → 8/12에는 아직 미수 아님(예정), 8/16부터 미수.
 */

/** 소속별 기본 출금일 — 거래처에 withdrawalDay가 없으면 여기서 가져온다 */
export const DEFAULT_WITHDRAWAL_DAY: Record<string, number> = {
  세이브택스: 5,
  세무회계태호: 25,
};

/** 소속을 알 수 없을 때의 최종 기본값 */
export const FALLBACK_WITHDRAWAL_DAY = 5;

export type WithdrawalTarget = {
  withdrawalDay?: number | null;
  cmsAffiliation?: string | null;
  affiliation?: string | null;
};

/** 거래처에 실제 적용되는 출금일 (개별 지정 > CMS 청구처 기본 > 소속 기본 > 5일) */
export function effectiveWithdrawalDay(c: WithdrawalTarget): number {
  if (c.withdrawalDay && c.withdrawalDay >= 1 && c.withdrawalDay <= 31) return c.withdrawalDay;
  if (c.cmsAffiliation && DEFAULT_WITHDRAWAL_DAY[c.cmsAffiliation]) return DEFAULT_WITHDRAWAL_DAY[c.cmsAffiliation];
  if (c.affiliation && DEFAULT_WITHDRAWAL_DAY[c.affiliation]) return DEFAULT_WITHDRAWAL_DAY[c.affiliation];
  return FALLBACK_WITHDRAWAL_DAY;
}

/** 출금일이 개별 지정된 게 아니라 소속 기본값에서 온 것인지 (UI 안내용) */
export function isDefaultWithdrawalDay(c: WithdrawalTarget): boolean {
  return !(c.withdrawalDay && c.withdrawalDay >= 1 && c.withdrawalDay <= 31);
}

/** 해당 월의 마지막 날 */
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** 해당 월의 실제 출금일 — 31일 지정인데 2월이면 28/29일로 당겨진다 */
export function dueDayOfMonth(c: WithdrawalTarget, ym: string): number {
  return Math.min(effectiveWithdrawalDay(c), daysInMonth(ym));
}

/**
 * 한국 시간(KST) 기준 현재 시각.
 * 서버 타임존이 UTC여도 출금일 판정이 하루 밀리지 않도록 명시적으로 보정한다.
 * (서버가 이미 KST면 결과는 동일)
 */
export function kstNow(): Date {
  const d = new Date();
  return new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
}

/** "YYYY-MM" 한 달 전 */
function prevMonth(ym: string): string {
  let [y, m] = ym.split("-").map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * 미수 판정 대상이 되는 마지막 월.
 * 출금일이 지났으면(= 출금일 다음날부터) 당월까지, 아직이면 전월까지.
 */
export function lastBillableMonth(c: WithdrawalTarget, now: Date = kstNow()): string {
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return now.getDate() > dueDayOfMonth(c, currentYM) ? currentYM : prevMonth(currentYM);
}

/** firstWithdrawalMonth 부터 to 까지 모든 월 (to < from 이면 빈 배열) */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/** 장기미수 기준 — 밀린 달이 2개월치 이상이면 세무사 관리 대상 */
export const LONG_TERM_UNPAID_THRESHOLD = 2;

/** 미수 구간: 당월(직원) / 전월(직원) / 장기(세무사) */
export type UnpaidBucket = "current" | "prev" | "long";

/**
 * 미납 건수 우선 분류.
 * - 2건 이상이면 무조건 장기미수
 * - 1건이면 그 달이 당월/전월인지로 나누고, 그보다 오래 묵었으면 장기미수
 */
export function unpaidBucket(unpaidMonths: string[], now: Date = kstNow()): UnpaidBucket {
  if (unpaidMonths.length >= LONG_TERM_UNPAID_THRESHOLD) return "long";
  const ym = unpaidMonths[0];
  if (!ym) return "current"; // 미납 없는 거래처는 호출 전에 걸러진다
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (ym === currentYM) return "current";
  if (ym === prevMonth(currentYM)) return "prev";
  return "long";
}
