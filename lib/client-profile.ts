import { prisma } from "@/lib/prisma";
import { getClientScopeWhere, semoAppliesTo } from "@/lib/client-scope";
import { computeReceivable } from "@/lib/receivables";
import { effectiveBillingTiming, effectiveWithdrawalDay, unpaidBucket, type UnpaidBucket } from "@/lib/withdrawal";
import {
  STAGES as BK_STAGES, TARGET_DAY_KEY, DEFAULT_TARGET_DAY, addMonths, bookkeepingDeadline, effectiveStage, isOverdue,
  type BookkeepingStage,
} from "@/lib/bookkeeping";
import {
  pickBookkeepingMonth, pickWithholdingMonth, pickVatPeriod, pickIncomeTaxYear,
  withholdingSteps, deriveWithholdingStatus, normalizeVatStage, deriveIncomeTaxStage,
  VAT_STAGES, INCOME_TAX_STAGES, type WithholdingStatus, type IncomeTaxStage,
} from "@/lib/filing-status";
import { isPrelimNoticeRecord, noticeAmountOf } from "@/lib/vat-notice";

/**
 * 거래처 프로필 — 거래처 한 곳에 흩어진 정보를 한 번에 모아 모달(ClientProfileModal)에 보여준다.
 * API: GET /api/clients/[id]/profile → ClientProfile (JSON, BigInt는 Number로 변환)
 *
 * 데이터 출처
 * - 기본정보·담당자·계약: Client, User
 * - 월기장료·미수: Client.monthlyFee + FeeRecord → lib/receivables.computeReceivable (채권 페이지와 동일 규칙)
 * - 이번달 기장 단계: BookkeepingMonth (대상 월 = 전월분, lib/filing-status.pickBookkeepingMonth)
 * - 부가세·원천세·종소세 현재 단계: VatRecord / WithholdingRecord+WithholdingFiling / IncomeTaxRecord
 *   (기간 선택과 단계 판정은 lib/filing-status 의 pickXxx·deriveXxx 함수 재사용 → 홈 신고현황 카드와 같은 기준)
 * - 월별 매출·매입: SemoLedgerMonth (세모리포트 고객 매입매출장 자동 수집)
 * - 경고: 장기미수(lib/withdrawal.unpaidBucket), 자료 미수집(DataCollection pending), 기장 지연(lib/bookkeeping.isOverdue),
 *         해피콜 미처리(CommissionProcess.connectedAt 없음), 해지 진행중(TerminationProcess 미완료)
 */

export type ProfileWarning = {
  key: string;
  level: "danger" | "warn" | "info";
  label: string;
  detail?: string;
  href?: string;
};

export type ProfileTile = {
  key: "fee" | "unpaid" | "bookkeeping" | "vat" | "withholding" | "incomeTax";
  title: string;
  /** 큰 글씨 */
  value: string;
  /** 값 옆 작은 단위/보조 */
  unit?: string;
  /** 아래 설명 (기간·마감 등) */
  sub?: string;
  /** 단계 색 (있으면 좌측 점/배경 톤) */
  color?: string;
  tone?: "neutral" | "good" | "warn" | "danger";
  href?: string;
};

export type VatHistoryRow = {
  period: string;            // "2026-1-예정"
  label: string;             // "2026년 1기 예정"
  stage: string;             // collect~done
  stageLabel: string;
  stageColor: string;
  excluded: boolean;
  prelimNotice: boolean;     // 예정고지형(신고 불필요)
  salesSupply: number | null;
  buySupply: number | null;
  noticeAmount: number;
  fee: number | null;
  hasHtx: boolean;
  isCurrent: boolean;
};

export type IncomeTaxHistoryRow = {
  taxYear: string;
  stage: IncomeTaxStage;
  stageLabel: string;
  stageColor: string;
  excluded: boolean;
  filingType: string | null;
  bookkeepingDuty: string | null;
  currSales: number | null;
  currIncome: number | null;
  currTax: number | null;
  prevSales: number | null;
  prevTax: number | null;
  reductions: string[];
  adjustmentFee: number | null;
  isCurrent: boolean;
};

export type WithholdingHistoryRow = {
  yearMonth: string;
  label: string;             // "2026년 9월분"
  steps: string[];
  doneSteps: string[];
  status: WithholdingStatus;
  statusLabel: string;
  statusColor: string;
  incomeAmount: number | null;     // 원천세(소득세) 납부세액
  localAmount: number | null;      // 지방소득세 납부세액
  reportType: string | null;       // 매월/반기
  receiptNo: string | null;
  filingStatus: string | null;     // none|produced|verified|submitted|error
  isCurrent: boolean;
};

export type LedgerMonth = {
  yearMonth: string;
  saleSupply: number;
  saleVat: number;
  saleCount: number;
  buySupply: number;
  buyVat: number;
  buyCount: number;
  purchasingRate: number | null;
};

export type ProfileMemo = { id: number; title: string | null; content: string; memoType: string; createdAt: string; author: string };

export type ClientProfile = {
  today: string;
  client: {
    id: number;
    name: string;
    bizNumber: string | null;
    corporateNumber: string | null;
    ceoName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    bizType: string | null;
    bizItem: string | null;
    clientType: string;
    taxationType: string | null;
    vatTypeDetail: string | null;
    taxTypes: string | null;
    laborTypes: string | null;
    contractStatus: string;
    terminationMonth: string | null;
    contractDate: string | null;
    openDate: string | null;
    affiliation: string | null;
    accountingProgram: string;
    contactMethod: string;
    paymentMethod: string;
    cmsStatus: string;
    withholdingType: string | null;
    halfYearTax: boolean;
    semoReportStatus: string;
    notes: string | null;
    driveFolderId: string | null;
    myboxLink: string | null;
    hasHometax: boolean;
    wehagoUrl: string | null;
    assignedUser: string | null;
    subAssignedUser: string | null;
    accountant: string | null;
  };
  warnings: ProfileWarning[];
  tiles: ProfileTile[];
  receivable: {
    monthlyFee: number | null;
    withdrawalDay: number;
    billingTiming: "same" | "arrears";
    expected: number;
    paid: number;
    unpaid: number;
    unpaidMonths: string[];
    bucket: UnpaidBucket | null;
    firstWithdrawalMonth: string | null;
    postponedUntil: string | null;
  };
  bookkeeping: {
    month: string;
    stage: BookkeepingStage;
    deadline: string;
    overdue: boolean;
    semo: boolean;
    recent: { yearMonth: string; stage: BookkeepingStage }[]; // 최근 6개월 (오래된→최근)
  };
  ledger: LedgerMonth[];       // 오래된→최근, 최대 24개월
  vatHistory: VatHistoryRow[];
  incomeTaxHistory: IncomeTaxHistoryRow[];
  withholdingHistory: WithholdingHistoryRow[];
  memos: ProfileMemo[];
  links: { edit: string; vat: string; incomeTax: string; withholding: string; bookkeeping: string; receivables: string };
};

type SessionLike = { id: number; role: string };

const num = (v: bigint | number | null | undefined): number | null => (v == null ? null : Number(v));

function vatLabel(period: string) {
  const [y, g, t] = period.split("-");
  return `${y}년 ${g}기 ${t}`;
}
function ymLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}년 ${parseInt(m)}월분`;
}

const WH_STATUS: Record<WithholdingStatus, { label: string; color: string }> = {
  none: { label: "미시작", color: "#B0B8C1" },
  progress: { label: "진행중", color: "#3182F6" },
  filed: { label: "신고완료", color: "#A855F7" },
  done: { label: "납부서까지", color: "#10B981" },
};

const BK_COLORS: Record<BookkeepingStage, string> = {
  none: "#D1D6DB", input: "#3182F6", booked: "#F59E0B", reviewed: "#A855F7", done: "#10B981",
};

function won(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 위하고 급여 화면 바로가기 — 거래처의 cno/cd_com + 사용자(또는 소속 세무사) 설정의 companyID/taxNum */
async function buildWehagoUrl(session: SessionLike, c: { name: string; wehagoCno: string | null; wehagoCdCom: string | null; wehagoColors: string | null }, today: string) {
  if (!c.wehagoCno || !c.wehagoCdCom) return null;
  const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { wehagoId: true, wehagoTaxNum: true } });
  let taxNum = settings?.wehagoTaxNum || "";
  if (!taxNum) {
    const me = await prisma.user.findUnique({ where: { id: session.id }, select: { managerId: true } });
    if (me?.managerId) {
      const mgr = await prisma.settings.findUnique({ where: { userId: me.managerId }, select: { wehagoTaxNum: true } });
      taxNum = mgr?.wehagoTaxNum || "";
    }
  }
  const companyId = settings?.wehagoId || "";
  if (!companyId || !taxNum) return null;
  const year = today.slice(0, 4);
  const month = parseInt(today.slice(5, 7));
  let color = "#D0BA00";
  try { color = (JSON.parse(c.wehagoColors || "{}") as Record<string, string>)[year] || color; } catch { /* 무시 */ }
  const params = `sao&cno=${c.wehagoCno}&cd_com=${c.wehagoCdCom}&gisu=${month}&yminsa=${year}&searchData=${year}0101${year}1231&color=${encodeURIComponent(color)}&companyName=${encodeURIComponent(c.name)}&companyID=${companyId}&taxNum=${taxNum}&yn_private=1&wehagoT`;
  return `https://smarta.wehago.com/#/smarta/humanresource/SWSA0101?${params}`;
}

/** 권한 범위 안의 거래처만. 범위 밖이거나 없으면 null */
export async function getClientProfile(session: SessionLike, clientId: number, today: string): Promise<ClientProfile | null> {
  const scope = await getClientScopeWhere(session);
  // 신고대리 전용 거래처도 프로필은 볼 수 있게 담당 범위(assignedFilter)만 적용
  const assignedFilter = scope.AND[0];

  const client = await prisma.client.findFirst({
    where: { id: clientId, isDeleted: false, AND: [assignedFilter] },
    select: {
      id: true, name: true, bizNumber: true, corporateNumber: true, ceoName: true, phone: true, email: true, address: true,
      bizType: true, bizItem: true, clientType: true, taxationType: true, vatTypeDetail: true, taxTypes: true, laborTypes: true,
      contractStatus: true, terminationMonth: true, contractDate: true, openDate: true, affiliation: true, cmsAffiliation: true,
      accountingProgram: true, contactMethod: true, paymentMethod: true, cmsStatus: true, withholdingType: true, halfYearTax: true,
      semoReportStatus: true, notes: true, driveFolderId: true, myboxLink: true, hometaxId: true, hometaxPw: true,
      wehagoCno: true, wehagoCdCom: true, wehagoColors: true,
      monthlyFee: true, firstWithdrawalMonth: true, withdrawalDay: true, billingTiming: true, subAssignedUserId: true,
      assignedUser: { select: { name: true, role: true, useSemoReport: true, manager: { select: { name: true, useSemoReport: true } } } },
      feeRecords: { select: { yearMonth: true, status: true } },
      commission: { select: { connectedAt: true, completedAt: true, excludeRequested: true, excludeConfirmed: true, postponedUntil: true } },
      termination: { select: { startedAt: true, completedAt: true, reason: true } },
      unpaidPostpone: { select: { postponedUntil: true, note: true } },
    },
  });
  if (!client) return null;

  const bkMonth = pickBookkeepingMonth(today);
  const whMonth = pickWithholdingMonth(today);
  const vat = pickVatPeriod(today);
  const vatPeriod = `${vat.year}-${vat.type}`;
  const it = pickIncomeTaxYear(today);
  const wh12Start = addMonths(whMonth, -11);
  const bk6Start = addMonths(bkMonth, -5);

  const [subUser, targetCfg, bkRows, whRecords, whFilings, vatRows, itRows, ledgerRows, dataCollections, memoRows, wehagoUrl] = await Promise.all([
    client.subAssignedUserId ? prisma.user.findUnique({ where: { id: client.subAssignedUserId }, select: { name: true } }) : null,
    prisma.appConfig.findUnique({ where: { key: TARGET_DAY_KEY } }),
    prisma.bookkeepingMonth.findMany({ where: { clientId, yearMonth: { gte: bk6Start, lte: bkMonth } }, select: { yearMonth: true, stage: true } }),
    prisma.withholdingRecord.findMany({ where: { clientId, yearMonth: { gte: wh12Start, lte: whMonth } }, select: { yearMonth: true, taskType: true, done: true } }),
    prisma.withholdingFiling.findMany({
      where: { clientId, yearMonth: { gte: wh12Start, lte: whMonth } },
      select: { yearMonth: true, kind: true, amount: true, reportType: true, receiptNo: true, status: true },
    }),
    prisma.vatRecord.findMany({
      where: { clientId }, orderBy: { period: "desc" }, take: 8,
      select: { period: true, stage: true, checklist: true, excluded: true, fee: true, noticeTax: true, htxData: true },
    }),
    prisma.incomeTaxRecord.findMany({
      where: { clientId }, orderBy: { taxYear: "desc" }, take: 6,
      select: {
        taxYear: true, filingDone: true, confirmStage: true, depositReceived: true, preSettlement: true, backToCollect: true, excluded: true,
        filingType: true, bookkeepingDuty: true, currSales: true, currIncome: true, currTax: true, prevSales: true, prevTax: true, adjustmentFee: true,
        bookkeepingCredit: true, startupReduction: true, smeReduction: true, investCredit: true, employmentCredit: true,
      },
    }),
    prisma.semoLedgerMonth.findMany({
      where: { clientId }, orderBy: { yearMonth: "desc" }, take: 24,
      select: { yearMonth: true, saleSupply: true, saleVat: true, saleCount: true, buySupply: true, buyVat: true, buyCount: true, purchasingRate: true },
    }),
    prisma.dataCollection.findMany({ where: { clientId, taxYear: it.taxYear }, select: { status: true, docType: true } }),
    prisma.memo.findMany({
      where: { clientId }, orderBy: { createdAt: "desc" }, take: 3,
      select: { id: true, title: true, content: true, memoType: true, createdAt: true, author: { select: { name: true } } },
    }),
    buildWehagoUrl(session, client, today),
  ]);

  /* ── 미수 ── */
  const rec = computeReceivable({
    monthlyFee: client.monthlyFee, firstWithdrawalMonth: client.firstWithdrawalMonth, withdrawalDay: client.withdrawalDay,
    billingTiming: client.billingTiming, cmsAffiliation: client.cmsAffiliation, affiliation: client.affiliation,
    contractStatus: client.contractStatus, terminationMonth: client.terminationMonth, feeRecords: client.feeRecords,
    assignedUser: client.assignedUser,
  });
  const bucket = rec.unpaidMonths.length > 0 ? unpaidBucket(rec.unpaidMonths) : null;

  /* ── 월기장 ── */
  const targetDay = targetCfg ? parseInt(targetCfg.value) || DEFAULT_TARGET_DAY : DEFAULT_TARGET_DAY;
  const semo = semoAppliesTo({ semoReportStatus: client.semoReportStatus, assignedUser: client.assignedUser });
  const bkMap = new Map(bkRows.map(r => [r.yearMonth, r.stage]));
  const bkStage = effectiveStage(bkMap.get(bkMonth) ?? "none", semo);
  const bkRecent: { yearMonth: string; stage: BookkeepingStage }[] = [];
  for (let i = 5; i >= 0; i--) {
    const ym = addMonths(bkMonth, -i);
    bkRecent.push({ yearMonth: ym, stage: effectiveStage(bkMap.get(ym) ?? "none", semo) });
  }
  const bkOverdue = isOverdue(bkMonth, bkStage, targetDay, today, semo);
  const bkStageDef = BK_STAGES.find(s => s.key === bkStage)!;

  /* ── 원천세 (최근 12개월) ── */
  const whHistory: WithholdingHistoryRow[] = [];
  const whRecByMonth = new Map<string, { taskType: string; done: boolean }[]>();
  for (const r of whRecords) {
    const arr = whRecByMonth.get(r.yearMonth) ?? [];
    arr.push(r); whRecByMonth.set(r.yearMonth, arr);
  }
  for (let i = 0; i < 12; i++) {
    const ym = addMonths(whMonth, -i);
    const m = parseInt(ym.slice(5, 7));
    const steps = withholdingSteps(client.withholdingType, m, client.halfYearTax);
    const recs = whRecByMonth.get(ym) ?? [];
    const status = deriveWithholdingStatus(steps, recs);
    const doneSet = new Set(recs.filter(r => r.done).map(r => r.taskType));
    const fIncome = whFilings.find(f => f.yearMonth === ym && f.kind === "income") ?? null;
    const fLocal = whFilings.find(f => f.yearMonth === ym && f.kind === "local") ?? null;
    // 지난 달인데 체크 기록도 신고 기록도 전혀 없으면 '미시작'이 아니라 당시 기록이 없는 것
    const noRecord = i > 0 && recs.length === 0 && !fIncome && steps.length > 0;
    whHistory.push({
      yearMonth: ym, label: ymLabel(ym), steps, doneSteps: steps.filter(s => doneSet.has(s)),
      status, statusLabel: noRecord ? "기록 없음" : WH_STATUS[status].label, statusColor: noRecord ? "#D1D6DB" : WH_STATUS[status].color,
      incomeAmount: fIncome?.amount ?? null, localAmount: fLocal?.amount ?? null,
      reportType: fIncome?.reportType ?? null, receiptNo: fIncome?.receiptNo ?? null, filingStatus: fIncome?.status ?? null,
      isCurrent: i === 0,
    });
  }
  const whCurrent = whHistory[0];

  /* ── 부가세 ── */
  const vatHistory: VatHistoryRow[] = vatRows.map(r => {
    let htx: { sales?: { supplyTotal?: number }; buy?: { supplyTotal?: number } } | null = null;
    try { htx = r.htxData ? JSON.parse(r.htxData) : null; } catch { htx = null; }
    const stage = normalizeVatStage(r.stage);
    const def = VAT_STAGES.find(s => s.key === stage)!;
    return {
      period: r.period, label: vatLabel(r.period), stage, stageLabel: def.label, stageColor: def.color,
      excluded: r.excluded, prelimNotice: isPrelimNoticeRecord(r.period, client.clientType, r.checklist, r.htxData),
      salesSupply: htx?.sales?.supplyTotal ?? null, buySupply: htx?.buy?.supplyTotal ?? null,
      noticeAmount: noticeAmountOf(r.noticeTax, r.htxData), fee: r.fee, hasHtx: !!htx, isCurrent: r.period === vatPeriod,
    };
  });
  const vatExempt = ["면세", "프리랜서", "폐업"].includes(client.taxationType ?? "");
  const vatCurrent = vatHistory.find(r => r.isCurrent) ?? null;

  /* ── 종소세 ── */
  const itHistory: IncomeTaxHistoryRow[] = itRows.map(r => {
    const stage = deriveIncomeTaxStage(r);
    const def = INCOME_TAX_STAGES.find(s => s.key === stage)!;
    const reductions: string[] = [];
    if (r.bookkeepingCredit) reductions.push("기장세액공제");
    if (r.startupReduction) reductions.push("창업중소기업 감면");
    if (r.smeReduction) reductions.push("중소기업특별감면");
    if (r.investCredit) reductions.push("통합투자세액공제");
    if (r.employmentCredit) reductions.push("고용증대세액공제");
    return {
      taxYear: r.taxYear, stage, stageLabel: def.label, stageColor: def.color, excluded: r.excluded,
      filingType: r.filingType, bookkeepingDuty: r.bookkeepingDuty,
      currSales: num(r.currSales), currIncome: num(r.currIncome), currTax: num(r.currTax),
      prevSales: num(r.prevSales), prevTax: num(r.prevTax), reductions, adjustmentFee: num(r.adjustmentFee),
      isCurrent: r.taxYear === it.taxYear,
    };
  });
  const isCorp = client.clientType === "corporate";
  const itCurrent = itHistory.find(r => r.isCurrent) ?? null;

  /* ── 월별 매출·매입 ── */
  const ledger: LedgerMonth[] = ledgerRows
    .map(r => ({
      yearMonth: r.yearMonth, saleSupply: Number(r.saleSupply), saleVat: Number(r.saleVat), saleCount: r.saleCount,
      buySupply: Number(r.buySupply), buyVat: Number(r.buyVat), buyCount: r.buyCount, purchasingRate: r.purchasingRate,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  /* ── 경고 ── */
  const warnings: ProfileWarning[] = [];
  const active = client.contractStatus === "active";
  if (bucket === "long") {
    warnings.push({
      key: "unpaid-long", level: "danger", label: `장기미수 ${rec.unpaidMonths.length}개월`,
      detail: `${won(rec.unpaid)}원 · ${rec.unpaidMonths.map(m => `${parseInt(m.slice(5, 7))}월`).join(", ")}`, href: "/receivables",
    });
  } else if (bucket) {
    warnings.push({ key: "unpaid", level: "warn", label: `미수 ${rec.unpaidMonths.length}개월`, detail: `${won(rec.unpaid)}원`, href: "/receivables" });
  }
  if (client.unpaidPostpone) {
    warnings.push({ key: "unpaid-postpone", level: "info", label: "미수 유예 중", detail: `${client.unpaidPostpone.postponedUntil.toISOString().slice(0, 10)}까지${client.unpaidPostpone.note ? ` · ${client.unpaidPostpone.note}` : ""}` });
  }
  if (active && bkOverdue) {
    warnings.push({ key: "bk-overdue", level: "warn", label: `${parseInt(bkMonth.slice(5, 7))}월분 기장 지연`, detail: `마감 ${bookkeepingDeadline(bkMonth, targetDay).slice(5).replace("-", "/")} · 현재 ${bkStageDef.label}`, href: `/bookkeeping?focus=${bkMonth}` });
  }
  if (!isCorp && !it.offSeason) {
    const pending = dataCollections.filter(d => d.status === "pending");
    if (pending.length > 0) {
      warnings.push({ key: "collect", level: "warn", label: `종소세 자료 미수집 ${pending.length}건`, detail: pending.map(p => p.docType).slice(0, 4).join(", "), href: `/data-collect?year=${it.taxYear}` });
    }
  }
  if (active && client.commission && !client.commission.completedAt && !client.commission.connectedAt && !client.commission.excludeConfirmed) {
    warnings.push({ key: "happycall", level: "warn", label: "신규수임 해피콜 미처리", detail: client.commission.excludeRequested ? "관리제외 요청 상태" : "통화 연결 기록 없음", href: "/commission" });
  }
  if (client.termination && !client.termination.completedAt) {
    warnings.push({ key: "termination", level: "info", label: "해지 처리 진행 중", detail: client.termination.reason ?? undefined, href: "/termination" });
  }
  if (active && client.cmsStatus === "none" && client.paymentMethod === "cms") {
    warnings.push({ key: "cms", level: "info", label: "CMS 미등록" });
  }

  /* ── 타일 ── */
  const withdrawalDay = effectiveWithdrawalDay(rec.wt);
  const billingTiming = effectiveBillingTiming(rec.wt);
  const vatTypeLabel = vat.type.replace("-", "기 ");
  const tiles: ProfileTile[] = [
    {
      key: "fee", title: "월 기장료", value: client.monthlyFee ? won(client.monthlyFee) : "-", unit: client.monthlyFee ? "원" : undefined,
      sub: `VAT 포함 · 매월 ${withdrawalDay}일 ${billingTiming === "arrears" ? "후불" : "당월"} 출금`, tone: "neutral", href: "/receivables",
    },
    {
      key: "unpaid", title: "미수 총액", value: rec.unpaid > 0 ? won(rec.unpaid) : "0", unit: "원",
      sub: rec.unpaidMonths.length > 0 ? `${rec.unpaidMonths.length}개월 미납 · 청구 ${rec.billableMonths.length}개월 중` : rec.billableMonths.length > 0 ? `청구 ${rec.billableMonths.length}개월 전액 수납` : "청구 이력 없음",
      tone: bucket === "long" ? "danger" : bucket ? "warn" : "good", href: "/receivables",
    },
    {
      key: "bookkeeping", title: `${parseInt(bkMonth.slice(5, 7))}월분 기장`, value: bkStageDef.label,
      sub: bkOverdue ? `마감 ${bookkeepingDeadline(bkMonth, targetDay).slice(5).replace("-", "/")} 지남` : `마감 ${bookkeepingDeadline(bkMonth, targetDay).slice(5).replace("-", "/")}${semo ? "" : " · 세모 미적용"}`,
      color: BK_COLORS[bkStage], tone: bkOverdue ? "warn" : bkStage === "done" || (!semo && bkStage === "booked") ? "good" : "neutral",
      href: `/bookkeeping?focus=${bkMonth}`,
    },
    {
      key: "vat", title: "부가세", value: vatExempt ? "해당 없음" : vatCurrent?.excluded ? "제외" : vatCurrent?.prelimNotice ? "예정고지" : (vatCurrent?.stageLabel ?? "자료수집"),
      sub: vatExempt ? (client.taxationType ?? "") : `${vat.year}년 ${vatTypeLabel}${vatCurrent?.prelimNotice && vatCurrent.noticeAmount > 0 ? ` · 고지 ${won(vatCurrent.noticeAmount)}원` : ""}`,
      color: vatExempt ? "#D1D6DB" : vatCurrent?.prelimNotice ? "#8B95A1" : (vatCurrent?.stageColor ?? "#F59E0B"),
      tone: vatCurrent?.stage === "done" ? "good" : "neutral", href: `/vat?year=${vat.year}&period=${vat.type}`,
    },
    {
      key: "withholding", title: "원천세", value: client.withholdingType === "D" ? "해당 없음" : whCurrent.statusLabel,
      sub: client.withholdingType === "D" ? "원천세 없음(D)" : `${whCurrent.label} · ${whCurrent.doneSteps.length}/${whCurrent.steps.length}단계${client.halfYearTax ? " · 반기납" : ""}`,
      color: client.withholdingType === "D" ? "#D1D6DB" : whCurrent.statusColor,
      tone: whCurrent.status === "done" ? "good" : "neutral", href: `/withholding?ym=${whMonth}`,
    },
    {
      key: "incomeTax", title: "종합소득세", value: isCorp ? "법인" : itCurrent?.excluded ? "제외" : (itCurrent?.stageLabel ?? "자료수집"),
      sub: isCorp ? "법인세 대상" : `${it.taxYear}년 귀속${it.offSeason ? " · 지난 시즌" : ""}${itCurrent?.currTax != null ? ` · 세액 ${won(itCurrent.currTax)}원` : ""}`,
      color: isCorp ? "#D1D6DB" : (itCurrent?.stageColor ?? "#F59E0B"),
      tone: itCurrent?.stage === "done" ? "good" : "neutral", href: `/income-tax?year=${it.taxYear}`,
    },
  ];

  const accountant = client.assignedUser
    ? (client.assignedUser.role === "employee" && client.assignedUser.manager ? client.assignedUser.manager.name : client.assignedUser.name)
    : null;

  return {
    today,
    client: {
      id: client.id, name: client.name, bizNumber: client.bizNumber, corporateNumber: client.corporateNumber, ceoName: client.ceoName,
      phone: client.phone, email: client.email, address: client.address, bizType: client.bizType, bizItem: client.bizItem,
      clientType: client.clientType, taxationType: client.taxationType, vatTypeDetail: client.vatTypeDetail, taxTypes: client.taxTypes,
      laborTypes: client.laborTypes, contractStatus: client.contractStatus, terminationMonth: client.terminationMonth,
      contractDate: client.contractDate, openDate: client.openDate, affiliation: client.affiliation, accountingProgram: client.accountingProgram,
      contactMethod: client.contactMethod, paymentMethod: client.paymentMethod, cmsStatus: client.cmsStatus,
      withholdingType: client.withholdingType, halfYearTax: client.halfYearTax, semoReportStatus: client.semoReportStatus,
      notes: client.notes, driveFolderId: client.driveFolderId, myboxLink: client.myboxLink,
      hasHometax: !!(client.hometaxId && client.hometaxPw), wehagoUrl,
      assignedUser: client.assignedUser?.name ?? null, subAssignedUser: subUser?.name ?? null, accountant,
    },
    warnings,
    tiles,
    receivable: {
      monthlyFee: client.monthlyFee, withdrawalDay, billingTiming, expected: rec.expected, paid: rec.paid, unpaid: rec.unpaid,
      unpaidMonths: rec.unpaidMonths, bucket, firstWithdrawalMonth: client.firstWithdrawalMonth,
      postponedUntil: client.unpaidPostpone?.postponedUntil.toISOString().slice(0, 10) ?? null,
    },
    bookkeeping: { month: bkMonth, stage: bkStage, deadline: bookkeepingDeadline(bkMonth, targetDay), overdue: bkOverdue, semo, recent: bkRecent },
    ledger,
    vatHistory,
    incomeTaxHistory: itHistory,
    withholdingHistory: whHistory,
    memos: memoRows.map(m => ({ id: m.id, title: m.title, content: m.content, memoType: m.memoType, createdAt: m.createdAt.toISOString(), author: m.author.name })),
    links: {
      edit: `/clients/${client.id}/edit`,
      vat: `/vat?year=${vat.year}&period=${vat.type}`,
      incomeTax: `/income-tax?year=${it.taxYear}`,
      withholding: `/withholding?ym=${whMonth}`,
      bookkeeping: `/bookkeeping?focus=${bkMonth}`,
      receivables: "/receivables",
    },
  };
}
