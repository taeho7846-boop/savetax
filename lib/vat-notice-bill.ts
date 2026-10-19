/**
 * 부가세 예정고지 납부서(홈택스 일괄다운로드 PDF) — 메타 타입, 안내문 생성, 저장 경로.
 * 서버 전용 파싱(pdfjs)은 vat-notice-bill-parse.ts 에 있음 (클라이언트 번들에 pdfjs가 섞이지 않도록 분리).
 */

/** VatRecord.noticeBill JSON */
export type NoticeBill = {
  v: 1;
  /** 다운로드 경로 (/api/uploads/vat-bills/<periodSlug>/<clientId>.pdf) */
  url: string;
  /** 납부금액(원) — 납부서의 '계' */
  amount: number;
  /** 납부기한 YYYY-MM-DD */
  dueDate: string;
  /** 업로드한 원본 파일명 */
  srcName: string;
  /** 업로드 시각 ISO */
  uploadedAt: string;
};

export function parseNoticeBill(json: string | null | undefined): NoticeBill | null {
  if (!json) return null;
  try {
    const b = JSON.parse(json) as NoticeBill;
    return b && typeof b.amount === "number" && typeof b.dueDate === "string" && typeof b.url === "string" ? b : null;
  } catch { return null; }
}

/** "2026-2-예정" → 저장 폴더명 "2026-2-pre" (URL·파일시스템 안전) */
export function periodSlug(period: string): string {
  return period.replace("예정", "pre").replace("확정", "final");
}

/** "2026-2-예정" → { year: 2026, gi: 2 } */
export function parsePeriod(period: string): { year: number; gi: 1 | 2 } {
  const [y, g] = period.split("-");
  return { year: parseInt(y, 10), gi: g === "1" ? 1 : 2 };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatKoreanDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  return `${y}년 ${pad2(m)}월 ${pad2(d)}일`;
}

/* ───────────── 안내문 템플릿 (상단 · 고정 중단 · 하단) ───────────── */

/** AppConfig 키 — 사무실 공통 안내문 */
export const NOTICE_BILL_TEMPLATE_KEY = "vatNoticeBillMessage";

export type NoticeBillTemplate = { top: string; bottom: string };

/** 상단·하단에 쓸 수 있는 치환 문구 */
export const NOTICE_BILL_PLACEHOLDERS: { key: string; desc: string }[] = [
  { key: "{연도}", desc: "2026" },
  { key: "{기수}", desc: "1 또는 2" },
  { key: "{반기}", desc: "2기=상반기 / 1기=전년 하반기" },
  { key: "{확정신고시기}", desc: "2기=익년 1월 중 / 1기=당해 7월 중" },
  { key: "{상호}", desc: "거래처명" },
  { key: "{대표자}", desc: "대표자명" },
];

export const DEFAULT_NOTICE_BILL_TEMPLATE: NoticeBillTemplate = {
  top: [
    "대표님 안녕하세요",
    "{연도}년 {기수}기 부가가치세 예정고지세액 납부서 전달드립니다.",
    "",
    "해당 금액은 ({반기} 부가가치세 납부액 - {반기} 예정고지세액) 의 1/2 입니다.",
    "",
    "위 금액은 추후 {연도}년 {기수}기 부가가치세 확정신고({확정신고시기}) 시 기납부세액으로 차감됩니다.",
    "",
    "금액 및 납부기한은 아래와 같습니다.",
    "",
    "확인 부탁드리겠습니다.",
  ].join("\n"),
  bottom: "",
};

export function parseNoticeBillTemplate(json: string | null | undefined): NoticeBillTemplate {
  if (!json) return DEFAULT_NOTICE_BILL_TEMPLATE;
  try {
    const t = JSON.parse(json) as Partial<NoticeBillTemplate>;
    return { top: typeof t.top === "string" ? t.top : DEFAULT_NOTICE_BILL_TEMPLATE.top, bottom: typeof t.bottom === "string" ? t.bottom : "" };
  } catch { return DEFAULT_NOTICE_BILL_TEMPLATE; }
}

export type NoticeBillMessageCtx = {
  period: string;
  bill: Pick<NoticeBill, "amount" | "dueDate">;
  clientName?: string;
  ceoName?: string | null;
};

/** 고정 중단: 납부기한 · 납부금액 */
export function noticeBillMiddle(bill: Pick<NoticeBill, "amount" | "dueDate">): string {
  return `납부기한 : ${formatKoreanDate(bill.dueDate)}\n납부금액 : ${bill.amount.toLocaleString("ko-KR")}원`;
}

function fillPlaceholders(text: string, ctx: NoticeBillMessageCtx): string {
  const { year, gi } = parsePeriod(ctx.period);
  const half = gi === 2 ? "상반기" : `${year - 1}년 하반기`;
  const confirmWhen = gi === 2 ? `${year + 1}년 1월 중` : `${year}년 7월 중`;
  return text
    .replace(/\{연도\}/g, String(year))
    .replace(/\{기수\}/g, String(gi))
    .replace(/\{반기\}/g, half)
    .replace(/\{확정신고시기\}/g, confirmWhen)
    .replace(/\{상호\}/g, ctx.clientName ?? "")
    .replace(/\{대표자\}/g, ctx.ceoName ?? "");
}

/**
 * 대표님께 보낼 예정고지 납부서 안내문 = 상단(편집) + 고정 중단(납부기한·납부금액) + 하단(편집).
 * 템플릿을 안 주면 기본 문구.
 */
export function buildNoticeBillMessage(ctx: NoticeBillMessageCtx, tpl: NoticeBillTemplate = DEFAULT_NOTICE_BILL_TEMPLATE): string {
  const top = fillPlaceholders(tpl.top, ctx).trim();
  const bottom = fillPlaceholders(tpl.bottom, ctx).trim();
  return [top, noticeBillMiddle(ctx.bill), bottom].filter((s) => s.length > 0).join("\n\n");
}

/** 다운로드 시 저장될 파일명 */
export function noticeBillFileName(clientName: string, period: string): string {
  const { year, gi } = parsePeriod(period);
  const safe = clientName.replace(/[\\/:*?"<>|]/g, "_");
  return `${safe}_${year}년${gi}기예정_부가가치세_예정고지납부서.pdf`;
}
