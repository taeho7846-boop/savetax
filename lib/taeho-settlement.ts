import { prisma } from "@/lib/prisma";

/**
 * 세무회계태호 정산 — 참여자(이휘언) 월 손익계산서 계산.
 *
 * 거래처 기장료는 대표(사무실) 계좌로 들어온다. 참여자 담당 거래처에서 실제 입금된 돈이 '매출'이고,
 * 거기서 대표 수수료와 공통비용의 참여자 부담분을 뺀 '이익'을 대표가 참여자에게 입금한다.
 *
 * 금액은 전부 공급대가(부가세 포함) 기준 — 거래처 월기장료·Savetax 정산 금액을 그대로 쓴다 (÷1.1 환산 없음, 2026-10-19 사용자 결정).
 * 페이지를 열 때마다 DB에서 다시 계산한다 (채권관리 수납 체크·Savetax 정산 출금 체크 변경이 바로 반영).
 *
 * 차수 정산: 현금이 들어온 만큼 끊어서 정산한다. 대표가 'N차 정산 확정'을 누르면 그 시점까지 아직 어느 차수에도
 * 안 들어간 입금 건을 TaehoSettlementRound.items 로 스냅샷한다. 이후 들어오는 입금은 '미정산'(다음 차수 초안)에 쌓인다.
 * 확정 후 원본 체크가 풀려도 확정 내역은 유지하고 경고만 표시한다.
 */

export function pct(amount: number, rate: number): number {
  return Math.round((amount * rate) / 100);
}

export type Participant = {
  id: number;
  name: string;
  feeRate: number; // 기장료 수수료율 %
  oneoffRate: number; // 단건 수수료율 %
};

export type RevenueSource = "client" | "pulled" | "oneoff";

/** 확정 차수에 들어간 건의 원본 상태 — live: 그대로 / unchecked: 원본 체크가 풀림 / changed: 원본 금액이 바뀜 */
export type RowStatus = "live" | "unchecked" | "changed";

export type RevenueRow = {
  /** 원본 행 식별자 — client: clientId / pulled: bookkeepingId / oneoff: oneoffId */
  refId: number;
  name: string; // 거래처명
  yearMonth: string;
  amount: number; // 공급대가(부가세 포함). 확정 차수 건은 확정 시점 스냅샷
  source: RevenueSource;
  note?: string | null;
  /** 이 달 계산에서 제외됨 (원본은 그대로, TaehoSettlementExclusion). 미정산 건에만 해당 */
  excluded: boolean;
  /** 확정된 차수 번호. 미정산이면 null */
  roundSeq: number | null;
  status: RowStatus;
  /** status가 changed일 때 현재 원본 금액 */
  liveAmount?: number;
};

export type RevenueItem = {
  key: RevenueSource;
  label: string;
  hint: string;
  /** 제외된 행을 뺀 합계 */
  total: number;
  excludedCount: number;
  rows: RevenueRow[];
};

export type ExpenseRow = {
  id: number;
  label: string;
  amount: number; // 전체 금액(부가세 포함)
  shareRate: number; // 참여자 부담 %
  share: number; // 참여자 부담분
  ownerShare: number; // 대표 부담분
  recurring: boolean;
  roundSeq: number; // 몇 차에서 차감하는지
  note: string | null;
  sortOrder: number;
};

export type Statement = {
  yearMonth: string;
  revenue: { items: RevenueItem[]; bookkeeping: number; oneoff: number; total: number; count: number };
  cost: {
    feeBookkeeping: number;
    feeOneoff: number;
    feeTotal: number;
    expenses: ExpenseRow[];
    expenseShareTotal: number;
    expenseOwnerTotal: number;
    expenseGrossTotal: number;
    total: number;
  };
  profit: number; // = 참여자 입금액
};

export type RoundView = {
  seq: number;
  /** 확정 차수의 DB id. 미정산(초안)이면 null */
  id: number | null;
  confirmed: boolean;
  settledAt: string | null; // ISO
  note: string | null;
  statement: Statement;
  /** 원본 체크가 풀리거나 금액이 바뀐 건수 */
  warnings: number;
};

export type MonthPoint = { yearMonth: string; revenue: number; cost: number; profit: number };

export type TaehoSettlementData = {
  participant: Participant;
  /** 통합 I/S — 확정 차수 스냅샷 + 미정산 건 + 전체 공통비용 */
  statement: Statement;
  /** 확정된 차수들 (1차부터) */
  rounds: RoundView[];
  /** 미정산 = 다음 차수 초안 (seq = rounds.length + 1) */
  draft: RoundView;
  prev: MonthPoint | null;
  /** 기준 월이 속한 해의 1~12월 (통합 기준) */
  year: MonthPoint[];
  /** 전월에 반복(recurring) 항목이 있고 이번 달 비용이 비어 있을 때 true */
  canCopyRecurring: boolean;
};

export function prevYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentYM(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidYM(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** 정산 참여자 = 수수료율이 설정된 활성 사용자 */
export async function getTaehoParticipants(): Promise<Participant[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, taehoFeeRate: { not: null } },
    select: { id: true, name: true, taehoFeeRate: true, taehoOneoffRate: true },
    orderBy: { id: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    feeRate: u.taehoFeeRate ?? 0,
    oneoffRate: u.taehoOneoffRate ?? 0,
  }));
}

export async function getTaehoParticipant(id: number): Promise<Participant | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true, taehoFeeRate: true, taehoOneoffRate: true },
  });
  if (!u || !u.isActive || u.taehoFeeRate == null) return null;
  return { id: u.id, name: u.name, feeRate: u.taehoFeeRate, oneoffRate: u.taehoOneoffRate ?? 0 };
}

export async function isTaehoParticipant(userId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { taehoFeeRate: true } });
  return u?.taehoFeeRate != null;
}

export function canViewTaehoSettlement(session: { role: string }, participant: boolean): boolean {
  return session.role === "owner" || session.role === "admin" || participant;
}

export function canEditTaehoSettlement(session: { role: string }): boolean {
  return session.role === "owner" || session.role === "admin";
}

export const rowKey = (source: string, refId: number) => `${source}|${refId}`;

type LiveRow = Omit<RevenueRow, "roundSeq" | "status" | "liveAmount">;

/**
 * 참여자 한 명의 통합 손익계산서(기준 월) + 차수별 + 전월 + 연간 12개월 추이를 한 번에 계산.
 * DB 조회는 13개월(전년 12월 ~ 해당 연도 12월) 범위로 묶어서 한다.
 */
export async function loadTaehoSettlement(participant: Participant, yearMonth: string): Promise<TaehoSettlementData> {
  const year = Number(yearMonth.slice(0, 4));
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const prev = prevYM(yearMonth);
  const months = Array.from(new Set([prev, ...yearMonths]));

  const [clients, bookkeepings, oneoffs, expenses, exclusions, rounds] = await Promise.all([
    // 1) 기장료 입금 — 담당(사수) 거래처 중 세이브택스 소속 제외, 해당 월 수납(paid) 체크
    prisma.client.findMany({
      where: {
        isDeleted: false,
        assignedUserId: participant.id,
        OR: [{ affiliation: null }, { affiliation: { not: "세이브택스" } }],
        monthlyFee: { gt: 0 },
        feeRecords: { some: { status: "paid", yearMonth: { in: months } } },
      },
      select: {
        id: true,
        name: true,
        monthlyFee: true,
        feeRecords: { where: { status: "paid", yearMonth: { in: months } }, select: { yearMonth: true } },
      },
      orderBy: { name: "asc" },
    }),
    // 2) 빼온 거래처 — Savetax 정산 기장 목록(담당자 = 참여자) 중 해당 월 출금 체크
    prisma.settlementBookkeeping.findMany({
      where: {
        assignedUserName: participant.name,
        checks: { some: { withdrawn: true, yearMonth: { in: months } } },
      },
      select: {
        id: true,
        clientName: true,
        monthlyFee: true,
        notes: true,
        checks: { where: { withdrawn: true, yearMonth: { in: months } }, select: { yearMonth: true } },
      },
      orderBy: { clientName: "asc" },
    }),
    // 3) 단건 — 출금 체크된 건. 매출은 '출금액'(withdrawalAmount) 전체 (2026-10-19 사용자 결정)
    prisma.settlementOneoff.findMany({
      where: { assignedUserName: participant.name, withdrawn: true, yearMonth: { in: months } },
      select: { id: true, clientName: true, withdrawalAmount: true, yearMonth: true, notes: true },
      orderBy: { createdAt: "asc" },
    }),
    // 4) 공통비용
    prisma.taehoSettlementExpense.findMany({
      where: { yearMonth: { in: months } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    // 5) 이 달 계산에서 제외한 매출 행
    prisma.taehoSettlementExclusion.findMany({
      where: { yearMonth: { in: months } },
      select: { yearMonth: true, source: true, refId: true },
    }),
    // 6) 확정 차수 + 스냅샷 항목
    prisma.taehoSettlementRound.findMany({
      where: { participantId: participant.id, yearMonth: { in: months } },
      include: { items: true },
      orderBy: { seq: "asc" },
    }),
  ]);

  const excludedKeys = new Set(exclusions.map((e) => `${e.yearMonth}|${e.source}|${e.refId}`));
  const isExcluded = (ym: string, source: RevenueSource, refId: number) => excludedKeys.has(`${ym}|${source}|${refId}`);

  // 월별 '현재 원본' 매출 행
  const liveByMonth = new Map<string, LiveRow[]>();
  const push = (row: LiveRow) => {
    const list = liveByMonth.get(row.yearMonth) ?? [];
    list.push(row);
    liveByMonth.set(row.yearMonth, list);
  };
  for (const c of clients) {
    const fee = c.monthlyFee ?? 0;
    for (const r of c.feeRecords) {
      push({ refId: c.id, name: c.name, yearMonth: r.yearMonth, amount: fee, source: "client", excluded: isExcluded(r.yearMonth, "client", c.id) });
    }
  }
  for (const b of bookkeepings) {
    for (const chk of b.checks) {
      push({
        refId: b.id,
        name: b.clientName,
        yearMonth: chk.yearMonth,
        amount: b.monthlyFee,
        source: "pulled",
        note: b.notes,
        excluded: isExcluded(chk.yearMonth, "pulled", b.id),
      });
    }
  }
  for (const o of oneoffs) {
    push({
      refId: o.id,
      name: o.clientName,
      yearMonth: o.yearMonth,
      amount: o.withdrawalAmount,
      source: "oneoff",
      note: o.notes,
      excluded: isExcluded(o.yearMonth, "oneoff", o.id),
    });
  }

  const expensesByMonth = new Map<string, ExpenseRow[]>();
  for (const e of expenses) {
    const share = pct(e.amount, e.shareRate);
    const list = expensesByMonth.get(e.yearMonth) ?? [];
    list.push({
      id: e.id,
      label: e.label,
      amount: e.amount,
      shareRate: e.shareRate,
      share,
      ownerShare: e.amount - share,
      recurring: e.recurring,
      roundSeq: e.roundSeq,
      note: e.note,
      sortOrder: e.sortOrder,
    });
    expensesByMonth.set(e.yearMonth, list);
  }

  const roundsByMonth = new Map<string, typeof rounds>();
  for (const r of rounds) {
    const list = roundsByMonth.get(r.yearMonth) ?? [];
    list.push(r);
    roundsByMonth.set(r.yearMonth, list);
  }

  const ITEM_META: Record<RevenueSource, { label: string; hint: string }> = {
    client: { label: "기장료 입금", hint: "채권관리에서 수납 체크된 담당 거래처 (세이브택스 소속 제외)" },
    pulled: { label: "빼온 거래처 입금", hint: "Savetax 정산 기장 목록에서 이번 달 출금 체크된 건" },
    oneoff: { label: "단건 출금", hint: "Savetax 정산 단건에서 출금 체크된 건의 출금액" },
  };

  /** 순수 계산: 매출 행 + 비용 항목 → 손익계산서 */
  function build(ym: string, rows: RevenueRow[], exp: ExpenseRow[]): Statement {
    const items = (["client", "pulled", "oneoff"] as const).map((key) => {
      const list = rows.filter((r) => r.source === key);
      return {
        key,
        ...ITEM_META[key],
        total: list.reduce((s, r) => (r.excluded ? s : s + r.amount), 0),
        excludedCount: list.filter((r) => r.excluded).length,
        rows: list,
      };
    });
    const bookkeeping = items[0].total + items[1].total;
    const oneoff = items[2].total;
    const revenueTotal = bookkeeping + oneoff;
    const count = rows.filter((r) => !r.excluded).length;

    const feeBookkeeping = pct(bookkeeping, participant.feeRate);
    const feeOneoff = pct(oneoff, participant.oneoffRate);
    const feeTotal = feeBookkeeping + feeOneoff;
    const expenseShareTotal = exp.reduce((s, e) => s + e.share, 0);
    const expenseGrossTotal = exp.reduce((s, e) => s + e.amount, 0);
    const costTotal = feeTotal + expenseShareTotal;

    return {
      yearMonth: ym,
      revenue: { items, bookkeeping, oneoff, total: revenueTotal, count },
      cost: {
        feeBookkeeping,
        feeOneoff,
        feeTotal,
        expenses: exp,
        expenseShareTotal,
        expenseOwnerTotal: expenseGrossTotal - expenseShareTotal,
        expenseGrossTotal,
        total: costTotal,
      },
      profit: revenueTotal - costTotal,
    };
  }

  /** 한 달치: 통합 + 확정 차수들 + 미정산 초안 */
  function computeMonth(ym: string) {
    const live = liveByMonth.get(ym) ?? [];
    const liveMap = new Map(live.map((r) => [rowKey(r.source, r.refId), r]));
    const exp = expensesByMonth.get(ym) ?? [];
    const monthRounds = roundsByMonth.get(ym) ?? [];
    const inRound = new Set<string>();

    const roundViews: RoundView[] = monthRounds.map((r) => {
      const rows: RevenueRow[] = r.items.map((it) => {
        const key = rowKey(it.source, it.refId);
        inRound.add(key);
        const l = liveMap.get(key);
        const status: RowStatus = !l || l.excluded ? "unchecked" : l.amount !== it.amount ? "changed" : "live";
        return {
          refId: it.refId,
          name: it.name,
          yearMonth: ym,
          amount: it.amount,
          source: it.source as RevenueSource,
          note: l?.note,
          excluded: false,
          roundSeq: r.seq,
          status,
          liveAmount: l?.amount,
        };
      });
      return {
        seq: r.seq,
        id: r.id,
        confirmed: true,
        settledAt: r.settledAt.toISOString(),
        note: r.note,
        statement: build(ym, rows, exp.filter((e) => e.roundSeq === r.seq)),
        warnings: rows.filter((x) => x.status !== "live").length,
      };
    });

    const nextSeq = monthRounds.length + 1;
    const pending: RevenueRow[] = live
      .filter((r) => !inRound.has(rowKey(r.source, r.refId)))
      .map((r) => ({ ...r, roundSeq: null, status: "live" as const }));
    const draft: RoundView = {
      seq: nextSeq,
      id: null,
      confirmed: false,
      settledAt: null,
      note: null,
      statement: build(ym, pending, exp.filter((e) => e.roundSeq === nextSeq)),
      warnings: 0,
    };

    const allRows = [...roundViews.flatMap((v) => v.statement.revenue.items.flatMap((i) => i.rows)), ...pending];
    const integrated = build(ym, allRows, exp);
    return { integrated, rounds: roundViews, draft };
  }

  const toPoint = (s: Statement): MonthPoint => ({ yearMonth: s.yearMonth, revenue: s.revenue.total, cost: s.cost.total, profit: s.profit });

  const cur = computeMonth(yearMonth);
  const prevRecurring = (expensesByMonth.get(prev) ?? []).some((e) => e.recurring);
  return {
    participant,
    statement: cur.integrated,
    rounds: cur.rounds,
    draft: cur.draft,
    prev: toPoint(computeMonth(prev).integrated),
    year: yearMonths.map((ym) => toPoint(computeMonth(ym).integrated)),
    canCopyRecurring: cur.integrated.cost.expenses.length === 0 && prevRecurring,
  };
}
