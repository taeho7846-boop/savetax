"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CalendarIcon } from "@/components/icons";
import { fromKey, WEEKDAY_KO, visibleRange } from "@/lib/diary-dates";

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

  // 접힌 상태 요약: 오늘 이후 가까운 일정 3건
  const upcoming = items
    .filter(i => !i.done)
    .filter(i => i.date >= today || (i.endDate && i.endDate >= today))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  function itemsOn(date: string) {
    return items.filter(i => (i.endDate ? date >= i.date && date <= i.endDate : i.date === date));
  }

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
          <div className="grid grid-cols-7 gap-1">
            {days.map(date => {
              const d = fromKey(date);
              const inMonth = date.slice(0, 7) === ym;
              const isToday = date === today;
              const dayItems = itemsOn(date);
              const dow = d.getDay();
              return (
                <Link
                  key={date}
                  href={`/diary?view=week&d=${date}`}
                  className={`rounded-lg border border-[#F2F4F6] p-1 min-h-[64px] flex flex-col gap-0.5 hover:bg-white transition-colors ${
                    inMonth ? "bg-white/60" : "bg-white/20 opacity-40"
                  }`}
                >
                  <span className={`text-[10.5px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-[#3182F6] text-white" : dow === 0 ? "text-[#E02E2E]" : dow === 6 ? "text-[#3182F6]" : "text-[#4E5968]"
                  }`}>
                    {d.getDate()}
                  </span>
                  {dayItems.slice(0, 2).map(i => (
                    <span key={i.key} className={`text-[9.5px] px-1 py-px rounded truncate leading-[1.4] ${i.done ? DONE_CLS : KIND_CLS[i.kind]}`} title={`${i.who ? i.who + ": " : ""}${i.title}`}>
                      {i.title}
                    </span>
                  ))}
                  {dayItems.length > 2 && <span className="text-[9.5px] text-[#8B95A1] pl-0.5">+{dayItems.length - 2}</span>}
                </Link>
              );
            })}
          </div>
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
