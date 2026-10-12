"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  quickCreateTask, quickCreateMemo, setTaskDone, moveTaskDueDate, deleteDiaryTask,
  convertMemoToTask, deleteDiaryMemo,
  type DiaryTask, type DiaryMemo, type DiaryMember,
} from "@/app/actions/diary";
import {
  addDays, addMonths, rangeLabel, shortDateLabel, daysBetween, fromKey, WEEKDAY_KO,
  type DiaryView as ViewMode,
} from "@/lib/diary-dates";
import { ScheduleModal, type Schedule, SCHEDULE_COLORS } from "./ScheduleModal";
import { TaskEditModal } from "@/components/TaskEditModal";

type TaxEvent = { date: string; title: string; desc: string };
type Me = { id: number; name: string; canOffice: boolean };
type Filter = "all" | "mine" | number;

const AVATAR_PALETTE = [
  "bg-[#E1F5EE] text-[#085041]",
  "bg-[#FAECE7] text-[#712B13]",
  "bg-[#EEEDFE] text-[#3C3489]",
  "bg-[#E6F1FB] text-[#0C447C]",
  "bg-[#FBEAF0] text-[#72243E]",
  "bg-[#FAEEDA] text-[#633806]",
];
function avatarClass(userId: number | null) {
  return AVATAR_PALETTE[(userId ?? 0) % AVATAR_PALETTE.length];
}

export function DiaryView({
  view, anchor, today, days, schedules, tasks, memos, members, taxEvents, me,
}: {
  view: ViewMode;
  anchor: string;
  today: string;
  days: string[];
  schedules: Schedule[];
  tasks: DiaryTask[];
  memos: DiaryMemo[];
  members: DiaryMember[];
  taxEvents: TaxEvent[];
  me: Me;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedDate, setSelectedDate] = useState<string>(days.includes(today) ? today : days[0]);
  const [modal, setModal] = useState<{ mode: "create"; date: string; endDate?: string } | { mode: "edit"; schedule: Schedule } | null>(null);
  // 드래그로 날짜 범위 선택 → 여러 날 일정 추가
  const [drag, setDrag] = useState<{ start: string; end: string } | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [memoText, setMemoText] = useState("");
  const [editTask, setEditTask] = useState<DiaryTask | null>(null);
  const [error, setError] = useState("");

  // 범위가 바뀌면 선택일을 범위 안으로
  useEffect(() => {
    if (!days.includes(selectedDate)) setSelectedDate(days.includes(today) ? today : days[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, view]);

  useEffect(() => {
    if (!drag) return;
    const current = drag;
    function onUp() {
      if (current.start !== current.end) {
        const [a, b] = [current.start, current.end].sort();
        setSelectedDate(a);
        setModal({ mode: "create", date: a, endDate: b });
      }
      setDrag(null);
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [drag]);

  // 구글 캘린더 동기화 (범위에 걸친 달마다)
  useEffect(() => {
    const months = [...new Set(days.map(d => d.slice(0, 7)))];
    let changed = false;
    Promise.all(
      months.map(ym =>
        fetch("/api/calendar/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yearMonth: ym }),
        })
          .then(r => r.json())
          .then(data => { if (data?.synced > 0) changed = true; })
          .catch(() => {})
      )
    ).then(() => { if (changed) router.refresh(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, view]);

  // ── 필터 적용 ──
  const visibleSchedules = useMemo(() => schedules.filter(s => {
    if (s.scope === "office") return true;
    if (filter === "all") return true;
    if (filter === "mine") return s.userId === me.id;
    return s.userId === filter;
  }), [schedules, filter, me.id]);

  const visibleTasks = useMemo(() => tasks.filter(t => {
    if (filter === "all") return true;
    if (filter === "mine") return t.assignedUserId === me.id || t.createdByUserId === me.id;
    return t.assignedUserId === filter;
  }), [tasks, filter, me.id]);

  function schedulesOn(date: string) {
    return visibleSchedules.filter(s => s.endDate ? date >= s.date && date <= s.endDate : s.date === date);
  }
  function tasksOn(date: string) {
    return visibleTasks.filter(t => t.dueDate === date);
  }
  function taxOn(date: string) {
    return taxEvents.filter(e => e.date === date);
  }

  // 이월(지연) · 날짜 없음 — 오늘 패널에만
  const overdueTasks = visibleTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "done");
  const undatedTasks = visibleTasks.filter(t => !t.dueDate && t.status !== "done");
  const dayTasks = tasksOn(selectedDate);
  const dayDone = dayTasks.filter(t => t.status === "done").length;

  // 다음 세무 마감 (AI 스트립)
  const upcomingTax = useMemo(() => {
    const next = taxEvents.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return null;
    return { ...next, dDay: daysBetween(today, next.date) };
  }, [taxEvents, today]);

  // ── 네비게이션 ──
  function go(nextView: ViewMode, nextAnchor: string) {
    router.push(`/diary?view=${nextView}&d=${nextAnchor}`);
  }
  function shift(delta: number) {
    go(view, view === "week" ? addDays(anchor, 7 * delta) : addMonths(anchor, delta));
  }

  // ── 액션 ──
  function run(fn: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  function submitQuickTask() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle("");
    run(() => quickCreateTask({ title, dueDate: selectedDate }));
  }

  function submitMemo() {
    const content = memoText.trim();
    if (!content) return;
    setMemoText("");
    run(() => quickCreateMemo({ content }));
  }

  const isSelectedToday = selectedDate === today;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium flex items-center gap-1.5">
            <span className="live-dot" />
            사무실 일정 · 할 일 · 메모 한 화면
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">다이어리</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
            <button onClick={() => shift(-1)} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="이전">◀</button>
            <span className="text-[13px] font-bold text-[#191F28] min-w-[120px] text-center">{rangeLabel(view, anchor)}</span>
            <button onClick={() => shift(1)} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="다음">▶</button>
          </div>
          <button
            onClick={() => { go(view, today); setSelectedDate(today); }}
            className="h-10 px-3 rounded-xl glass text-[12.5px] font-bold text-[#4E5968] hover:text-[#191F28]"
          >
            오늘
          </button>
          <div className="inline-flex gap-0.5 p-1 bg-[#F2F4F6] rounded-[12px] h-10 items-center">
            {([["month", "월간"], ["week", "주간"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => go(k, anchor)}
                className={`px-3.5 h-8 text-[12.5px] rounded-[10px] transition-all ${
                  view === k ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#6B7684] hover:text-[#191F28] font-[500]"
                }`}
              >
                {label}
              </button>
            ))}
            <Link href="/tasks" className="px-3.5 h-8 flex items-center text-[12.5px] rounded-[10px] text-[#6B7684] hover:text-[#191F28] font-[500]">
              목록
            </Link>
          </div>
          <button
            onClick={() => setModal({ mode: "create", date: selectedDate })}
            className="bg-[#3182F6] text-white text-[13px] font-bold px-5 h-10 rounded-2xl hover:bg-[#1B64DA] shadow-md shadow-[#3182F6]/20"
          >
            + 일정
          </button>
        </div>
      </div>

      {/* AI 제안 스트립 */}
      {upcomingTax && (
        <div className="ai-strip rounded-xl px-4 py-2.5 mb-3 flex items-center gap-3">
          <div className="ai-icon-glow w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0">AI</div>
          <div className="flex-1 text-[12.5px] text-[#191F28]">
            <span className="font-semibold">
              {upcomingTax.date.slice(5).replace("-", "/")} {upcomingTax.title} {upcomingTax.dDay === 0 ? "D-day" : `D-${upcomingTax.dDay}`}
            </span>
            <span className="text-[#6B7684]"> · {upcomingTax.desc}</span>
          </div>
          {overdueTasks.length > 0 && (
            <button onClick={() => setSelectedDate(today)} className="text-[11.5px] text-[#DC2626] font-semibold hover:underline">
              이월된 할 일 {overdueTasks.length}건
            </button>
          )}
        </div>
      )}

      {/* 필터 칩 + 범례 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>사무실 전체</FilterChip>
        <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>내 것</FilterChip>
        {members.filter(m => m.id !== me.id).map(m => (
          <FilterChip key={m.id} active={filter === m.id} onClick={() => setFilter(m.id)}>{m.name}</FilterChip>
        ))}
        <span className="flex-1" />
        <Legend className="bg-[#EEEDFE] text-[#3C3489]">사무실 일정</Legend>
        <Legend className="bg-[#E7F7EE] text-[#15803D]">개인 일정</Legend>
        <Legend className="bg-[#FEF2F2] text-[#B91C1C]">세무 마감</Legend>
        <Legend className="bg-[#FEF3C7] text-[#92400E]">할 일</Legend>
        <span className="text-[10.5px] text-[#8B95A1] ml-1">날짜를 끌면 여러 날 일정</span>
      </div>

      {error && <div className="text-xs text-[#E02E2E] mb-2">{error}</div>}

      {/* 캘린더 */}
      <div className={`glass rounded-2xl p-3 mb-4 ${isPending ? "opacity-70" : ""}`}>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map(dow => (
            <div key={dow} className={`text-center text-[11px] font-bold py-1 ${dow === 0 ? "text-[#E02E2E]" : dow === 6 ? "text-[#3182F6]" : "text-[#8B95A1]"}`}>
              {WEEKDAY_KO[dow]}
            </div>
          ))}
        </div>
        <div className={`grid grid-cols-7 gap-1.5 select-none ${drag ? "cursor-crosshair" : ""}`}>
          {days.map(date => {
            const d = fromKey(date);
            const dow = d.getDay();
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const dragRange = drag ? [drag.start, drag.end].sort() : null;
            const inDrag = !!dragRange && date >= dragRange[0] && date <= dragRange[1];
            const inMonth = view === "week" || date.slice(0, 7) === anchor.slice(0, 7);
            const items: React.ReactNode[] = [];

            taxOn(date).forEach((e, i) => items.push(
              <Pill key={`tax-${i}`} className="bg-[#FEF2F2] text-[#B91C1C]" title={`${e.title} · ${e.desc}`}>{e.title}</Pill>
            ));
            schedulesOn(date).forEach(s => {
              const office = s.scope === "office";
              const c = office ? null : (SCHEDULE_COLORS[s.color] ?? SCHEDULE_COLORS.blue);
              const isStart = s.date === date || dow === 1;
              items.push(
                <Pill
                  key={`s-${s.id}`}
                  className={office ? "bg-[#EEEDFE] text-[#3C3489]" : `${c!.bg} ${c!.text}`}
                  title={`${office ? "사무실" : s.user.name}: ${s.client ? s.client.name + " · " : ""}${s.title}${s.endDate ? ` (${s.date} ~ ${s.endDate})` : ""}`}
                  onClick={e => { e.stopPropagation(); setModal({ mode: "edit", schedule: s }); }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {s.endDate && !isStart ? "\u00A0" : `${s.startTime ? s.startTime + " " : ""}${s.client ? s.client.name + " · " : ""}${s.title}`}
                </Pill>
              );
            });
            tasksOn(date).forEach(t => {
              const done = t.status === "done";
              items.push(
                <Pill
                  key={`t-${t.id}`}
                  className={done ? "bg-[#F2F4F6] text-[#8B95A1] line-through" : "bg-[#FEF3C7] text-[#92400E]"}
                  title={`${t.assignedUserName ?? ""} ${t.clientName ? "· " + t.clientName : ""} ${t.title}`}
                  onClick={e => { e.stopPropagation(); setEditTask(t); }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {t.title}
                </Pill>
              );
            });

            const limit = view === "week" ? 10 : 5;
            const overflow = items.length - limit;

            return (
              <div
                key={date}
                onClick={() => setSelectedDate(date)}
                onMouseDown={e => { if (e.button === 0) setDrag({ start: date, end: date }); }}
                onMouseEnter={() => { if (drag) setDrag(prev => prev && prev.end !== date ? { ...prev, end: date } : prev); }}
                title="끌어서 여러 날 일정 추가"
                className={`rounded-xl border p-1.5 cursor-pointer transition-colors relative group flex flex-col gap-0.5 ${
                  view === "week" ? "min-h-[240px]" : "min-h-[140px]"
                } ${inDrag ? "border-[#3182F6] bg-[#E8F3FF]" : isSelected ? "border-[#3182F6] ring-2 ring-[#3182F6]/25 bg-white" : "border-[#F2F4F6] bg-white/60 hover:bg-white"} ${
                  !inMonth ? "opacity-45" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[11.5px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-[#3182F6] text-white" : dow === 0 ? "text-[#E02E2E]" : dow === 6 ? "text-[#3182F6]" : "text-[#333D4B]"
                  }`}>
                    {d.getDate()}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setModal({ mode: "create", date }); }}
                    onMouseDown={e => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#191F28] text-sm leading-none"
                    aria-label="일정 추가"
                  >
                    +
                  </button>
                </div>
                {items.slice(0, limit)}
                {overflow > 0 && <div className="text-[10px] text-[#8B95A1] pl-1">+{overflow}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 패널: 할 일 + 메모 */}
      <div className="grid grid-cols-[1.3fr_1fr] gap-4 pb-4">
        {/* 할 일 */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold text-[#191F28]">
              {isSelectedToday ? "오늘 할 일" : `${shortDateLabel(selectedDate)} 할 일`}
              <span className="ml-2 text-[12px] text-[#8B95A1] font-medium">{dayDone} / {dayTasks.length}</span>
            </div>
            {!isSelectedToday && (
              <button onClick={() => setSelectedDate(today)} className="text-[12px] text-[#3182F6] font-semibold hover:underline">오늘로</button>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submitQuickTask(); } }}
              placeholder={`${shortDateLabel(selectedDate)} 할 일 적고 Enter`}
              className="flex-1 border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3182F6]"
            />
            <button onClick={submitQuickTask} className="h-9 px-3 rounded-[10px] bg-[#191F28] text-white text-[12.5px] font-bold hover:bg-black">추가</button>
          </div>

          {dayTasks.length === 0 && overdueTasks.length === 0 && (!isSelectedToday || undatedTasks.length === 0) && (
            <div className="text-center py-8 text-[12.5px] text-[#8B95A1]">이 날 할 일이 없어요</div>
          )}

          <div className="divide-y divide-[#F2F4F6]">
            {dayTasks.map(t => <TaskRow key={t.id} task={t} today={today} run={run} onEdit={() => setEditTask(t)} />)}
          </div>

          {isSelectedToday && overdueTasks.length > 0 && (
            <>
              <div className="mt-4 mb-1 text-[11px] font-bold text-[#DC2626] uppercase tracking-wide">이월 · {overdueTasks.length}건</div>
              <div className="divide-y divide-[#F2F4F6]">
                {overdueTasks.map(t => <TaskRow key={t.id} task={t} today={today} run={run} overdue onEdit={() => setEditTask(t)} />)}
              </div>
            </>
          )}

          {isSelectedToday && undatedTasks.length > 0 && (
            <>
              <div className="mt-4 mb-1 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wide">날짜 없음 · {undatedTasks.length}건</div>
              <div className="divide-y divide-[#F2F4F6]">
                {undatedTasks.map(t => <TaskRow key={t.id} task={t} today={today} run={run} onEdit={() => setEditTask(t)} />)}
              </div>
            </>
          )}
        </div>

        {/* 메모 */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[15px] font-bold text-[#191F28]">빠른 메모</div>
            <div className="text-[11px] text-[#8B95A1]">어디서든 <kbd className="px-1 py-0.5 rounded bg-white/70 border border-[#E5E8EB] font-mono text-[10px]">Ctrl+Q</kbd></div>
          </div>
          <textarea
            value={memoText}
            onChange={e => setMemoText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitMemo(); } }}
            rows={2}
            placeholder="메모 적고 Enter (줄바꿈은 Shift+Enter)"
            className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3182F6] resize-none mb-2"
          />

          {memos.length === 0 && (
            <div className="text-center py-8 text-[12.5px] text-[#8B95A1]">메모가 없어요</div>
          )}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {memos.map(m => (
              <div key={m.id} className="rounded-[10px] bg-white/70 border-l-[3px] border-[#7F77DD] px-3 py-2 group">
                {m.title && <div className="text-[12.5px] font-bold text-[#191F28] mb-0.5">{m.title}</div>}
                <div className="text-[12.5px] text-[#333D4B] whitespace-pre-wrap break-words">{m.content}</div>
                <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-[#8B95A1]">
                  {m.clientName && (
                    <Link href={`/clients/${m.clientId}`} className="text-[#1B64DA] font-medium hover:underline">{m.clientName}</Link>
                  )}
                  <span>{new Date(m.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => run(() => convertMemoToTask(m.id, selectedDate))}
                    className="opacity-0 group-hover:opacity-100 text-[#3182F6] font-semibold hover:underline"
                  >
                    → {isSelectedToday ? "오늘" : shortDateLabel(selectedDate)} 할 일로
                  </button>
                  <button
                    onClick={() => { if (confirm("메모를 삭제할까요?")) run(() => deleteDiaryMemo(m.id)); }}
                    className="opacity-0 group-hover:opacity-100 text-[#8B95A1] hover:text-[#DC2626]"
                    aria-label="메모 삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editTask && (
        <TaskEditModal task={editTask} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); router.refresh(); }} />
      )}

      {modal && (
        <ScheduleModal
          mode={modal.mode}
          date={modal.mode === "create" ? modal.date : undefined}
          endDate={modal.mode === "create" ? modal.endDate : undefined}
          schedule={modal.mode === "edit" ? modal.schedule : undefined}
          me={me}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11.5px] px-3 py-1 rounded-full font-bold transition ${
        active ? "bg-[#191F28] text-white" : "bg-white/60 text-[#6B7684] hover:bg-white hover:text-[#191F28]"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium ${className}`}>{children}</span>;
}

function Pill({ className, title, onClick, onMouseDown, children }: { className: string; title?: string; onClick?: (e: React.MouseEvent) => void; onMouseDown?: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <div
      className={`text-[11.5px] px-2 py-[3px] rounded-md truncate leading-[1.4] ${onClick ? "cursor-pointer hover:opacity-80" : ""} ${className}`}
      title={title}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}

function TaskRow({ task, today, run, overdue, onEdit }: { task: DiaryTask; today: string; run: (fn: () => Promise<unknown>) => void; overdue?: boolean; onEdit: () => void }) {
  const done = task.status === "done";
  const delay = task.dueDate && task.dueDate < today && !done ? daysBetween(task.dueDate, today) : 0;
  const initial = task.assignedUserName?.slice(0, 1) ?? "?";
  return (
    <div className="flex items-start gap-2.5 py-2 group">
      <button
        onClick={() => run(() => setTaskDone(task.id, !done))}
        className={`mt-0.5 w-[17px] h-[17px] rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 transition ${
          done ? "bg-[#1AB266] border-[#1AB266] text-white" : "border-[#C9CED6] hover:border-[#3182F6]"
        }`}
        aria-label={done ? "완료 취소" : "완료"}
      >
        {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onEdit} className={`text-left text-[13px] break-words hover:text-[#3182F6] hover:underline decoration-[#3182F6]/40 ${done ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`} title="클릭해서 수정">{task.title}</button>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-[#8B95A1] flex-wrap">
          {task.clientName && (
            <Link href={`/clients/${task.clientId}`} className="text-[#1B64DA] font-medium hover:underline">{task.clientName}</Link>
          )}
          {task.notes && <span className="truncate max-w-[260px]">{task.notes}</span>}
          {overdue && task.dueDate && <span>{shortDateLabel(task.dueDate)}에서 이월</span>}
          {delay > 0 && <span className="text-[#BA7517] font-semibold">{delay}일 지연</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="date"
          defaultValue={task.dueDate ?? ""}
          onChange={e => run(() => moveTaskDueDate(task.id, e.target.value || null))}
          className="opacity-0 group-hover:opacity-100 w-[118px] text-[10.5px] border border-[#E5E8EB] rounded-md px-1 py-0.5 bg-white text-[#6B7684]"
          title="날짜 옮기기"
        />
        <button
          onClick={() => { if (confirm("이 할 일을 삭제할까요?")) run(() => deleteDiaryTask(task.id)); }}
          className="opacity-0 group-hover:opacity-100 text-[#8B95A1] hover:text-[#DC2626] text-[12px] px-1"
          aria-label="삭제"
        >
          ✕
        </button>
        <span className={`w-[22px] h-[22px] rounded-full text-[10.5px] font-bold flex items-center justify-center ${avatarClass(task.assignedUserId)}`} title={task.assignedUserName ?? ""}>
          {initial}
        </span>
      </div>
    </div>
  );
}
