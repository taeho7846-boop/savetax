"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { moveTempMemoToTask, deleteTempMemo } from "@/app/actions/temp-memo";
import { MessageCircleIcon, PaperclipIcon } from "@/components/icons";

type TempMemo = {
  id: number;
  senderName: string;
  content: string;
  fileUrl: string | null;
  createdAt: Date | string;
};

type Client = {
  id: number;
  name: string;
};

function timeAgo(date: Date | string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "방금";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}

export function TempMemoBox({ memos, clients }: { memos: TempMemo[]; clients: Client[] }) {
  const [isPending, startTransition] = useTransition();
  const [processing, setProcessing] = useState<number | null>(null);
  const router = useRouter();

  function handleMove(id: number, formData: FormData) {
    startTransition(async () => {
      await moveTempMemoToTask(id, formData);
      setProcessing(null);
      router.refresh();
    });
  }

  function handleDelete(id: number) {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      await deleteTempMemo(id);
      router.refresh();
    });
  }

  if (memos.length === 0) return (
    <div className="text-center py-16 text-[#8B95A1] text-sm">
      슬랙 #메모 채널에 메시지를 보내면 여기에 표시됩니다
    </div>
  );

  return (
    <div className="bg-white rounded-[6px] border border-[#6FABF9] p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircleIcon width={18} height={18} className="text-[#4E5968]" />
        <h3 className="text-sm font-bold text-[#191F28]">임시메모함</h3>
        <span className="text-xs bg-[#D2E5FF] text-[#0049BC] px-2 py-0.5 rounded-full font-bold">
          {memos.length}
        </span>
        <span className="text-xs text-[#8B95A1] ml-1">슬랙에서 수신</span>
      </div>

      <div className="space-y-3">
        {memos.map((memo) => (
          <div key={memo.id} className="border border-[#E5E8EB] rounded-[6px] p-4 hover:border-[#6FABF9] transition-colors">
            {processing === memo.id ? (
              /* 정리 모드 */
              <form action={(fd) => handleMove(memo.id, fd)} className="space-y-3">
                <div className="text-sm text-[#4E5968] bg-[#F9FAFB] rounded px-3 py-2 whitespace-pre-wrap">{memo.content}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#6B7684] mb-1">유형</label>
                    <select name="type" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-2 py-1.5 text-xs text-[#191F28]">
                      <option value="memo">메모</option>
                      <option value="task">업무</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#6B7684] mb-1">거래처</label>
                    <ClientSearch clients={clients} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">제목 (선택)</label>
                  <input name="title" placeholder={memo.content.slice(0, 30)} className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-2 py-1.5 text-xs text-[#191F28]" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={isPending} className="text-xs bg-[#3182F6] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50">
                    저장
                  </button>
                  <button type="button" onClick={() => setProcessing(null)} className="text-xs text-[#6B7684] hover:text-[#4E5968] px-3 py-1.5">
                    취소
                  </button>
                </div>
              </form>
            ) : (
              /* 보기 모드 */
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-[500] text-[#0049BC]">{memo.senderName}</span>
                  <span className="text-[10px] text-[#8B95A1]">{timeAgo(memo.createdAt)}</span>
                </div>
                <p className="text-sm text-[#191F28] whitespace-pre-wrap mb-2">{memo.content}</p>
                {memo.fileUrl && (
                  <a href={memo.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e40af] hover:underline mb-2 inline-flex items-center gap-1">
                    <PaperclipIcon width={12} height={12} />
                    첨부파일 보기
                  </a>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setProcessing(memo.id)}
                    className="text-xs text-[#3182F6] hover:underline font-[500]"
                  >
                    정리하기
                  </button>
                  <button
                    onClick={() => handleDelete(memo.id)}
                    disabled={isPending}
                    className="text-xs text-[#8B95A1] hover:text-[#dc2626]"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientSearch({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = query
    ? clients.filter(c => c.name.includes(query))
    : clients;
  const selectedName = selectedId ? clients.find(c => c.id === selectedId)?.name || "" : "";

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name="clientId" value={selectedId ?? ""} />
      <input
        type="text"
        value={selectedId ? selectedName : query}
        onChange={(e) => { setQuery(e.target.value); setSelectedId(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="거래처 검색..."
        className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-2 py-1.5 text-xs text-[#191F28] focus:outline-none focus:border-[#3182F6]"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#101113] border border-[#E5E8EB] rounded-[6px] z-30 max-h-40 overflow-y-auto">
          <button
            type="button"
            onClick={() => { setSelectedId(null); setQuery(""); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-[#8B95A1] hover:bg-white"
          >
            거래처 없음
          </button>
          {filtered.slice(0, 20).map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedId(c.id); setQuery(""); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-[#4E5968] hover:bg-[#eff6ff]"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
