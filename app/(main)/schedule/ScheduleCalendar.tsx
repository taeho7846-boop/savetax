"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSchedule, updateSchedule, deleteSchedule } from "@/app/actions/schedule";
import { getTaxEventsForMonth, type TaxEvent } from "@/lib/tax-calendar";

type Schedule = {
  id: number;
  userId: number;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string;
  notes: string | null;
  user: { id: number; name: string };
};

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  blue:   { bg: "bg-[#E8F3FF]",   text: "text-[#1B64DA]",   dot: "bg-[#3182F6]"   },
  red:    { bg: "bg-[#FEF2F2]",    text: "text-[#B91C1C]",    dot: "bg-[#E02E2E]"    },
  green:  { bg: "bg-[#E7F7EE]",  text: "text-[#15803D]",  dot: "bg-[#1AB266]"  },
  purple: { bg: "bg-[#E8F3FF]", text: "text-[#1B64DA]", dot: "bg-[#3182F6]" },
  orange: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", dot: "bg-[#F59E0B]" },
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getDaysInMonth(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);
  return days;
}

export function ScheduleCalendar({
  schedules,
  yearMonth,
  currentUserId,
}: {
  schedules: Schedule[];
  yearMonth: string;
  currentUserId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 구글 캘린더 동기화 (페이지 로드 시)
  useEffect(() => {
    fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.synced > 0) router.refresh();
      })
      .catch(() => {});
  }, [yearMonth]);

  const [year, month] = yearMonth.split("-").map(Number);
  const days = getDaysInMonth(year, month);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const taxEvents = getTaxEventsForMonth(month);
  const coreTaxEvents = taxEvents.filter(e => e.priority === "core");
  const optionalTaxEvents = taxEvents.filter(e => e.priority === "optional");

  function getTaxEventsForDay(day: number): TaxEvent[] {
    return coreTaxEvents.filter(e => e.day === day);
  }

  function handleMonthChange(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/schedule?ym=${ym}`);
  }

  function getDateStr(day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getSchedulesForDay(day: number) {
    const dateStr = getDateStr(day);
    return schedules.filter(s => {
      if (s.endDate) {
        // 여러 날 일정: 시작일~종료일 범위에 포함
        return dateStr >= s.date && dateStr <= s.endDate;
      }
      return s.date === dateStr;
    });
  }

  // 여러 날 일정이 해당 날짜에서 몇 칸을 차지하는지 계산
  function getMultiDaySpan(s: Schedule, day: number): { isStart: boolean; isEnd: boolean; span: number } | null {
    if (!s.endDate) return null;
    const dateStr = getDateStr(day);
    if (dateStr < s.date || dateStr > s.endDate) return null;

    const isStart = dateStr === s.date;
    const isEnd = dateStr === s.endDate;
    const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0=일

    // 해당 행(주)에서 남은 칸 수 계산
    const remainInWeek = 7 - dayOfWeek;
    const endD = new Date(s.endDate);
    const curD = new Date(dateStr);
    const remainDays = Math.floor((endD.getTime() - curD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const span = Math.min(remainInWeek, remainDays);

    // 주의 첫 날이거나 일정 시작일일 때만 바를 렌더링
    const shouldRender = isStart || dayOfWeek === 0;

    return shouldRender ? { isStart, isEnd: dateStr === s.endDate || dayOfWeek + span >= 7 ? false : isEnd, span } : null;
  }

  function handleDayClick(day: number) {
    const dateStr = getDateStr(day);
    setSelectedDate(dateStr);
    setEditSchedule(null);
    setShowForm(true);
    setError("");
  }

  async function handleCreate(formData: FormData) {
    setError("");
    try {
      startTransition(async () => {
        await createSchedule(formData);
        setShowForm(false);
        setSelectedDate(null);
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleUpdate(formData: FormData) {
    if (!editSchedule) return;
    setError("");
    try {
      startTransition(async () => {
        await updateSchedule(editSchedule.id, formData);
        setEditSchedule(null);
        setShowForm(false);
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      await deleteSchedule(id);
      setEditSchedule(null);
      setShowForm(false);
    });
  }

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">{year}년 {month}월</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">스케쥴</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
            <button onClick={() => handleMonthChange(-1)} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</button>
            <span className="text-[13px] font-bold text-[#191F28] min-w-[90px] text-center">{year}년 {month}월</span>
            <button onClick={() => handleMonthChange(1)} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</button>
          </div>
          <button
            onClick={() => { setSelectedDate(todayStr); setEditSchedule(null); setShowForm(true); setError(""); }}
            className="bg-[#3182F6] text-white text-[13px] font-bold px-5 h-10 rounded-2xl hover:bg-[#1B64DA] shadow-md shadow-[#3182F6]/20"
          >
            + 일정
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* 캘린더 */}
        <div className="flex-1 glass rounded-2xl p-4 overflow-auto">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-center text-xs font-medium py-2 ${i === 0 ? "text-[#E02E2E]" : i === 6 ? "text-[#3182F6]" : "text-[#6B7684]"}`}>
                {w}
              </div>
            ))}
            {days.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="min-h-[160px]" />;
              const dateStr = getDateStr(day);
              const daySchedules = getSchedulesForDay(day);
              const dayTaxEvents = getTaxEventsForDay(day);
              const isToday = dateStr === todayStr;
              const dayOfWeek = new Date(year, month - 1, day).getDay();
              const totalItems = dayTaxEvents.length + daySchedules.length;

              return (
                <div
                  key={day}
                  className={`min-h-[160px] border border-[#F2F4F6] rounded p-1 cursor-pointer hover:bg-[#F5F9FF]/50 transition-colors ${isToday ? "bg-[#F5F9FF] border-blue-300" : ""}`}
                  onClick={() => handleDayClick(day)}
                >
                  <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-[#3182F6] font-bold" : dayOfWeek === 0 ? "text-[#E02E2E]" : dayOfWeek === 6 ? "text-[#3182F6]" : "text-[#333D4B]"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {/* 여러 날 일정 - 바가 이어져 보이도록 */}
                    {daySchedules.filter(s => s.endDate).map(s => {
                      const c = COLOR_MAP[s.color] ?? COLOR_MAP.blue;
                      const isStart = dateStr === s.date;
                      const isEnd = dateStr === s.endDate;
                      const isWeekStart = dayOfWeek === 0;
                      const isWeekEnd = dayOfWeek === 6;
                      // 바 모서리: 시작일 또는 주 시작이면 왼쪽 둥글게, 종료일 또는 주 마지막이면 오른쪽 둥글게
                      const roundLeft = isStart || isWeekStart;
                      const roundRight = isEnd || isWeekEnd;
                      return (
                        <div
                          key={`multi-${s.id}`}
                          className={`${c.bg} ${c.text} text-[10px] py-0.5 truncate cursor-pointer -mx-1 px-1.5 ${
                            roundLeft && roundRight ? "rounded mx-0" : roundLeft ? "rounded-l ml-0 -mr-1" : roundRight ? "rounded-r -ml-1 mr-0" : "-ml-1 -mr-1"
                          }`}
                          onClick={(e) => { e.stopPropagation(); setEditSchedule(s); setShowForm(true); setError(""); }}
                          title={`${s.user.name}: ${s.title} (${s.date} ~ ${s.endDate})`}
                        >
                          {(isStart || isWeekStart) ? s.title : "\u00A0"}
                        </div>
                      );
                    })}
                    {/* 세무 일정 */}
                    {dayTaxEvents.slice(0, 5).map((te, i) => (
                      <div
                        key={`tax-${i}`}
                        className="bg-[#FEF2F2] text-[#DC2626] text-[10px] px-1 py-0.5 rounded truncate"
                        title={`${te.title} - ${te.desc}`}
                      >
                        {te.title}
                      </div>
                    ))}
                    {/* 단일 일정 */}
                    {daySchedules.filter(s => !s.endDate).slice(0, Math.max(1, 5 - dayTaxEvents.length)).map(s => {
                      const c = COLOR_MAP[s.color] ?? COLOR_MAP.blue;
                      return (
                        <div
                          key={s.id}
                          className={`${c.bg} ${c.text} text-[10px] px-1 py-0.5 rounded truncate cursor-pointer`}
                          onClick={(e) => { e.stopPropagation(); setEditSchedule(s); setShowForm(true); setError(""); }}
                          title={`${s.user.name}: ${s.title}`}
                        >
                          {s.startTime ? `${s.startTime} ` : ""}{s.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 일정 추가/수정 폼 */}
        {showForm && (
          <div className="w-72 bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-5 shrink-0 self-start">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#191F28] text-sm">
                {editSchedule ? "일정 수정" : "일정 추가"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditSchedule(null); }} className="text-[#8B95A1] hover:text-[#4E5968] text-lg">✕</button>
            </div>

            {error && <div className="text-xs text-[#E02E2E] mb-3">{error}</div>}

            <form action={editSchedule ? handleUpdate : handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">제목</label>
                <input name="title" required defaultValue={editSchedule?.title ?? ""} placeholder="일정 제목"
                  className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">날짜</label>
                <input name="date" type="date" required defaultValue={editSchedule?.date ?? selectedDate ?? ""}
                  className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">시작</label>
                  <TimeSelect name="startTime" defaultValue={editSchedule?.startTime ?? ""} />
                </div>
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">종료</label>
                  <TimeSelect name="endTime" defaultValue={editSchedule?.endTime ?? ""} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">색상</label>
                <div className="flex gap-2">
                  {Object.entries(COLOR_MAP).map(([key, c]) => (
                    <label key={key} className="cursor-pointer">
                      <input type="radio" name="color" value={key} defaultChecked={(editSchedule?.color ?? "blue") === key} className="sr-only peer" />
                      <div className={`w-6 h-6 rounded-full ${c.dot} peer-checked:ring-2 peer-checked:ring-offset-1 peer-checked:ring-gray-400`} />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">메모</label>
                <textarea name="notes" rows={2} defaultValue={editSchedule?.notes ?? ""} placeholder="메모"
                  className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending}
                  className="flex-1 bg-[#3182F6] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#1B64DA] disabled:opacity-50">
                  {editSchedule ? "수정" : "추가"}
                </button>
                {editSchedule && editSchedule.userId === currentUserId && (
                  <button type="button" onClick={() => handleDelete(editSchedule.id)}
                    className="px-3 py-2 border border-red-300 text-[#E02E2E] rounded-lg text-sm hover:bg-[#FEF2F2]">
                    삭제
                  </button>
                )}
              </div>
            </form>

            {/* 해당 날짜 일정 목록 */}
            {selectedDate && !editSchedule && (() => {
              const dayList = schedules.filter(s => s.date === selectedDate);
              if (dayList.length === 0) return null;
              return (
                <div className="mt-4 pt-3 border-t border-[#F2F4F6]">
                  <div className="text-xs font-medium text-[#6B7684] mb-2">이 날의 일정</div>
                  <div className="space-y-2">
                    {dayList.map(s => {
                      const c = COLOR_MAP[s.color] ?? COLOR_MAP.blue;
                      return (
                        <div
                          key={s.id}
                          className={`${c.bg} ${c.text} rounded-lg px-3 py-2 text-xs cursor-pointer hover:opacity-80`}
                          onClick={() => { setEditSchedule(s); }}
                        >
                          <div className="font-medium">{s.title}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] opacity-70">
                            <span>{s.user.name}</span>
                            {s.startTime && <span>{s.startTime}{s.endTime ? ` ~ ${s.endTime}` : ""}</span>}
                          </div>
                          {s.notes && <div className="mt-1 text-[10px] opacity-60">{s.notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 참고 세무 일정 (해당 거래처만 / 거의 안 쓰는 거) */}
      {optionalTaxEvents.length > 0 && (
        <div className="mt-4 bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-4">
          <h3 className="text-xs font-bold text-[#6B7684] uppercase tracking-wide mb-3">참고 세무 일정 (해당 시에만)</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {optionalTaxEvents.map((te, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs py-1">
                <span className="text-[#8B95A1] font-mono shrink-0">{month}/{te.day}</span>
                <span className="text-[#333D4B]">{te.title}</span>
                <span className="text-[#8B95A1] text-[10px] truncate">{te.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
})();

function TimeSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none"
    >
      <option value="">선택</option>
      {TIME_OPTIONS.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
