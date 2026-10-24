// AI자동기장 — 화면(클라이언트)과 서버가 같이 쓰는 값. DB·crypto 없이 순수 값만 둔다 (서버 전용은 lib/autobook.ts)

// 처리 순서 고정 (자동기장 CLAUDE.md 0장): 수집 → 매출 세금계산서 → 매입 세금계산서 → 매입 계산서 → 카드 → 현금영수증 → 보고서
export const STEPS = [
  { key: "collect", label: "수집" },
  { key: "taxSale", label: "매출 세금계산서" },
  { key: "taxBuy", label: "매입 세금계산서" },
  { key: "invoiceBuy", label: "매입 계산서" },
  { key: "card", label: "카드" },
  { key: "cashBuy", label: "현금영수증" },
  { key: "report", label: "보고서" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export type StepState = "ok" | "run" | "stop" | "skip";

export const JOB_STATUS = ["queued", "collected", "running", "done", "stopped", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];
export const ACTIVE_STATUS: JobStatus[] = ["queued", "collected", "running"];

// 보고서 PDF 저장 위치: 거래처 구글드라이브 폴더 / AI자동기장 / 연도
export const REPORT_FOLDER = "AI자동기장";

export const ALERT_KINDS: Record<string, string> = {
  duplicate: "중복전표",
  fixedAsset: "고정자산 후보",
  unclearBig: "불분명 100만원 이상",
  cardRegister: "카드 등록 필요",
  other: "확인 필요",
};

// 실행 시간표. 홈택스 자료수집은 00:00~06:00 불가(고정) → 그 시간엔 수집이 끝난 거래처 처리만.
// 평일 근무시간엔 안 돌림(같은 위하고 아이디 동시 접속 끊김 방지). 주말·공휴일은 00~06 외 종일. (2026-10-24 대표님 확정)
export type Schedule = { workFrom: string; workTo: string; collectStop: string };
export const DEFAULT_SCHEDULE: Schedule = { workFrom: "08:30", workTo: "18:30", collectStop: "23:30" };
export function parseSchedule(json: string | null | undefined): Schedule {
  try { return { ...DEFAULT_SCHEDULE, ...(JSON.parse(json || "{}") as Partial<Schedule>) }; } catch { return DEFAULT_SCHEDULE; }
}

// 과세기간 시작: 1~6월에 돌리면 1기(01-01), 7~12월이면 2기(07-01)
export function periodFromFor(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return m <= 6 ? `${y}-01-01` : `${y}-07-01`;
}

// 실행기가 몇 분 안에 신호를 보냈으면 '연결됨'
export const AGENT_ONLINE_MS = 60 * 1000; // 실행기는 15초마다 신호 → 1분 넘게 없으면 꺼짐(5분이면 꺼진 뒤에도 한참 '켜짐'으로 보였음)
