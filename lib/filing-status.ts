import { prisma } from "@/lib/prisma";
import { isPrelimNoticeRecord } from "@/lib/vat-notice";
import { getClientScopeWhere } from "@/lib/client-scope";
import { STAGES as BK_STAGES, TARGET_DAY_KEY, DEFAULT_TARGET_DAY, bookkeepingDeadline, addMonths, type BookkeepingStage } from "@/lib/bookkeeping";
import { TAX_EVENTS } from "@/lib/tax-calendar";

/**
 * 신고 현황 모아보기 — 월기장 · 원천세 · 부가세 · 종합소득세의 "지금 진행 중인 기간" 진행률.
 *
 * 설계 메모
 * - 각 세목의 단계 판정은 순수 함수(derive*)로 분리해 두었다. 나중에 거래처 프로필(한 거래처의 모든 데이터
 *   모아보기)을 만들 때 같은 함수를 거래처 한 곳에 대해 호출하면 된다.
 * - 대상 거래처 범위는 공용 getClientScopeWhere(기장대리 목록과 동일, 신고대리 제외)를 쓴다.
 * - 기간 선택 규칙(어느 달/어느 기수를 '지금'으로 볼지)은 pickXxxPeriod 함수에 모아 두었다.
 */

export type FilingKey = "bookkeeping" | "withholding" | "vat" | "incomeTax";

export type StageBucket = { key: string; label: string; color: string; count: number };

export type FilingSummary = {
  key: FilingKey;
  title: string;
  /** 예: "2026년 9월분", "2026년 2기 예정", "2025년 귀속" */
  periodLabel: string;
  /** 해당 세목 페이지 링크 (기간 파라미터 포함) */
  href: string;
  /** 마감일 YYYY-MM-DD (없으면 null) */
  deadline: string | null;
  total: number;
  done: number;
  /** 단계별 분포 (순서대로, 마지막이 완료) */
  stages: StageBucket[];
  /** 짧은 보조 설명 */
  note?: string;
};

type SessionLike = { id: number; role: string };

/* ───────────── 공통 ───────────── */

function ymLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}년 ${parseInt(m)}월분`;
}

/** 세무 일정표에서 (월, 제목 접두어)로 마감일을 찾는다. 연도는 인자로 */
function findEventDate(year: number, month: number, titleStartsWith: string): string | null {
  const ev = TAX_EVENTS.find(e => e.priority === "core" && e.month === month && e.title.startsWith(titleStartsWith));
  if (!ev) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}`;
}

/* ───────────── 월기장 ───────────── */

/** 이번 달에 작업하는 기장 대상 월 = 전월분 */
export function pickBookkeepingMonth(today: string) {
  return addMonths(today.slice(0, 7), -1);
}

const BK_COLORS: Record<BookkeepingStage, string> = {
  none: "#D1D6DB",
  input: "#3182F6",
  booked: "#F59E0B",
  reviewed: "#A855F7",
  done: "#10B981",
};

/* ───────────── 원천세 ───────────── */

/** 원천세 작업 월: 매월 10일까지는 전월분 신고 기간, 그 뒤는 당월분 */
export function pickWithholdingMonth(today: string) {
  const day = parseInt(today.slice(8, 10));
  const ym = today.slice(0, 7);
  return day <= 10 ? addMonths(ym, -1) : ym;
}

/** 원천세 페이지(WithholdingTable)와 같은 규칙 — 유형·반기납·월에 따라 필요한 프로세스 단계 */
export function withholdingSteps(type: string | null, month: number, halfYearTax: boolean): string[] {
  const isTaxMonth = month === 6 || month === 12;
  switch (type) {
    case "A":
      return halfYearTax && !isTaxMonth
        ? ["자료요청", "자료수취", "급여명세서전달"]
        : ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];
    case "B":
      return halfYearTax && !isTaxMonth ? ["급여명세서전달"] : ["급여명세서전달", "원천세신고", "납부서전달"];
    case "C":
      return isTaxMonth ? ["급여명세서전달", "원천세신고", "납부서전달"] : ["급여명세서전달"];
    case "D":
      return [];
    default:
      return halfYearTax && !isTaxMonth
        ? ["자료요청", "자료수취", "급여명세서전달"]
        : ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];
  }
}

export type WithholdingStatus = "none" | "progress" | "filed" | "done";

/** 한 거래처·한 달의 원천세 진행 상태 */
export function deriveWithholdingStatus(
  steps: string[],
  records: { taskType: string; done: boolean }[],
): WithholdingStatus {
  if (steps.length === 0) return "done";
  const doneSet = new Set(records.filter(r => r.done).map(r => r.taskType));
  const doneCount = steps.filter(s => doneSet.has(s)).length;
  if (doneCount === steps.length) return "done";
  if (steps.includes("원천세신고") && doneSet.has("원천세신고")) return "filed";
  return doneCount === 0 ? "none" : "progress";
}

/* ───────────── 부가세 ───────────── */

export type VatPeriodType = "1-예정" | "1-확정" | "2-예정" | "2-확정";

/** 오늘 기준 '지금 준비 중인' 부가세 기수 */
export function pickVatPeriod(today: string): { year: number; type: VatPeriodType; deadline: string | null } {
  const y = parseInt(today.slice(0, 4));
  const m = parseInt(today.slice(5, 7));
  if (m === 1) return { year: y - 1, type: "2-확정", deadline: findEventDate(y, 1, "부가가치세") };
  if (m <= 4) return { year: y, type: "1-예정", deadline: findEventDate(y, 4, "부가가치세") };
  if (m <= 7) return { year: y, type: "1-확정", deadline: findEventDate(y, 7, "부가가치세") };
  if (m <= 10) return { year: y, type: "2-예정", deadline: findEventDate(y, 10, "부가가치세") };
  return { year: y, type: "2-확정", deadline: findEventDate(y + 1, 1, "부가가치세") };
}

export const VAT_STAGES: { key: string; label: string; color: string }[] = [
  { key: "collect", label: "자료수집", color: "#F59E0B" },
  { key: "writing", label: "작성중", color: "#3182F6" },
  { key: "approval", label: "결재", color: "#B45309" },
  { key: "confirm", label: "컨펌·보수", color: "#A855F7" },
  { key: "done", label: "신고완료", color: "#10B981" },
];

export function normalizeVatStage(stage: string | undefined | null) {
  return VAT_STAGES.some(s => s.key === stage) ? (stage as string) : "collect";
}

/* ───────────── 종합소득세 ───────────── */

export type IncomeTaxStage = "collect" | "writing" | "approval" | "confirm" | "done";

export const INCOME_TAX_STAGES: { key: IncomeTaxStage; label: string; color: string }[] = [
  { key: "collect", label: "자료수집", color: "#F59E0B" },
  { key: "writing", label: "작성중", color: "#3182F6" },
  { key: "approval", label: "결재", color: "#B45309" },
  { key: "confirm", label: "컨펌·보수", color: "#A855F7" },
  { key: "done", label: "신고완료", color: "#10B981" },
];

/** 종소세 페이지(IncomeTaxTable.getStage)와 같은 5단계 도출 */
export function deriveIncomeTaxStage(r: {
  filingDone: boolean; confirmStage: boolean; depositReceived: boolean;
  preSettlement: boolean; backToCollect: boolean; currSales: bigint | string | null;
} | null | undefined): IncomeTaxStage {
  if (!r) return "collect";
  if (r.filingDone) return "done";
  if (r.confirmStage || r.depositReceived) return "confirm";
  if (r.preSettlement) return "approval";
  if (r.backToCollect) return "collect";
  if (r.currSales) return "writing";
  return "collect";
}

/** 종소세 귀속연도: 1~6월은 전년 귀속 신고 시즌, 7월 이후도 직전 귀속분을 보여준다(페이지 기본값과 동일) */
export function pickIncomeTaxYear(today: string) {
  const y = parseInt(today.slice(0, 4));
  return { taxYear: String(y - 1), deadline: findEventDate(y, 6, "종합소득세 확정신고") };
}

/* ───────────── 집계 ───────────── */

function bucketize<K extends string>(order: { key: K; label: string; color: string }[], counts: Map<K, number>): StageBucket[] {
  return order.map(s => ({ key: s.key, label: s.label, color: s.color, count: counts.get(s.key) ?? 0 }));
}

export async function getFilingSummaries(session: SessionLike, today: string): Promise<FilingSummary[]> {
  const scope = await getClientScopeWhere(session);
  const activeScope = { ...scope, contractStatus: "active" };

  const bkMonth = pickBookkeepingMonth(today);
  const whMonth = pickWithholdingMonth(today);
  const whMonthNum = parseInt(whMonth.slice(5, 7));
  const vat = pickVatPeriod(today);
  const vatPeriod = `${vat.year}-${vat.type}`;
  const it = pickIncomeTaxYear(today);

  const [targetCfg, bkClients, whClients, vatClients, itClients] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: TARGET_DAY_KEY } }),
    prisma.client.findMany({
      where: activeScope,
      select: { id: true, bookkeepingMonths: { where: { yearMonth: bkMonth }, select: { stage: true } } },
    }),
    prisma.client.findMany({
      where: { ...activeScope, NOT: { withholdingType: "D" } },
      select: {
        id: true, withholdingType: true, halfYearTax: true,
        withholdingRecords: { where: { yearMonth: whMonth }, select: { taskType: true, done: true } },
      },
    }),
    prisma.client.findMany({
      where: { ...activeScope, NOT: { taxationType: { in: ["면세", "프리랜서", "폐업"] } } },
      select: { id: true, clientType: true, vatRecords: { where: { period: vatPeriod }, select: { stage: true, excluded: true, checklist: true, htxData: true } } },
    }),
    prisma.client.findMany({
      // 종소세 페이지와 동일: 개인만, 해지 거래처도 데이터 성격이라 포함
      where: { ...scope, clientType: { not: "corporate" } },
      select: {
        id: true,
        incomeTaxRecords: {
          where: { taxYear: it.taxYear },
          select: { filingDone: true, confirmStage: true, depositReceived: true, preSettlement: true, backToCollect: true, currSales: true, excluded: true },
        },
      },
    }),
  ]);

  // 월기장
  const targetDay = targetCfg ? parseInt(targetCfg.value) || DEFAULT_TARGET_DAY : DEFAULT_TARGET_DAY;
  const bkCounts = new Map<BookkeepingStage, number>();
  for (const c of bkClients) {
    const st = (c.bookkeepingMonths[0]?.stage ?? "none") as BookkeepingStage;
    bkCounts.set(st, (bkCounts.get(st) ?? 0) + 1);
  }
  const bookkeeping: FilingSummary = {
    key: "bookkeeping",
    title: "월기장",
    periodLabel: ymLabel(bkMonth),
    href: `/bookkeeping?focus=${bkMonth}`,
    deadline: bookkeepingDeadline(bkMonth, targetDay),
    total: bkClients.length,
    done: bkCounts.get("done") ?? 0,
    stages: bucketize(BK_STAGES.map(s => ({ key: s.key, label: s.label, color: BK_COLORS[s.key] })), bkCounts),
    note: "세모리포트 발송까지",
  };

  // 원천세
  const whCounts = new Map<WithholdingStatus, number>();
  for (const c of whClients) {
    const steps = withholdingSteps(c.withholdingType, whMonthNum, c.halfYearTax);
    const st = deriveWithholdingStatus(steps, c.withholdingRecords);
    whCounts.set(st, (whCounts.get(st) ?? 0) + 1);
  }
  const whNext = addMonths(whMonth, 1);
  const withholding: FilingSummary = {
    key: "withholding",
    title: "원천세",
    periodLabel: ymLabel(whMonth),
    href: `/withholding?ym=${whMonth}`,
    deadline: findEventDate(parseInt(whNext.slice(0, 4)), parseInt(whNext.slice(5, 7)), "원천세 신고 납부"),
    total: whClients.length,
    done: whCounts.get("done") ?? 0,
    stages: bucketize(
      [
        { key: "none", label: "미시작", color: "#D1D6DB" },
        { key: "progress", label: "진행중", color: "#3182F6" },
        { key: "filed", label: "신고완료", color: "#A855F7" },
        { key: "done", label: "납부서까지", color: "#10B981" },
      ] as { key: WithholdingStatus; label: string; color: string }[],
      whCounts,
    ),
    note: whMonthNum === 6 || whMonthNum === 12 ? "반기납 거래처 신고월" : undefined,
  };

  // 부가세
  // 부가세 페이지(VatTable)와 같은 기준: 제외 → 집계 밖, 예정 기간의 예정고지형(신고 불필요) → 단계 집계 밖 '예정고지 N곳'
  const vatCounts = new Map<string, number>();
  let vatExcluded = 0;
  let vatPrelimNotice = 0;
  for (const c of vatClients) {
    const r = c.vatRecords[0];
    if (r?.excluded) { vatExcluded++; continue; }
    if (isPrelimNoticeRecord(vatPeriod, c.clientType, r?.checklist, r?.htxData)) { vatPrelimNotice++; continue; }
    const st = normalizeVatStage(r?.stage);
    vatCounts.set(st, (vatCounts.get(st) ?? 0) + 1);
  }
  const vatTotal = vatClients.length - vatExcluded - vatPrelimNotice;
  const vatNoteParts = [
    vatPrelimNotice > 0 ? `예정고지 ${vatPrelimNotice}곳 (신고 불필요)` : null,
    vatExcluded > 0 ? `제외 ${vatExcluded}곳` : null,
  ].filter(Boolean);
  const vatTypeLabel = vat.type.replace("-", "기 ");
  const vatSummary: FilingSummary = {
    key: "vat",
    title: "부가가치세",
    periodLabel: `${vat.year}년 ${vatTypeLabel}`,
    href: `/vat?year=${vat.year}&period=${vat.type}`,
    deadline: vat.deadline,
    total: vatTotal,
    done: vatCounts.get("done") ?? 0,
    stages: bucketize(VAT_STAGES, vatCounts),
    note: vatNoteParts.length > 0 ? vatNoteParts.join(" · ") : undefined,
  };

  // 종합소득세
  const itCounts = new Map<IncomeTaxStage, number>();
  let itExcluded = 0;
  for (const c of itClients) {
    const r = c.incomeTaxRecords[0];
    if (r?.excluded) { itExcluded++; continue; }
    const st = deriveIncomeTaxStage(r);
    itCounts.set(st, (itCounts.get(st) ?? 0) + 1);
  }
  const incomeTax: FilingSummary = {
    key: "incomeTax",
    title: "종합소득세",
    periodLabel: `${it.taxYear}년 귀속`,
    href: `/income-tax?year=${it.taxYear}`,
    deadline: it.deadline,
    total: itClients.length - itExcluded,
    done: itCounts.get("done") ?? 0,
    stages: bucketize(INCOME_TAX_STAGES, itCounts),
    note: itExcluded > 0 ? `제외 ${itExcluded}곳` : undefined,
  };

  return [bookkeeping, withholding, vatSummary, incomeTax];
}
