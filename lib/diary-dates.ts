// 다이어리 날짜 계산 (서버/클라이언트 공용, 타임존 영향 없이 문자열 기반)

export type DiaryView = "week" | "month";

export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

// 월요일 시작 주의 첫날
export function weekStart(key: string): string {
  const d = fromKey(key);
  const dow = d.getDay(); // 0=일
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toKey(d);
}

export function monthStart(key: string): string {
  return key.slice(0, 7) + "-01";
}

export function monthEnd(key: string): string {
  const d = fromKey(key);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toKey(last);
}

// 뷰에 따라 실제로 그릴 날짜 범위 (월간은 앞뒤 빈칸까지 포함한 6주 그리드)
export function visibleRange(view: DiaryView, anchor: string): { from: string; to: string; days: string[] } {
  let from: string;
  let to: string;
  if (view === "week") {
    from = weekStart(anchor);
    to = addDays(from, 6);
  } else {
    from = weekStart(monthStart(anchor));
    const lastWeekStart = weekStart(monthEnd(anchor));
    to = addDays(lastWeekStart, 6);
  }
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return { from, to, days };
}

// "2026년 10월 2주" / "2026년 10월"
export function rangeLabel(view: DiaryView, anchor: string): string {
  const d = fromKey(anchor);
  if (view === "month") return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  const ws = fromKey(weekStart(anchor));
  // 그 주 목요일이 속한 달의 몇째 주인지 (ISO 방식: 목요일이 든 주가 그 달의 주)
  const thu = new Date(ws);
  thu.setDate(ws.getDate() + 3);
  const firstThu = new Date(thu.getFullYear(), thu.getMonth(), 1);
  while (firstThu.getDay() !== 4) firstThu.setDate(firstThu.getDate() + 1);
  const week1Start = fromKey(weekStart(toKey(firstThu)));
  const weekNo = Math.round((ws.getTime() - week1Start.getTime()) / (7 * 86400000)) + 1;
  return `${thu.getFullYear()}년 ${thu.getMonth() + 1}월 ${weekNo}주`;
}

export function shortDateLabel(key: string): string {
  const d = fromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_KO[d.getDay()]})`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}
