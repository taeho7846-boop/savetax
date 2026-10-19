// 월기장 관리 공통 — 단계 정의, 마감 기한 계산 (순수 로직, DB 의존 없음)

export type BookkeepingStage = "none" | "input" | "booked" | "reviewed" | "done";

export const STAGES: { key: BookkeepingStage; label: string; short: string; desc: string }[] = [
  { key: "none", label: "미시작", short: "·", desc: "아직 기장 시작 전" },
  { key: "input", label: "기장입력 중", short: "입력중", desc: "전표 입력 진행 중" },
  { key: "booked", label: "기장완료", short: "기장", desc: "전표 입력 끝 · 세모리포트 검토 대기" },
  { key: "reviewed", label: "세모리포트 검토완료", short: "검토", desc: "세모리포트 내용 검토 끝 · 발송 대기" },
  { key: "done", label: "세모리포트 완료", short: "완료", desc: "세모리포트 발송 완료 (월기장 마감)" },
];

export const STAGE_ORDER: BookkeepingStage[] = STAGES.map(s => s.key);

export function nextStage(s: BookkeepingStage): BookkeepingStage {
  const i = STAGE_ORDER.indexOf(s);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}
export function prevStage(s: BookkeepingStage): BookkeepingStage {
  const i = STAGE_ORDER.indexOf(s);
  return STAGE_ORDER[Math.max(i - 1, 0)];
}
export function stageIndex(s: string): number {
  const i = STAGE_ORDER.indexOf(s as BookkeepingStage);
  return i < 0 ? 0 : i;
}

// 홈택스 자료가 매월 15~17일에 열리므로 기본 마감 목표는 24일
export const DEFAULT_TARGET_DAY = 24;
export const TARGET_DAY_KEY = "bookkeepingTargetDay";

/** "YYYY-MM" + n개월 */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * 기장 대상 월(yearMonth)의 마감 기한 — 다음 달 targetDay일 (말일 초과 시 말일).
 * 예) 2026-09분, 목표일 15 → 2026-10-15
 */
export function bookkeepingDeadline(yearMonth: string, targetDay: number): string {
  const next = addMonths(yearMonth, 1);
  const [y, m] = next.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(1, targetDay), lastDay);
  return `${next}-${String(d).padStart(2, "0")}`;
}

/** 오늘(YYYY-MM-DD) 기준 지연 여부 — 마감 안 됐고 기한 지남 */
export function isOverdue(yearMonth: string, stage: string, targetDay: number, today: string): boolean {
  if (stage === "done") return false;
  return today > bookkeepingDeadline(yearMonth, targetDay);
}

/** 기한까지 남은 일수 (음수면 지남) */
export function daysUntilDeadline(yearMonth: string, targetDay: number, today: string): number {
  const d = bookkeepingDeadline(yearMonth, targetDay);
  const a = new Date(d + "T00:00:00").getTime();
  const b = new Date(today + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
}

/** KST 기준 오늘 "YYYY-MM-DD" */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
