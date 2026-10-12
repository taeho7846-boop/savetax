"use client";

import { useEffect, useState, useTransition } from "react";
import { createSchedule, updateSchedule, deleteSchedule } from "@/app/actions/schedule";

export type Schedule = {
  id: number;
  userId: number;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string;
  notes: string | null;
  scope: string;
  user: { id: number; name: string };
};

export const SCHEDULE_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  blue:   { bg: "bg-[#E8F3FF]", text: "text-[#1B64DA]", dot: "bg-[#3182F6]", label: "파랑" },
  green:  { bg: "bg-[#E7F7EE]", text: "text-[#15803D]", dot: "bg-[#1AB266]", label: "초록" },
  orange: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", dot: "bg-[#F59E0B]", label: "주황" },
  red:    { bg: "bg-[#FEF2F2]", text: "text-[#B91C1C]", dot: "bg-[#E02E2E]", label: "빨강" },
  purple: { bg: "bg-[#F3E8FF]", text: "text-[#6D28D9]", dot: "bg-[#8B5CF6]", label: "보라" },
};

const TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
})();

const inputCls = "w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]";

export function ScheduleModal({
  mode, date, schedule, me, onClose, onSaved,
}: {
  mode: "create" | "edit";
  date?: string;
  schedule?: Schedule;
  me: { id: number; isManager: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [scope, setScope] = useState<"personal" | "office">((schedule?.scope as "personal" | "office") ?? "personal");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canEdit = !schedule || schedule.userId === me.id || (schedule.scope === "office" && me.isManager);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("scope", scope);
    setError("");
    startTransition(async () => {
      try {
        if (mode === "edit" && schedule) await updateSchedule(schedule.id, fd);
        else await createSchedule(fd);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  function handleDelete() {
    if (!schedule || !confirm("이 일정을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await deleteSchedule(schedule.id);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#191F28]">{mode === "edit" ? "일정 수정" : "일정 추가"}</h3>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-xl leading-none" aria-label="닫기">✕</button>
        </div>

        {schedule && !canEdit && (
          <div className="text-[12px] text-[#6B7684] bg-[#F9FAFB] rounded-[10px] px-3 py-2 mb-3">
            {schedule.user.name}님의 일정이라 보기만 가능해요.
          </div>
        )}
        {error && <div className="text-xs text-[#E02E2E] mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 사무실 / 개인 */}
          <div className="inline-flex gap-0.5 p-1 bg-[#F2F4F6] rounded-[12px]">
            {([["personal", "개인 일정"], ["office", "사무실 일정"]] as const).map(([k, label]) => {
              const disabled = k === "office" && !me.isManager;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled || !canEdit}
                  onClick={() => setScope(k)}
                  title={disabled ? "사무실 일정은 관리자만 등록할 수 있어요" : undefined}
                  className={`px-3.5 py-1.5 text-[12.5px] rounded-[10px] transition-all ${
                    scope === k ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#6B7684] font-[500]"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-xs text-[#6B7684] mb-1">제목</label>
            <input name="title" required readOnly={!canEdit} defaultValue={schedule?.title ?? ""} placeholder={scope === "office" ? "예: 주간회의, 급여 지급일" : "일정 제목"} className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">날짜</label>
              <input name="date" type="date" required readOnly={!canEdit} defaultValue={schedule?.date ?? date ?? ""} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">종료일 <span className="text-[#B0B8C1]">(여러 날이면)</span></label>
              <input name="endDate" type="date" readOnly={!canEdit} defaultValue={schedule?.endDate ?? ""} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">시작</label>
              <select name="startTime" disabled={!canEdit} defaultValue={schedule?.startTime ?? ""} className={inputCls}>
                <option value="">선택</option>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">종료</label>
              <select name="endTime" disabled={!canEdit} defaultValue={schedule?.endTime ?? ""} className={inputCls}>
                <option value="">선택</option>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {scope === "personal" && (
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">색상</label>
              <div className="flex gap-2">
                {Object.entries(SCHEDULE_COLORS).map(([key, c]) => (
                  <label key={key} className="cursor-pointer" title={c.label}>
                    <input type="radio" name="color" value={key} disabled={!canEdit} defaultChecked={(schedule?.color ?? "blue") === key} className="sr-only peer" />
                    <div className={`w-6 h-6 rounded-full ${c.dot} peer-checked:ring-2 peer-checked:ring-offset-1 peer-checked:ring-gray-400`} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-[#6B7684] mb-1">메모</label>
            <textarea name="notes" rows={2} readOnly={!canEdit} defaultValue={schedule?.notes ?? ""} placeholder="메모" className={`${inputCls} resize-none`} />
          </div>

          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isPending} className="flex-1 bg-[#3182F6] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#1B64DA] disabled:opacity-50">
                {mode === "edit" ? "수정" : "추가"}
              </button>
              {mode === "edit" && (
                <button type="button" onClick={handleDelete} disabled={isPending} className="px-4 py-2.5 border border-red-200 text-[#E02E2E] rounded-xl text-sm hover:bg-[#FEF2F2]">
                  삭제
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
