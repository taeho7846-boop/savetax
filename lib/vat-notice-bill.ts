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

/**
 * 대표님께 보낼 예정고지 납부서 안내문.
 * 2기 예정: 상반기 기준 / 1기 예정: 전년 하반기 기준. 확정신고 시기는 2기→익년 1월, 1기→당해 7월.
 */
export function buildNoticeBillMessage(period: string, bill: Pick<NoticeBill, "amount" | "dueDate">): string {
  const { year, gi } = parsePeriod(period);
  const half = gi === 2 ? "상반기" : `${year - 1}년 하반기`;
  const confirmWhen = gi === 2 ? `${year + 1}년 1월 중` : `${year}년 7월 중`;
  return [
    "대표님 안녕하세요",
    `${year}년 ${gi}기 부가가치세 예정고지세액 납부서 전달드립니다.`,
    "",
    `해당 금액은 (${half} 부가가치세 납부액 - ${half} 예정고지세액) 의 1/2 입니다.`,
    "",
    `위 금액은 추후 ${year}년 ${gi}기 부가가치세 확정신고(${confirmWhen}) 시 기납부세액으로 차감됩니다.`,
    "",
    "금액 및 납부기한은 아래와 같습니다.",
    "",
    "확인 부탁드리겠습니다.",
    "",
    `납부기한 : ${formatKoreanDate(bill.dueDate)}`,
    `납부금액 : ${bill.amount.toLocaleString("ko-KR")}원`,
  ].join("\n");
}

/** 다운로드 시 저장될 파일명 */
export function noticeBillFileName(clientName: string, period: string): string {
  const { year, gi } = parsePeriod(period);
  const safe = clientName.replace(/[\\/:*?"<>|]/g, "_");
  return `${safe}_${year}년${gi}기예정_부가가치세_예정고지납부서.pdf`;
}
