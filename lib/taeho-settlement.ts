import { prisma } from "@/lib/prisma";

/**
 * 세무회계태호 정산 — 참여자(이휘언) 월 손익계산서 계산.
 *
 * 거래처 기장료는 대표(사무실) 계좌로 들어온다. 참여자 담당 거래처에서 실제 입금된 돈이 '매출'이고,
 * 거기서 대표 수수료와 공통비용의 참여자 부담분을 뺀 '이익'을 대표가 참여자에게 입금한다.
 *
 * 금액은 전부 공급대가(부가세 포함) 기준 — 거래처 월기장료·Savetax 정산 금액을 그대로 쓴다 (÷1.1 환산 없음, 2026-10-19 사용자 결정).
 * 페이지를 열 때마다 DB에서 다시 계산한다 (채권관리 수납 체크·Savetax 정산 출금 체크 변경이 바로 반영).
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

export type RevenueRow = {
  name: string; // 거래처명
  yearMonth: string;
  amount: number; // 공급대가(부가세 포함)
  source: RevenueSource;
  note?: string | null;
};

export type RevenueItem = {
  key: RevenueSource;
  label: string;
  hint: string;
  total: number;
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
  note: string | null;
  sortOrder: number;
};

export type MonthStatement = {
  yearMonth: string;
  revenue: { items: RevenueItem[]; bookkeeping: number; oneoff: number; total: number };
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

export type MonthPoint = { yearMonth: string; revenue: number; cost: number; profit: number };

export type TaehoSettlementData = {
  participant: Participant;
  statement: MonthStatement;
  prev: MonthPoint | null;
  /** 기준 월이 속한 해의 1~12월 */
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

/**
 * 참여자 한 명의 손익계산서(기준 월) + 전월 + 연간 12개월 추이를 한 번에 계산.
 * DB 조회는 13개월(전년 12월 ~ 해당 연도 12월) 범위로 묶어서 한다.
 */
export async function loadTaehoSettlement(participant: Participant, yearMonth: string): Promise<TaehoSettlementData> {
  const year = Number(yearMonth.slice(0, 4));
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const prev = prevYM(yearMonth);
  const months = Array.from(new Set([prev, ...yearMonths]));

  const [clients, bookkeepings, oneoffs, expenses] = await Promise.all([
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
        clientName: true,
        monthlyFee: true,
        notes: true,
        checks: { where: { withdrawn: true, yearMonth: { in: months } }, select: { yearMonth: true } },
      },
      orderBy: { clientName: "asc" },
    }),
    // 3) 단건 수수료 — 출금 체크된 건
    prisma.settlementOneoff.findMany({
      where: { assignedUserName: participant.name, withdrawn: true, yearMonth: { in: months } },
      select: { clientName: true, fee: true, yearMonth: true, notes: true },
      orderBy: { createdAt: "asc" },
    }),
    // 4) 공통비용
    prisma.taehoSettlementExpense.findMany({
      where: { yearMonth: { in: months } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  // 월별 매출 행 모으기
  const byMonth = new Map<string, { client: RevenueRow[]; pulled: RevenueRow[]; oneoff: RevenueRow[] }>();
  const bucket = (ym: string) => {
    let b = byMonth.get(ym);
    if (!b) {
      b = { client: [], pulled: [], oneoff: [] };
      byMonth.set(ym, b);
    }
    return b;
  };
  for (const c of clients) {
    const fee = c.monthlyFee ?? 0;
    for (const r of c.feeRecords) {
      bucket(r.yearMonth).client.push({ name: c.name, yearMonth: r.yearMonth, amount: fee, source: "client" });
    }
  }
  for (const b of bookkeepings) {
    for (const chk of b.checks) {
      bucket(chk.yearMonth).pulled.push({
        name: b.clientName,
        yearMonth: chk.yearMonth,
        amount: b.monthlyFee,
        source: "pulled",
        note: b.notes,
      });
    }
  }
  for (const o of oneoffs) {
    bucket(o.yearMonth).oneoff.push({
      name: o.clientName,
      yearMonth: o.yearMonth,
      amount: o.fee,
      source: "oneoff",
      note: o.notes,
    });
  }

  const expensesByMonth = new Map<string, typeof expenses>();
  for (const e of expenses) {
    const list = expensesByMonth.get(e.yearMonth) ?? [];
    list.push(e);
    expensesByMonth.set(e.yearMonth, list);
  }

  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  function buildStatement(ym: string): MonthStatement {
    const b = byMonth.get(ym) ?? { client: [], pulled: [], oneoff: [] };
    const items: RevenueItem[] = [
      {
        key: "client",
        label: "기장료 입금",
        hint: "채권관리에서 수납 체크된 담당 거래처 (세이브택스 소속 제외)",
        total: sum(b.client),
        rows: b.client,
      },
      {
        key: "pulled",
        label: "빼온 거래처 입금",
        hint: "Savetax 정산 기장 목록에서 이번 달 출금 체크된 건",
        total: sum(b.pulled),
        rows: b.pulled,
      },
      {
        key: "oneoff",
        label: "단건 수수료",
        hint: "Savetax 정산 단건에서 출금 체크된 건의 수수료",
        total: sum(b.oneoff),
        rows: b.oneoff,
      },
    ];
    const bookkeeping = items[0].total + items[1].total;
    const oneoff = items[2].total;
    const revenueTotal = bookkeeping + oneoff;

    const feeBookkeeping = pct(bookkeeping, participant.feeRate);
    const feeOneoff = pct(oneoff, participant.oneoffRate);
    const feeTotal = feeBookkeeping + feeOneoff;

    const exp: ExpenseRow[] = (expensesByMonth.get(ym) ?? []).map((e) => {
      const share = pct(e.amount, e.shareRate);
      return {
        id: e.id,
        label: e.label,
        amount: e.amount,
        shareRate: e.shareRate,
        share,
        ownerShare: e.amount - share,
        recurring: e.recurring,
        note: e.note,
        sortOrder: e.sortOrder,
      };
    });
    const expenseShareTotal = exp.reduce((s, e) => s + e.share, 0);
    const expenseGrossTotal = exp.reduce((s, e) => s + e.amount, 0);
    const costTotal = feeTotal + expenseShareTotal;

    return {
      yearMonth: ym,
      revenue: { items, bookkeeping, oneoff, total: revenueTotal },
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

  const toPoint = (s: MonthStatement): MonthPoint => ({
    yearMonth: s.yearMonth,
    revenue: s.revenue.total,
    cost: s.cost.total,
    profit: s.profit,
  });

  const statement = buildStatement(yearMonth);
  const prevStatement = buildStatement(prev);
  const yearPoints = yearMonths.map((ym) => toPoint(buildStatement(ym)));

  const prevRecurring = (expensesByMonth.get(prev) ?? []).some((e) => e.recurring);
  return {
    participant,
    statement,
    prev: toPoint(prevStatement),
    year: yearPoints,
    canCopyRecurring: statement.cost.expenses.length === 0 && prevRecurring,
  };
}
