"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickCreateTask, quickCreateMemo, getQuickCaptureClients } from "@/app/actions/diary";
import { todayKeyLocal } from "@/lib/client-date";

// 어디서든 Ctrl+Q 또는 독바 "빠른입력" 버튼으로 뜨는 입력창.
// 거래처 페이지 버튼은 window.dispatchEvent(new CustomEvent("savetax-open-quick-capture", { detail: { clientId, clientName } }))

type Preset = { clientId?: number; clientName?: string; mode?: "task" | "memo" };
type ClientOpt = { id: number; name: string };

export const QUICK_CAPTURE_EVENT = "savetax-open-quick-capture";

export function openQuickCapture(preset?: Preset) {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT, { detail: preset ?? {} }));
}

export function QuickCapture() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"task" | "memo">("task");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [client, setClient] = useState<ClientOpt | null>(null);
  const [clients, setClients] = useState<ClientOpt[] | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [showClientList, setShowClientList] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);

  function openWith(preset: Preset) {
    setMode(preset.mode ?? "task");
    setText("");
    setError("");
    setSavedMsg("");
    setDueDate(todayKeyLocal());
    setClient(preset.clientId && preset.clientName ? { id: preset.clientId, name: preset.clientName } : null);
    setClientQuery("");
    setShowClientList(false);
    setOpen(true);
    if (clients === null) getQuickCaptureClients().then(setClients).catch(() => setClients([]));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "q" || e.key === "Q" || e.code === "KeyQ")) {
        e.preventDefault();
        if (open) setOpen(false);
        else openWith({});
      }
    }
    function onOpenEvent(e: Event) {
      openWith((e as CustomEvent<Preset>).detail ?? {});
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(QUICK_CAPTURE_EVENT, onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(QUICK_CAPTURE_EVENT, onOpenEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clients]);

  useEffect(() => {
    if (open) setTimeout(() => textRef.current?.focus(), 30);
  }, [open]);

  function submit() {
    const content = text.trim();
    if (!content) { setError("내용을 적어주세요."); return; }
    setError("");
    startTransition(async () => {
      try {
        if (mode === "task") {
          await quickCreateTask({ title: content.split("\n")[0].slice(0, 100), notes: content.includes("\n") ? content : null, dueDate: dueDate || null, clientId: client?.id ?? null });
        } else {
          await quickCreateMemo({ content, clientId: client?.id ?? null });
        }
        setText("");
        setSavedMsg(mode === "task" ? "할 일로 저장했어요" : "메모를 저장했어요");
        router.refresh();
        setTimeout(() => setOpen(false), 450);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
    });
  }

  if (!open) return null;

  const filteredClients = (clients ?? []).filter(c => !clientQuery || c.name.toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/25 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <div className="inline-flex gap-0.5 p-1 bg-[#F2F4F6] rounded-[12px]">
            {([["task", "할 일"], ["memo", "메모"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={`px-3.5 py-1.5 text-[12.5px] rounded-[10px] transition-all ${
                  mode === k ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#6B7684] font-[500]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="text-[10.5px] text-[#8B95A1]">Enter 저장 · Shift+Enter 줄바꿈 · Esc 닫기</span>
        </div>

        <div className="px-4">
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
            }}
            rows={3}
            placeholder={mode === "task" ? "예: ○○상사 부가세 자료 요청 전화" : "예: □□식당 대표님 금요일 다시 연락"}
            className="w-full text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] resize-none focus:outline-none py-2"
          />
        </div>

        <div className="flex items-center gap-2 px-4 pb-4 pt-1 flex-wrap">
          {mode === "task" && (
            <label className="flex items-center gap-1.5 text-[11.5px] text-[#6B7684] bg-[#F9FAFB] border border-[#F2F4F6] rounded-full px-2.5 py-1">
              <span>마감</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-transparent text-[#191F28] text-[11.5px] focus:outline-none" />
            </label>
          )}

          <div className="relative">
            {client ? (
              <button
                type="button"
                onClick={() => setClient(null)}
                className="text-[11.5px] bg-[#E8F3FF] text-[#1B64DA] rounded-full px-2.5 py-1 font-medium hover:bg-[#DCEBFF]"
                title="클릭하면 해제"
              >
                {client.name} ✕
              </button>
            ) : (
              <input
                value={clientQuery}
                onChange={e => { setClientQuery(e.target.value); setShowClientList(true); }}
                onFocus={() => setShowClientList(true)}
                onBlur={() => setTimeout(() => setShowClientList(false), 120)}
                placeholder="거래처 (선택)"
                className="text-[11.5px] bg-[#F9FAFB] border border-[#F2F4F6] rounded-full px-2.5 py-1 w-[150px] focus:outline-none focus:border-[#3182F6]"
              />
            )}
            {showClientList && !client && (
              <div className="absolute top-full left-0 mt-1 w-[240px] bg-white border border-[#F2F4F6] rounded-xl shadow-lg z-10 max-h-56 overflow-y-auto">
                {clients === null && <div className="px-3 py-2 text-[12px] text-[#8B95A1]">불러오는 중...</div>}
                {clients !== null && filteredClients.length === 0 && <div className="px-3 py-2 text-[12px] text-[#8B95A1]">검색 결과 없음</div>}
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setClient(c); setShowClientList(false); setClientQuery(""); textRef.current?.focus(); }}
                    className="w-full text-left px-3 py-2 text-[12.5px] text-[#191F28] hover:bg-[#F5F9FF]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="flex-1" />
          {error && <span className="text-[11.5px] text-[#E02E2E]">{error}</span>}
          {savedMsg && <span className="text-[11.5px] text-[#15803D] font-medium">{savedMsg}</span>}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-[#191F28] text-white text-[12.5px] font-bold px-4 py-2 rounded-xl hover:bg-black disabled:opacity-50"
          >
            {mode === "task" ? "할 일 저장" : "메모 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
