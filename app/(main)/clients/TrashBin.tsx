"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreClient, permanentDeleteClient } from "@/app/actions/clients";

type TrashClient = {
  id: number;
  name: string;
  ceoName: string | null;
  bizNumber: string | null;
  updatedAt: Date;
};

export function TrashBinButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
      >
        <span>🗑️</span>
        휴지통
        {count > 0 && (
          <span className="bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{count}</span>
        )}
      </button>
      {open && <TrashBinModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TrashBinModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TrashClient[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // 데이터 로드
  useState(() => {
    fetch("/api/clients/trash")
      .then(r => r.json())
      .then(setItems);
  });

  function handleRestore(id: number) {
    startTransition(async () => {
      await restoreClient(id);
      setItems(prev => prev?.filter(c => c.id !== id) ?? null);
      router.refresh();
    });
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}"을(를) 영구 삭제하시겠습니까?\n관련 데이터가 모두 삭제됩니다.`)) return;
    startTransition(async () => {
      await permanentDeleteClient(id);
      setItems(prev => prev?.filter(c => c.id !== id) ?? null);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-bold text-gray-900">🗑️ 휴지통</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">삭제된 고객사가 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map(c => (
                <div key={c.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {c.ceoName || "-"} · {c.bizNumber || "-"} · 삭제: {new Date(c.updatedAt).toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRestore(c.id)}
                      disabled={isPending}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                    >
                      복원
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={isPending}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50"
                    >
                      영구삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
