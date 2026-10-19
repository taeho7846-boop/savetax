"use client";

import { useEffect, useState, useTransition } from "react";
import { updateDiaryTask, deleteDiaryTask, getQuickCaptureClients, type DiaryTask } from "@/app/actions/diary";
import { askConfirm } from "@/components/ui/Dialog";

// 할 일 수정 모달 — 다이어리·홈 공용
type ClientOpt = { id: number; name: string };

const STATUS_OPTIONS = [
  { value: "scheduled", label: "예정" },
  { value: "in_progress", label: "진행중" },
  { value: "hold", label: "보류" },
  { value: "done", label: "완료" },
];

const inputCls = "w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]";

export function TaskEditModal({ task, onClose, onSaved }: { task: DiaryTask; onClose: () => void; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [status, setStatus] = useState(task.status);
  const [client, setClient] = useState<ClientOpt | null>(task.clientId && task.clientName ? { id: task.clientId, name: task.clientName } : null);
  const [clients, setClients] = useState<ClientOpt[] | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [showClientList, setShowClientList] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    getQuickCaptureClients().then(setClients).catch(() => setClients([]));
  }, []);

  function save() {
    if (!title.trim()) { setError("제목을 입력하세요."); return; }
    setError("");
    startTransition(async () => {
      try {
        await updateDiaryTask(task.id, {
          title: title.trim(),
          notes: notes.trim() || null,
          dueDate: dueDate || null,
          clientId: client?.id ?? null,
          status,
        });
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
    });
  }

  async function remove() {
    if (!await askConfirm("이 할 일을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await deleteDiaryTask(task.id);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      }
    });
  }

  const filteredClients = (clients ?? []).filter(c => !clientQuery || c.name.toLowerCase().includes(clientQuery.toLowerCase()));

  return (
    <div
      className="fixed inset-0 bg-[#191F28]/25 backdrop-blur-[3px] z-50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#191F28]">할 일 수정</h3>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-xl leading-none" aria-label="닫기">✕</button>
        </div>
        {error && <div className="text-xs text-[#E02E2E] mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#6B7684] mb-1">제목</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }}
              className={`${inputCls} text-[15px]`}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">날짜</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">상태</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                {!STATUS_OPTIONS.some(o => o.value === status) && <option value={status}>{status}</option>}
              </select>
            </div>
          </div>
          <div className="relative">
            <label className="block text-xs text-[#6B7684] mb-1">거래처</label>
            {client ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] bg-[#E8F3FF] text-[#1B64DA] rounded-lg px-3 py-1.5 font-medium">{client.name}</span>
                <button type="button" onClick={() => setClient(null)} className="text-[12px] text-[#8B95A1] hover:text-[#DC2626]">해제</button>
              </div>
            ) : (
              <input
                value={clientQuery}
                onChange={e => { setClientQuery(e.target.value); setShowClientList(true); }}
                onFocus={() => setShowClientList(true)}
                onBlur={() => setTimeout(() => setShowClientList(false), 120)}
                placeholder="거래처 검색 (선택)"
                className={inputCls}
              />
            )}
            {showClientList && !client && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-[#F2F4F6] rounded-xl shadow-2xl z-10 max-h-[40vh] overflow-y-auto">
                {clients === null && <div className="px-3 py-2.5 text-[13px] text-[#8B95A1]">불러오는 중...</div>}
                {clients !== null && filteredClients.length === 0 && <div className="px-3 py-2.5 text-[13px] text-[#8B95A1]">검색 결과 없음</div>}
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setClient(c); setShowClientList(false); setClientQuery(""); }}
                    className="w-full text-left px-3 py-2.5 text-[13.5px] text-[#191F28] hover:bg-[#F5F9FF]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-[#6B7684] mb-1">메모</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="세부 내용" className={`${inputCls} resize-none`} />
          </div>
          {task.assignedUserName && (
            <div className="text-[11.5px] text-[#8B95A1]">담당 {task.assignedUserName}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={save} disabled={isPending} className="flex-1 bg-[#3182F6] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#1B64DA] disabled:opacity-50">
              저장
            </button>
            <button type="button" onClick={remove} disabled={isPending} className="px-4 py-2.5 border border-red-200 text-[#E02E2E] rounded-xl text-sm hover:bg-[#FEF2F2]">
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
