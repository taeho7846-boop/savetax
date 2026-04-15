"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { moveTempMemoToTask, deleteTempMemo } from "@/app/actions/temp-memo";

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
    <div className="text-center py-16 text-gray-400 text-sm">
      슬랙 #메모 채널에 메시지를 보내면 여기에 표시됩니다
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-purple-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💬</span>
        <h3 className="text-sm font-bold text-gray-800">임시메모함</h3>
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
          {memos.length}
        </span>
        <span className="text-xs text-gray-400 ml-1">슬랙에서 수신</span>
      </div>

      <div className="space-y-3">
        {memos.map((memo) => (
          <div key={memo.id} className="border border-gray-100 rounded-lg p-4 hover:border-purple-200 transition-colors">
            {processing === memo.id ? (
              /* 정리 모드 */
              <form action={(fd) => handleMove(memo.id, fd)} className="space-y-3">
                <div className="text-sm text-gray-700 bg-gray-50 rounded px-3 py-2 whitespace-pre-wrap">{memo.content}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">유형</label>
                    <select name="type" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                      <option value="memo">메모</option>
                      <option value="task">업무</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">거래처</label>
                    <ClientSearch clients={clients} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">제목 (선택)</label>
                  <input name="title" placeholder={memo.content.slice(0, 30)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={isPending} className="text-xs bg-[#1a2e4a] text-white px-3 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50">
                    저장
                  </button>
                  <button type="button" onClick={() => setProcessing(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
                    취소
                  </button>
                </div>
              </form>
            ) : (
              /* 보기 모드 */
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-purple-700">{memo.senderName}</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(memo.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">{memo.content}</p>
                {memo.fileUrl && (
                  <a href={memo.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mb-2 block">
                    📎 첨부파일 보기
                  </a>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setProcessing(memo.id)}
                    className="text-xs text-[#1a2e4a] hover:underline font-medium"
                  >
                    정리하기
                  </button>
                  <button
                    onClick={() => handleDelete(memo.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-500"
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
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto">
          <button
            type="button"
            onClick={() => { setSelectedId(null); setQuery(""); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
          >
            거래처 없음
          </button>
          {filtered.slice(0, 20).map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedId(c.id); setQuery(""); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
