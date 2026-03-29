"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSchedule, updateSchedule, deleteSchedule } from "@/app/actions/schedule";
import { getTaxEventsForMonth, type TaxEvent } from "@/lib/tax-calendar";

type Schedule = {
  id: number;
  userId: number;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  color: string;
  notes: string | null;
  user: { id: number; name: string };
};

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  blue:   { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"   },
  red:    { bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500"    },
  green:  { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500"  },
  purple: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
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
    return schedules.filter(s => s.date === dateStr);
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
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">스케쥴</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedDate(todayStr); setEditSchedule(null); setShowForm(true); setError(""); }}
            className="bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
          >
            + 일정 추가
          </button>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button onClick={() => handleMonthChange(-1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">◀</button>
            <span className="text-sm font-medium text-gray-800 min-w-[100px] text-center">{year}년 {month}월</span>
            <button onClick={() => handleMonthChange(1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">▶</button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* 캘린더 */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 p-4 overflow-auto">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-center text-xs font-medium py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>
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
                  className={`min-h-[160px] border border-gray-100 rounded p-1 cursor-pointer hover:bg-blue-50/50 transition-colors ${isToday ? "bg-blue-50 border-blue-300" : ""}`}
                  onClick={() => handleDayClick(day)}
                >
                  <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-blue-600 font-bold" : dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : "text-gray-700"}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {/* 세무 일정 (핵심) */}
                    {dayTaxEvents.slice(0, 5).map((te, i) => (
                      <div
                        key={`tax-${i}`}
                        className="bg-red-50 text-red-600 text-[10px] px-1 py-0.5 rounded truncate"
                        title={`${te.title} - ${te.desc}`}
                      >
                        {te.title}
                      </div>
                    ))}
                    {dayTaxEvents.length > 5 && (
                      <div className="text-[10px] text-red-400 pl-1">+{dayTaxEvents.length - 5}개 세무</div>
                    )}
                    {/* 개인 일정 */}
                    {daySchedules.slice(0, Math.max(1, 5 - dayTaxEvents.length)).map(s => {
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
                    {totalItems > 6 && (
                      <div className="text-[10px] text-gray-400 pl-1">+{totalItems - 6}개 더</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 일정 추가/수정 폼 */}
        {showForm && (
          <div className="w-72 bg-white rounded-lg shadow-sm border border-gray-100 p-5 shrink-0 self-start">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">
                {editSchedule ? "일정 수정" : "일정 추가"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditSchedule(null); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {error && <div className="text-xs text-red-500 mb-3">{error}</div>}

            <form action={editSchedule ? handleUpdate : handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">제목</label>
                <input name="title" required defaultValue={editSchedule?.title ?? ""} placeholder="일정 제목"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">날짜</label>
                <input name="date" type="date" required defaultValue={editSchedule?.date ?? selectedDate ?? ""}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">시작</label>
                  <input name="startTime" type="time" defaultValue={editSchedule?.startTime ?? ""}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">종료</label>
                  <input name="endTime" type="time" defaultValue={editSchedule?.endTime ?? ""}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">색상</label>
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
                <label className="block text-xs text-gray-500 mb-1">메모</label>
                <textarea name="notes" rows={2} defaultValue={editSchedule?.notes ?? ""} placeholder="메모"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending}
                  className="flex-1 bg-[#1a2e4a] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#243d61] disabled:opacity-50">
                  {editSchedule ? "수정" : "추가"}
                </button>
                {editSchedule && editSchedule.userId === currentUserId && (
                  <button type="button" onClick={() => handleDelete(editSchedule.id)}
                    className="px-3 py-2 border border-red-300 text-red-500 rounded-lg text-sm hover:bg-red-50">
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
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 mb-2">이 날의 일정</div>
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
        <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">참고 세무 일정 (해당 시에만)</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {optionalTaxEvents.map((te, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs py-1">
                <span className="text-gray-400 font-mono shrink-0">{month}/{te.day}</span>
                <span className="text-gray-700">{te.title}</span>
                <span className="text-gray-400 text-[10px] truncate">{te.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
