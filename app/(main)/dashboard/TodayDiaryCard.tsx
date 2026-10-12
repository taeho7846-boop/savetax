"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckSquareIcon } from "@/components/icons";
import { quickCreateTask, setTaskDone, type DiaryTask } from "@/app/actions/diary";
import { TaskEditModal } from "@/components/TaskEditModal";
import { daysBetween, shortDateLabel } from "@/lib/diary-dates";

// 홈: 오늘 할 일 (다이어리와 같은 데이터) — 체크·추가·클릭해서 수정
export function TodayDiaryCard({ tasks, today }: { tasks: DiaryTask[]; today: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quickTitle, setQuickTitle] = useState("");
  const [editTask, setEditTask] = useState<DiaryTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  const todays = tasks.filter(t => t.dueDate === today);
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== "done");
  const undated = tasks.filter(t => !t.dueDate && t.status !== "done");
  const doneCount = todays.filter(t => t.status === "done").length;
  const openToday = todays.filter(t => t.status !== "done");
  const doneToday = todays.filter(t => t.status === "done");

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try { await fn(); router.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "오류가 발생했습니다."); }
    });
  }

  function submitQuick() {
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle("");
    run(() => quickCreateTask({ title, dueDate: today }));
  }

  return (
    <div className={`glass rounded-3xl p-5 ${isPending ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center text-white shrink-0">
          <CheckSquareIcon width={18} height={18} strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight text-[#191F28]">오늘 할 일</h2>
            <span className="text-[11px] text-[#8B95A1] font-medium">{doneCount} / {todays.length}</span>
            {overdue.length > 0 && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#B91C1C] font-bold">이월 {overdue.length}</span>}
          </div>
        </div>
        <Link href="/diary" className="text-[11.5px] text-[#3182F6] font-semibold hover:underline">다이어리 →</Link>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submitQuick(); } }}
          placeholder="오늘 할 일 적고 Enter"
          className="flex-1 border border-[#F2F4F6] bg-white/70 rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3182F6]"
        />
        <button onClick={submitQuick} className="h-9 px-3 rounded-[10px] bg-[#191F28] text-white text-[12.5px] font-bold hover:bg-black">추가</button>
      </div>

      {openToday.length === 0 && overdue.length === 0 && undated.length === 0 && (
        <div className="text-center py-6 text-[12.5px] text-[#8B95A1]">{doneToday.length > 0 ? "오늘 할 일을 모두 끝냈어요" : "오늘 할 일이 없어요"}</div>
      )}

      <div className="divide-y divide-[#F2F4F6]">
        {openToday.map(t => <Row key={t.id} task={t} today={today} onToggle={() => run(() => setTaskDone(t.id, true))} onEdit={() => setEditTask(t)} />)}
      </div>

      {overdue.length > 0 && (
        <>
          <div className="mt-3 mb-0.5 text-[10.5px] font-bold text-[#DC2626] uppercase tracking-wide">이월</div>
          <div className="divide-y divide-[#F2F4F6]">
            {overdue.map(t => <Row key={t.id} task={t} today={today} overdue onToggle={() => run(() => setTaskDone(t.id, true))} onEdit={() => setEditTask(t)} />)}
          </div>
        </>
      )}

      {undated.length > 0 && (
        <>
          <div className="mt-3 mb-0.5 text-[10.5px] font-bold text-[#8B95A1] uppercase tracking-wide">날짜 없음</div>
          <div className="divide-y divide-[#F2F4F6]">
            {undated.map(t => <Row key={t.id} task={t} today={today} onToggle={() => run(() => setTaskDone(t.id, true))} onEdit={() => setEditTask(t)} />)}
          </div>
        </>
      )}

      {doneToday.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowDone(v => !v)} className="text-[11px] text-[#8B95A1] hover:text-[#191F28]">
            완료 {doneToday.length}건 {showDone ? "접기" : "보기"}
          </button>
          {showDone && (
            <div className="divide-y divide-[#F2F4F6] mt-1">
              {doneToday.map(t => <Row key={t.id} task={t} today={today} onToggle={() => run(() => setTaskDone(t.id, false))} onEdit={() => setEditTask(t)} />)}
            </div>
          )}
        </div>
      )}

      {editTask && (
        <TaskEditModal task={editTask} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); router.refresh(); }} />
      )}
    </div>
  );
}

function Row({ task, today, overdue, onToggle, onEdit }: { task: DiaryTask; today: string; overdue?: boolean; onToggle: () => void; onEdit: () => void }) {
  const done = task.status === "done";
  const delay = task.dueDate && task.dueDate < today && !done ? daysBetween(task.dueDate, today) : 0;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <button
        onClick={onToggle}
        className={`mt-0.5 w-[17px] h-[17px] rounded-[5px] border-[1.5px] flex items-center justify-center shrink-0 transition ${
          done ? "bg-[#1AB266] border-[#1AB266] text-white" : "border-[#C9CED6] hover:border-[#3182F6]"
        }`}
        aria-label={done ? "완료 취소" : "완료"}
      >
        {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>}
      </button>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left group" title="클릭해서 수정">
        <div className={`text-[13px] break-words group-hover:text-[#3182F6] ${done ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}>{task.title}</div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-[#8B95A1] flex-wrap">
          {task.clientName && <span className="text-[#1B64DA] font-medium">{task.clientName}</span>}
          {task.notes && <span className="truncate max-w-[220px]">{task.notes}</span>}
          {overdue && task.dueDate && <span>{shortDateLabel(task.dueDate)}에서 이월</span>}
          {delay > 0 && <span className="text-[#BA7517] font-semibold">{delay}일 지연</span>}
          {task.assignedUserName && <span>· {task.assignedUserName}</span>}
        </div>
      </button>
    </div>
  );
}
