"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFeedback, updateFeedback, deleteFeedback } from "@/app/actions/feedback";

type FeedbackItem = {
  id: number;
  authorId: number;
  author: { id: number; name: string };
  category: string;
  content: string;
  createdAt: Date | string;
};

const CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  suggestion: { label: "건의사항", bg: "bg-blue-100", text: "text-blue-700" },
  bug: { label: "오류수정", bg: "bg-red-100", text: "text-red-700" },
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
    setEditContent(f.content);
  }

  function handleUpdate(id: number) {
    const formData = new FormData();
    formData.set("category", editCategory);
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-800">건의사항 / 오류제보</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#1a2e4a] text-white px-3 py-1.5 rounded-lg hover:bg-[#243d61] transition-colors"
        >
          {showForm ? "취소" : "+ 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="category" value="suggestion" defaultChecked className="accent-blue-600" />
              <span className="text-xs font-medium text-blue-700">건의사항</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="category" value="bug" className="accent-red-600" />
              <span className="text-xs font-medium text-red-700">오류수정</span>
            </label>
          </div>
          <textarea
            name="content"
            required
            rows={3}
            placeholder="내용을 입력하세요"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none mb-3"
          />
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#1a2e4a] text-white text-xs px-4 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50"
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
            filter === null ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          전체 {feedbacks.length}
        </button>
        <button
          onClick={() => setFilter(filter === "suggestion" ? null : "suggestion")}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            filter === "suggestion" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
        >
          건의사항 {feedbacks.filter((f) => f.category === "suggestion").length}
        </button>
        <button
          onClick={() => setFilter(filter === "bug" ? null : "bug")}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            filter === "bug" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"
          }`}
        >
          오류수정 {feedbacks.filter((f) => f.category === "bug").length}
        </button>
      </div>

      {/* 목록 */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">등록된 글이 없습니다</div>
        ) : (
          filtered.map((f) => {
            const cat = CATEGORY_STYLES[f.category] ?? CATEGORY_STYLES.suggestion;
            const isEditing = editingId === f.id;

            return (
              <div key={f.id} className="border border-gray-100 rounded-lg px-4 py-3 hover:border-gray-200 transition-colors">
                {isEditing ? (
                  /* 수정 모드 */
                  <div>
                    <div className="flex gap-2 mb-2">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={editCategory === "suggestion"}
                          onChange={() => setEditCategory("suggestion")}
                          className="accent-blue-600"
                        />
                        <span className="text-xs font-medium text-blue-700">건의사항</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={editCategory === "bug"}
                          onChange={() => setEditCategory("bug")}
                          className="accent-red-600"
                        />
                        <span className="text-xs font-medium text-red-700">오류수정</span>
                      </label>
                    </div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(f.id)}
                        disabled={isPending}
                        className="text-xs bg-[#1a2e4a] text-white px-3 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 보기 모드 */
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-500">{f.author.name}</span>
                      <span className="text-[10px] text-gray-400 ml-auto font-mono">{daysAgo(f.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.content}</p>
                    {canModify(f) && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => startEdit(f)}
                          className="text-[11px] text-gray-400 hover:text-[#1a2e4a] transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDelete(f.id)}
                          disabled={isPending}
                          className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
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
