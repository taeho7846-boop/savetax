"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMemoInModal, getCreateMemoData } from "@/app/actions/memos";

type CreateData = Awaited<ReturnType<typeof getCreateMemoData>>;

export function MemoCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors shrink-0"}
      >
        + 메모 작성
      </button>
      {open && <MemoCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function MemoCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    getCreateMemoData().then(setData);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createMemoInModal(formData);
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">메모 작성</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5">
          {!data ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">고객사 (선택)</label>
                  <select
                    name="clientId"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">전체 공통</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">메모 유형</label>
                  <select
                    name="memoType"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="general">일반</option>
                    <option value="handover">인수인계</option>
                    <option value="caution">주의사항</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="content"
                  required
                  rows={6}
                  placeholder="메모 내용을 입력하세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-gray-300 text-gray-600 text-sm px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
