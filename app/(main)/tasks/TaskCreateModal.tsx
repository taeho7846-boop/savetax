"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskInModal, getCreateTaskData } from "@/app/actions/tasks";

type CreateData = Awaited<ReturnType<typeof getCreateTaskData>>;

export function TaskCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors shrink-0"}
      >
        + 업무 등록
      </button>
      {open && <TaskCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TaskCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    getCreateTaskData().then(setData);
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
      await createTaskInModal(formData);
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
          <h2 className="text-lg font-bold text-gray-900">업무 등록</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    고객사 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="clientId"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">선택하세요</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    업무명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="title"
                    required
                    placeholder="예: 2025년 1기 부가세 신고"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">업무 유형</label>
                  <select
                    name="taskType"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">선택 안 함</option>
                    <option value="vat">부가가치세</option>
                    <option value="withholding">원천세</option>
                    <option value="income">종합소득세</option>
                    <option value="corporate">법인세</option>
                    <option value="insurance">4대보험</option>
                    <option value="settlement">결산</option>
                    <option value="other">기타</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
                  <select
                    name="assignedUserId"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">미배정</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">마감일</label>
                  <input
                    name="dueDate"
                    type="date"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">우선순위</label>
                  <select
                    name="priority"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="normal">보통</option>
                    <option value="high">높음</option>
                    <option value="low">낮음</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                  <select
                    name="status"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="scheduled">예정</option>
                    <option value="in_progress">진행중</option>
                    <option value="done">완료</option>
                    <option value="hold">보류</option>
                    <option value="delayed">지연</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
                >
                  등록
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
