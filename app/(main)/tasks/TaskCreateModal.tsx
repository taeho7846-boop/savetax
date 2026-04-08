"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTaskInModal, getCreateTaskData } from "@/app/actions/tasks";
import { createMemoInModal } from "@/app/actions/memos";

type CreateData = Awaited<ReturnType<typeof getCreateTaskData>>;

export function UnifiedCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors shrink-0"}
      >
        + 등록
      </button>
      {open && <UnifiedCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

// 하위호환: 기존 TaskCreateButton 유지
export function TaskCreateButton({ className }: { className?: string }) {
  return <UnifiedCreateButton className={className} />;
}

function UnifiedCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const [, startTransition] = useTransition();
  const [createType, setCreateType] = useState<"task" | "memo">("task");
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
      if (createType === "task") {
        await createTaskInModal(formData);
      } else {
        await createMemoInModal(formData);
      }
      router.refresh();
      onClose();
    });
  }

  const isManager = data?.currentUserRole && ["owner", "admin", "accountant"].includes(data.currentUserRole);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {createType === "task" ? "업무 등록" : "메모 등록"}
          </h2>
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
              {/* 유형 선택 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateType("task")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    createType === "task"
                      ? "bg-[#1a2e4a] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  업무
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType("memo")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    createType === "memo"
                      ? "bg-[#1a2e4a] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  메모
                </button>
              </div>

              {/* 공통: 고객사 + 제목 */}
              <div className="grid grid-cols-2 gap-4">
                <ClientSearchSelect clients={data.clients} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="title"
                    required
                    placeholder={createType === "task" ? "예: 2025년 1기 부가세 신고" : "메모 제목"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                  />
                </div>
              </div>

              {/* 업무 전용 필드 */}
              {createType === "task" && (
                <div className="grid grid-cols-2 gap-4">
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
                  {isManager && (
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="sharedWithEmployees" value="true" className="accent-[#1a2e4a] w-4 h-4" />
                        <span className="text-sm text-gray-700">소속 직원에게 공유</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* 메모 전용 필드 */}
              {createType === "memo" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">메모 유형</label>
                  <select
                    name="memoType"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="general">일반</option>
                    <option value="handover">인수인계</option>
                    <option value="caution">주의</option>
                  </select>
                </div>
              )}

              {/* 공통: 내용 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {createType === "task" ? "메모" : "내용"} {createType === "memo" && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  name={createType === "task" ? "notes" : "content"}
                  rows={4}
                  required={createType === "memo"}
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

function ClientSearchSelect({ clients }: { clients: { id: number; name: string }[] }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = search
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">고객사</label>
      <input type="hidden" name="clientId" value={selected?.id ?? ""} />
      <input
        type="text"
        value={open ? search : (selected?.name ?? "")}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setSearch(""); }}
        placeholder="검색 또는 선택"
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-52 overflow-y-auto">
          <button
            type="button"
            onClick={() => { setSelected(null); setSearch(""); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${!selected ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500"}`}
          >
            고객사 없음
          </button>
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelected(c); setSearch(""); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selected?.id === c.id ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-800"}`}
            >
              {c.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>
          )}
        </div>
      )}
    </div>
  );
}
