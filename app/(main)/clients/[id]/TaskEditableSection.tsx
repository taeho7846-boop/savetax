"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { updateTaskNotesAndDueDate } from "@/app/actions/tasks";

type Props = {
  taskId: number;
  notes: string | null;
  dueDate: string | null;
  canEdit: boolean;
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateKR(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function TaskEditableSection({ taskId, notes, dueDate, canEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [notesDraft, setNotesDraft] = useState(notes ?? "");
  const [dueDraft, setDueDraft] = useState(toDateInputValue(dueDate));

  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || editing) return;
    setIsClamped(el.scrollHeight > el.clientHeight + 1);
  }, [notes, editing]);

  const startEdit = () => {
    setNotesDraft(notes ?? "");
    setDueDraft(toDateInputValue(dueDate));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskNotesAndDueDate(taskId, notesDraft, dueDraft || null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  };

  if (editing) {
    return (
      <div className="mt-1.5 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[#6B7684] shrink-0">마감</label>
          <input
            type="date"
            value={dueDraft}
            onChange={e => setDueDraft(e.target.value)}
            className="text-xs border border-[#E5E8EB] rounded-md px-2 py-1 outline-none focus:border-[#3182F6]"
          />
        </div>
        <textarea
          value={notesDraft}
          onChange={e => setNotesDraft(e.target.value)}
          rows={6}
          placeholder="본문"
          className="w-full text-xs text-[#191F28] border border-[#E5E8EB] rounded-md px-2.5 py-2 outline-none focus:border-[#3182F6] resize-y whitespace-pre-wrap"
        />
        {error && <div className="text-[11px] text-[#DC2626]">{error}</div>}
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="text-[11px] px-2.5 py-1 rounded-md bg-[#3182F6] text-white font-medium disabled:opacity-50"
          >
            {pending ? "저장중..." : "저장"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={cancel}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[#E5E8EB] text-[#4E5968]"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1">
      {dueDate && (
        <div className="text-xs text-[#8B95A1]">마감: {formatDateKR(dueDate)}</div>
      )}
      {notes && (
        <p
          ref={ref}
          className={`text-xs text-[#6B7684] mt-1 whitespace-pre-wrap ${expanded ? "" : "line-clamp-5"}`}
        >
          {notes}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1">
        {notes && (isClamped || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-[#3182F6] hover:underline"
          >
            {expanded ? "접기" : "더보기"}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={startEdit}
            className="text-[11px] text-[#8B95A1] hover:text-[#3182F6] ml-auto"
          >
            ✎ 수정
          </button>
        )}
      </div>
    </div>
  );
}
