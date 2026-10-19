/** 세모리포트 월별 매입매출 수집 — 진행 상태(AppConfig) 키와 타입. 집계·화면은 이 타입을 공유한다. */

export const SEMO_LEDGER_RUN_KEY = "semoLedger:run";

export type SemoLedgerRun = {
  startedAt: string;
  finishedAt: string | null;
  years: string[];
  total: number;        // 세모리포트 거래처 수
  done: number;         // 처리한 거래처 수
  matched: number;      // 우리 거래처와 매칭돼 저장된 수
  rows: number;         // 저장(upsert)한 월 행 수
  unmatched: { name: string; bizNo: string }[]; // 세모에는 있는데 우리 범위에 없는 거래처
  error: string | null;
  byUserId: number;
};

/** 세모리포트 고객 매입매출장 화면 — 확장이 이 주소에 해시 파라미터를 붙여 연다 */
export const SEMO_LEDGER_PAGE = "https://reportmgmt.appplay.co.kr/analy_book_001.act";

/* ───────────── 월별 상세(증빙 유형별) ─────────────
 * SemoLedgerMonth.detail 에 저장된 세모리포트 원본 필드(r005)를 유형별로 풀어낸다.
 * 필드 규칙: S_<유형>_TRSC_CNT / _TOTL_AMT / _SPLY_AMT / _VAT_AMT (매출), B_<유형>_... (매입)
 * 계산서(면세)·영세율은 세액이 없어 _VAT_AMT / _TOTL_AMT 가 없다. HE_* 필드는 쓰지 않는다.
 */

export type LedgerCategory = {
  key: string;
  label: string;
  /** 짧은 라벨 (표 좁을 때) */
  short: string;
  count: number;
  supply: number;
  vat: number;
  total: number;
  /** 면세·영세율처럼 세액이 없는 유형 */
  noVat: boolean;
};

export type LedgerDetailMonth = {
  yearMonth: string;
  saleCount: number;
  saleSupply: number;
  saleVat: number;
  saleTotal: number;
  buyCount: number;
  buySupply: number;
  buyVat: number;
  buyTotal: number;
  purchasingRate: number | null;
  sale: LedgerCategory[];
  buy: LedgerCategory[];
  collectedAt: string;
};

const SALE_CATS: { key: string; label: string; short: string; noVat?: boolean }[] = [
  { key: "ELEC_TAX", label: "전자세금계산서", short: "전자세계" },
  { key: "PER_TAX", label: "종이세금계산서", short: "종이세계" },
  { key: "ELEC_BILL", label: "전자계산서(면세)", short: "전자계산서", noVat: true },
  { key: "PER_BILL", label: "종이계산서(면세)", short: "종이계산서", noVat: true },
  { key: "CARD_ZERO", label: "신용카드·제로페이", short: "카드" },
  { key: "CASH_REPT", label: "현금영수증", short: "현금영수증" },
  { key: "ONLINE", label: "온라인(PG)", short: "온라인" },
  { key: "ETC", label: "기타", short: "기타" },
  { key: "ZRATE_TAX", label: "영세율 세금계산서", short: "영세율 세계", noVat: true },
  { key: "ZRATE_EXPERF", label: "영세율 수출실적", short: "수출", noVat: true },
  { key: "ZRATE_ETC", label: "영세율 기타", short: "영세율 기타", noVat: true },
];
const BUY_CATS: { key: string; label: string; short: string; noVat?: boolean }[] = [
  { key: "ELEC_TAX", label: "전자세금계산서", short: "전자세계" },
  { key: "PER_TAX", label: "종이세금계산서", short: "종이세계" },
  { key: "ELEC_BILL", label: "전자계산서(면세)", short: "전자계산서", noVat: true },
  { key: "PER_BILL", label: "종이계산서(면세)", short: "종이계산서", noVat: true },
  { key: "CARD", label: "신용카드", short: "카드" },
  { key: "CASH_REPT", label: "현금영수증", short: "현금영수증" },
  { key: "ETC", label: "기타", short: "기타" },
  { key: "BUY_SUBTR", label: "매입차감", short: "매입차감" },
];

function numOf(d: Record<string, unknown>, k: string): number {
  const v = d[k];
  if (v == null || v === "" || v === "-") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function parseLedgerDetail(detailJson: string | null | undefined): { sale: LedgerCategory[]; buy: LedgerCategory[] } {
  let d: Record<string, unknown> = {};
  try { d = detailJson ? (JSON.parse(detailJson) as Record<string, unknown>) : {}; } catch { d = {}; }
  const build = (prefix: "S" | "B", cats: typeof SALE_CATS): LedgerCategory[] =>
    cats.map(c => {
      const base = `${prefix}_${c.key}`;
      const count = numOf(d, `${base}_TRSC_CNT`);
      const supply = numOf(d, `${base}_SPLY_AMT`);
      const vat = c.noVat ? 0 : numOf(d, `${base}_VAT_AMT`);
      const totalRaw = c.noVat ? 0 : numOf(d, `${base}_TOTL_AMT`);
      return { key: c.key, label: c.label, short: c.short, count, supply, vat, total: totalRaw || supply + vat, noVat: !!c.noVat };
    });
  return { sale: build("S", SALE_CATS), buy: build("B", BUY_CATS) };
}
