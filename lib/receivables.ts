import { lastBillableMonth, monthsBetween, kstNow, type WithdrawalTarget } from "@/lib/withdrawal";

/**
 * 거래처 한 곳의 기장료 미수 계산 — 채권관리(/receivables)·세이브택스 채권·미수 보고서 PDF·AI 채팅이
 * 전부 이 함수를 쓴다. (예전엔 각자 복사본을 들고 있어서 채팅 합계가 채권 페이지와 달랐음)
 *
 * 규칙
 * - 청구 대상 월 = 최초출금월 ~ 마지막 청구월
 *   · 마지막 청구월 = 출금일이 지났으면 당월, 아니면 전월 (후불 수납이면 한 달 더 앞) → lastBillableMonth
 *   · 해지 거래처는 해지월까지만 (해지월이 더 이르면 해지월)
 * - 청구 제외(exempt) 달은 청구 예정에서 뺀다 (해지 후 재수임 공백·무료 기장 달)
 * - 미수 달 = 청구 대상 월 중 paid/exempt 기록이 없는 달
 */

export type FeeRecordLite = { yearMonth: string; status: string };

export type AssignedUserLite = {
  name: string;
  role: string;
  manager: { name: string } | null;
} | null | undefined;

export type ReceivableClientInput = {
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  withdrawalDay: number | null;
  billingTiming: string | null;
  cmsAffiliation: string | null;
  affiliation: string | null;
  contractStatus: string;
  terminationMonth: string | null;
  feeRecords: FeeRecordLite[];
  assignedUser?: AssignedUserLite;
};

export type ReceivableResult = {
  /** 담당 세무사 이름 (사수가 직원이면 상위 세무사). 없으면 null */
  accountantName: string | null;
  /** 출금일·수납방식 판정용 입력 */
  wt: WithdrawalTarget;
  isTerminated: boolean;
  /** 출금일 기준 미수 판정이 가능한 마지막 월 */
  billableEndMonth: string;
  /** 해지월까지 반영한 실제 마지막 청구월 */
  endMonth: string;
  /** 최초출금월 ~ endMonth 전체 */
  allMonths: string[];
  /** allMonths 중 청구 제외가 아닌 달 */
  billableMonths: string[];
  /** 청구 대상인데 paid/exempt 기록이 없는 달 */
  unpaidMonths: string[];
  expected: number;
  paid: number;
  unpaid: number;
};

/** 담당 세무사 이름 — 사수가 직원이면 상위 세무사(매니저) */
export function accountantNameOf(au: AssignedUserLite): string | null {
  if (!au) return null;
  return au.role === "employee" && au.manager ? au.manager.name : au.name;
}

export function withdrawalTargetOf(c: ReceivableClientInput): WithdrawalTarget {
  return {
    withdrawalDay: c.withdrawalDay,
    billingTiming: c.billingTiming,
    cmsAffiliation: c.cmsAffiliation,
    affiliation: c.affiliation,
    accountantName: accountantNameOf(c.assignedUser),
  };
}

export function computeReceivable(c: ReceivableClientInput, now: Date = kstNow()): ReceivableResult {
  const wt = withdrawalTargetOf(c);
  const billableEndMonth = lastBillableMonth(wt, now);
  const isTerminated = c.contractStatus !== "active";
  const endMonth =
    isTerminated && c.terminationMonth
      ? (c.terminationMonth < billableEndMonth ? c.terminationMonth : billableEndMonth)
      : billableEndMonth;

  const allMonths = c.firstWithdrawalMonth ? monthsBetween(c.firstWithdrawalMonth, endMonth) : [];
  const exempt = new Set(c.feeRecords.filter(r => r.status === "exempt").map(r => r.yearMonth));
  const paidSet = new Set(c.feeRecords.filter(r => r.status === "paid").map(r => r.yearMonth));
  const billableMonths = allMonths.filter(m => !exempt.has(m));
  const unpaidMonths = billableMonths.filter(m => !paidSet.has(m));

  const fee = c.monthlyFee ?? 0;
  const expected = fee * billableMonths.length;
  const unpaid = fee * unpaidMonths.length;
  return {
    accountantName: wt.accountantName ?? null,
    wt,
    isTerminated,
    billableEndMonth,
    endMonth,
    allMonths,
    billableMonths,
    unpaidMonths,
    expected,
    paid: expected - unpaid,
    unpaid,
  };
}
