"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CalendarIcon } from "@/components/icons";
import { fromKey, WEEKDAY_KO, visibleRange } from "@/lib/diary-dates";
import { chunkWeeks, layoutWeek, type LaneInput } from "@/lib/calendar-lanes";

type Item = {
  key: string;
  date: string;
  endDate?: string | null;
  title: string;
  kind: "office" | "personal" | "tax" | "task";
  who?: string | null;
  time?: string | null;
  done?: boolean;
};

const KIND_CLS: Record<Item["kind"], string> = {
  office: "bg-[#EEEDFE] text-[#3C3489]",
  personal: "bg-[#E7F7EE] text-[#15803D]",
  tax: "bg-[#FEF2F2] text-[#B91C1C]",
  task: "bg-[#FEF3C7] text-[#92400E]",
};
const DONE_CLS = "bg-[#F2F4F6] text-[#8B95A1] line-through";

const STORAGE_KEY = "savetax-month-schedule-open";
const CHANGE_EVENT = "savetax-month-schedule-toggle";

// 펼침 상태는 브라우저별로 기억 (localStorage) — SSR에서는 항상 접힘
function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readOpen() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

export function MonthScheduleCard({ items, today }: { items: Item[]; today: string }) {
  const open = useSyncExternalStore(subscribe, readOpen, () => false);

  function toggle() {
    try { localStorage.setItem(STORAGE_KEY, open ? "0" : "1"); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const ym = today.slice(0, 7);
  const m = Number(ym.slice(5, 7));
  const { days } = visibleRange("month", today);
  const weeks = chunkWeeks(days);
  const ORDER: Record<Item["kind"], number> = { tax: 0, office: 1, personal: 2, task: 3 };
  const laneItems: (LaneInput & Item)[] = items.map(i => ({ ...i, order: ORDER[i.kind] }));

  // 접힌 상태 요약: 오늘 이후 가까운 일정 3건
  const upcoming = items
    .filter(i => !i.done)
    .filter(i => i.date >= today || (i.endDate && i.endDate >= today))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);


  return (
    <div className="glass rounded-3xl p-5">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-3 text-left group">
        <div className="w-9 h-9 rounded-xl gradient-purple flex items-center justify-center text-white shrink-0">
          <CalendarIcon width={18} height={18} strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight text-[#191F28]">{m}월 일정 · 할 일</h2>
            <span className="text-[11px] text-[#8B95A1] font-medium">{items.length}건</span>
          </div>
          {!open && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {upcoming.length === 0 && <span className="text-[11.5px] text-[#8B95A1]">이달 남은 일정이 없어요</span>}
              {upcoming.map(i => (
                <span key={i.key} className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium truncate max-w-[220px] ${i.done ? DONE_CLS : KIND_CLS[i.kind]}`}>
                  {i.date.slice(8)}일 · {i.title}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`text-[#8B95A1] group-hover:text-[#191F28] transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>

      {open && (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {[1, 2, 3, 4, 5, 6, 0].map(dow => (
              <div key={dow} className={`text-center text-[10.5px] font-bold py-0.5 ${dow === 0 ? "text-[#E02E2E]" : dow === 6 ? "text-[#3182F6]" : "text-[#8B95A1]"}`}>
                {WEEKDAY_KO[dow]}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => {
            const { segs, lanes } = layoutWeek(week, laneItems);
            const minHeight = Math.max(112, 32 + lanes * 21 + 8);
            return (
              <div key={wi} className="relative grid grid-cols-7 gap-1 mb-1" style={{ minHeight }}>
                {week.map(date => {
                  const d = fromKey(date);
                  const inMonth = date.slice(0, 7) === ym;
                  const isToday = date === today;
                  const dow = d.getDay();
                  return (
                    <Link
                      key={date}
                      href={`/diary?view=month&d=${date}`}
                      className={`rounded-lg border border-[#F2F4F6] p-1.5 hover:bg-white transition-colors ${inMonth ? "bg-white/60" : "bg-white/20 opacity-40"}`}
                    >
                      <span className={`text-[10.5px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? "bg-[#3182F6] text-white" : dow === 0 ? "text-[#E02E2E]" : dow === 6 ? "text-[#3182F6]" : "text-[#4E5968]"
                      }`}>
                        {d.getDate()}
                      </span>
                    </Link>
                  );
                })}
                <div className="absolute inset-x-0 grid grid-cols-7 gap-x-1 pointer-events-none" style={{ top: 32, gridAutoRows: "18px", rowGap: "3px" }}>
                  {segs.map(seg => {
                    const i = seg.item;
                    const span = seg.end - seg.start + 1;
                    const edge = `${seg.isStart ? "ml-1.5 rounded-l" : "ml-0 rounded-l-none"} ${seg.isEnd ? "mr-1.5 rounded-r" : "mr-0 rounded-r-none"}`;
                    return (
                      <SegmentPill
                        key={i.key}
                        item={i}
                        label={seg.isStart ? i.title : `← ${i.title}`}
                        alignRight={seg.start >= 4}
                        style={{ gridColumn: `${seg.start + 1} / span ${span}`, gridRow: seg.lane + 1 }}
                        className={`${edge} ${i.done ? DONE_CLS : KIND_CLS[i.kind]}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEEDFE] text-[#3C3489]">사무실</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E7F7EE] text-[#15803D]">개인</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#B91C1C]">세무 마감</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">할 일</span>
            </div>
            <Link href={`/diary?view=month&d=${today}`} className="text-[11.5px] text-[#3182F6] font-semibold hover:underline">
              다이어리에서 보기 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// 달력 일정 막대. 글자가 잘린 경우에만 마우스를 올리면 전체 내용을 툴팁으로 보여준다.
function SegmentPill({
  item, label, alignRight, style, className,
}: {
  item: Item;
  label: string;
  alignRight: boolean;
  style: React.CSSProperties;
  className: string;
}) {
  const [show, setShow] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  function onEnter() {
    const el = textRef.current;
    if (el && el.scrollWidth > el.clientWidth + 1) setShow(true);
  }

  const range = item.endDate && item.endDate !== item.date
    ? `${item.date.slice(5).replace("-", "/")} ~ ${item.endDate.slice(5).replace("-", "/")}`
    : item.date.slice(5).replace("-", "/");
  const meta = [range, item.time, item.who].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/diary?view=month&d=${item.date}`}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={() => setShow(false)}
      onFocus={onEnter}
      onBlur={() => setShow(false)}
      className={`relative pointer-events-auto block text-[11px] px-1.5 leading-[18px] hover:brightness-95 transition ${className}`}
    >
      <span ref={textRef} className="block truncate">{label}</span>
      {show && (
        <span
          role="tooltip"
          className={`absolute bottom-full mb-1.5 z-50 w-max max-w-[280px] rounded-xl bg-[#191F28] text-white px-3 py-2 shadow-lg whitespace-normal break-words leading-snug no-underline pointer-events-none animate-[fadeIn_120ms_ease-out] ${alignRight ? "right-0" : "left-0"}`}
        >
          <span className="block text-[12px] font-semibold">{item.title}</span>
          {meta && <span className="block text-[11px] text-white/70 mt-0.5">{meta}</span>}
          <span className={`absolute top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-[#191F28] ${alignRight ? "right-3" : "left-3"}`} />
        </span>
      )}
    </Link>
  );
}
