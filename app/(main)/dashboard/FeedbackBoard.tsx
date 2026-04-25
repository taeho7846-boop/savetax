"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFeedback, updateFeedback, deleteFeedback } from "@/app/actions/feedback";

type FeedbackItem = {
  id: number;
  authorId: number;
  author: { id: number; name: string };
  category: string;
  page: string | null;
  content: string;
  createdAt: Date | string;
};

const PAGE_OPTIONS = [
  "대시보드", "고객사 관리", "신규수임", "신고대리", "원천세", "종합소득세",
  "채권 관리", "자료수집", "세이브택스 배분", "세무회계태호 배분", "수익추이", "스케쥴",
  "업무/메모", "직원 관리", "설정", "기타",
];

function PageSelect({ value, onChange, name, required }: { value?: string; onChange?: (v: string) => void; name?: string; required?: boolean }) {
  return (
    <select
      name={name}
      required={required}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className="bg-white border border-[#D1D6DB] rounded-[6px] px-2 py-1 text-xs text-[#4E5968] focus:outline-none focus:border-[#3182F6]"
    >
      <option value="">해당 탭 선택</option>
      {PAGE_OPTIONS.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}

const CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  suggestion: { label: "건의사항", bg: "bg-[#eff6ff]", text: "text-[#1e40af]" },
  bug: { label: "오류수정", bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
};

function daysAgo(date: Date | string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-Day";
  return `D+${diff}`;
}

export function FeedbackBoard({
  feedbacks,
  currentUserId,
  currentUserRole,
}: {
  feedbacks: FeedbackItem[];
  currentUserId: number;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState("suggestion");
  const [editPage, setEditPage] = useState("");
  const [editContent, setEditContent] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? feedbacks.filter((f) => f.category === filter) : feedbacks;

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createFeedback(formData);
      setShowForm(false);
    });
  }

  function startEdit(f: FeedbackItem) {
    setEditingId(f.id);
    setEditCategory(f.category);
    setEditPage(f.page ?? "");
    setEditContent(f.content);
  }

  function handleUpdate(id: number) {
    const formData = new FormData();
    formData.set("category", editCategory);
    formData.set("page", editPage);
    formData.set("content", editContent);
    startTransition(async () => {
      await updateFeedback(id, formData);
      setEditingId(null);
    });
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(async () => {
      await deleteFeedback(id);
    });
  }

  const canModify = (f: FeedbackItem) => f.authorId === currentUserId || currentUserRole === "owner";

  return (
    <div className="bg-white rounded-[6px] border border-[#E5E8EB] p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#191F28]">건의사항 / 오류제보</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#3182F6] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#1B64DA] transition-colors"
        >
          {showForm ? "취소" : "+ 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-[#F9FAFB] rounded-[6px] border border-[#E5E8EB]">
          <div className="flex gap-3 mb-3 items-center">
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="category" value="suggestion" defaultChecked className="accent-[#5e6ad2]" />
                <span className="text-xs font-[500] text-[#1e40af]">건의사항</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="category" value="bug" className="accent-[#f87171]" />
                <span className="text-xs font-[500] text-[#dc2626]">오류수정</span>
              </label>
            </div>
            <PageSelect name="page" required />
          </div>
          <textarea
            name="content"
            required
            rows={3}
            placeholder="내용을 입력하세요"
            className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none mb-3"
          />
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#3182F6] text-white text-xs px-4 py-2 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50"
          >
            등록
          </button>
        </form>
      )}

      {/* 필터 */}
      <div className="flex gap-1.5 mb-3">
        <button
          onClick={() => setFilter(null)}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            filter === null ? "bg-[#f7f8f8] text-[#0b0d10]" : "bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
          }`}
        >
          전체 {feedbacks.length}
        </button>
        <button
          onClick={() => setFilter(filter === "suggestion" ? null : "suggestion")}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            filter === "suggestion" ? "bg-[#3182F6] text-white" : "bg-[#eff6ff] text-[#1e40af] hover:bg-[rgba(59,130,246,0.18)]"
          }`}
        >
          건의사항 {feedbacks.filter((f) => f.category === "suggestion").length}
        </button>
        <button
          onClick={() => setFilter(filter === "bug" ? null : "bug")}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            filter === "bug" ? "bg-[#f87171] text-white" : "bg-[#fef2f2] text-[#dc2626] hover:bg-[rgba(239,68,68,0.18)]"
          }`}
        >
          오류수정 {feedbacks.filter((f) => f.category === "bug").length}
        </button>
      </div>

      {/* 목록 */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[#8B95A1] text-sm">등록된 글이 없습니다</div>
        ) : (
          filtered.map((f) => {
            const cat = CATEGORY_STYLES[f.category] ?? CATEGORY_STYLES.suggestion;
            const isEditing = editingId === f.id;

            return (
              <div key={f.id} className="border border-[#E5E8EB] rounded-[6px] px-4 py-3 hover:border-[#D1D6DB] transition-colors">
                {isEditing ? (
                  /* 수정 모드 */
                  <div>
                    <div className="flex gap-3 mb-2 items-center">
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={editCategory === "suggestion"}
                            onChange={() => setEditCategory("suggestion")}
                            className="accent-[#5e6ad2]"
                          />
                          <span className="text-xs font-[500] text-[#1e40af]">건의사항</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={editCategory === "bug"}
                            onChange={() => setEditCategory("bug")}
                            className="accent-[#f87171]"
                          />
                          <span className="text-xs font-[500] text-[#dc2626]">오류수정</span>
                        </label>
                      </div>
                      <PageSelect value={editPage} onChange={setEditPage} />
                    </div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(f.id)}
                        disabled={isPending}
                        className="text-xs bg-[#3182F6] text-white px-3 py-1.5 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-[#6B7684] hover:text-[#4E5968] px-3 py-1.5"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 보기 모드 */
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-[500] px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                        {cat.label}
                      </span>
                      {f.page && (
                        <span className="text-[10px] font-[500] px-2 py-0.5 rounded-full bg-white text-[#4E5968]">
                          {f.page}
                        </span>
                      )}
                      <span className="text-xs text-[#6B7684]">{f.author.name}</span>
                      <span className="text-[10px] text-[#8B95A1] ml-auto font-mono">{daysAgo(f.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#4E5968] whitespace-pre-wrap">{f.content}</p>
                    {canModify(f) && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => startEdit(f)}
                          className="text-[11px] text-[#8B95A1] hover:text-[#191F28] transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(f.id)}
                          disabled={isPending}
                          className="text-[11px] text-[#8B95A1] hover:text-[#dc2626] transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
