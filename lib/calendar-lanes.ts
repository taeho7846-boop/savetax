// 캘린더 "레인" 배치: 여러 날 일정은 주(週) 안에서 끊기지 않는 하나의 막대로, 같은 일정은 같은 줄에
// (구글 캘린더 방식) — 주 단위로 각 항목의 열 범위(start~end)를 구하고 겹치지 않는 가장 위 줄(lane)에 배치

export type LaneInput = {
  key: string;
  date: string;              // YYYY-MM-DD
  endDate?: string | null;   // 여러 날이면 마지막 날
  order: number;             // 같은 조건이면 낮은 순서가 위로 (세무 마감 0, 사무실 1, 개인 2, 할 일 3)
};

export type LaneSeg<T extends LaneInput> = {
  item: T;
  start: number;   // 0~6 (주 안의 열)
  end: number;     // 0~6
  lane: number;    // 0부터
  isStart: boolean; // 이 주에서 일정이 시작하는가 (아니면 지난주에서 이어짐)
  isEnd: boolean;   // 이 주에서 끝나는가 (아니면 다음주로 이어짐)
};

export function chunkWeeks(days: string[]): string[][] {
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function layoutWeek<T extends LaneInput>(weekDays: string[], items: T[]): { segs: LaneSeg<T>[]; lanes: number } {
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  const segs: LaneSeg<T>[] = [];

  for (const item of items) {
    const s = item.date;
    const e = item.endDate && item.endDate > item.date ? item.endDate : item.date;
    if (e < first || s > last) continue;
    const start = weekDays.indexOf(s < first ? first : s);
    const end = weekDays.indexOf(e > last ? last : e);
    if (start < 0 || end < 0) continue;
    segs.push({ item, start, end, lane: -1, isStart: s >= first, isEnd: e <= last });
  }

  // 긴 막대가 위로, 같은 시작이면 order 낮은 것이 위로
  segs.sort((a, b) =>
    (a.start - b.start) ||
    ((b.end - b.start) - (a.end - a.start)) ||
    (a.item.order - b.item.order) ||
    a.item.key.localeCompare(b.item.key)
  );

  const occupied: boolean[][] = [];
  for (const seg of segs) {
    let lane = 0;
    for (;;) {
      if (!occupied[lane]) occupied[lane] = Array(weekDays.length).fill(false);
      let free = true;
      for (let c = seg.start; c <= seg.end; c++) {
        if (occupied[lane][c]) { free = false; break; }
      }
      if (free) {
        for (let c = seg.start; c <= seg.end; c++) occupied[lane][c] = true;
        seg.lane = lane;
        break;
      }
      lane++;
    }
  }

  return { segs, lanes: occupied.length };
}
