"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotice, updateNotice, deleteNotice, togglePin } from "@/app/actions/notice";
import { PinIcon, CheckIcon, ClipboardListIcon } from "@/components/icons";

type Notice = {
  id: number;
  authorId: number;
  author: { name: string };
  category: string;
  subCategory: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date | string;
};

const CATEGORIES = [
  { value: "template", label: "템플릿", icon: "📋", color: "bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]" },
  { value: "reference", label: "본점자료", icon: "📁", color: "bg-[#ecfdf5] text-[#065f46] border-[rgba(16,185,129,0.25)]" },
];

const SUB_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  template: [
    { value: "부가세", label: "부가세" },
    { value: "종소세", label: "종소세" },
    { value: "원천세", label: "원천세" },
    { value: "4대보험", label: "4대보험" },
    { value: "기타", label: "기타" },
  ],
  reference: [
    { value: "안내문", label: "안내문" },
    { value: "링크", label: "링크" },
    { value: "세법", label: "세법 개정" },
  ],
};

function Linkify({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#1e40af] hover:underline break-all">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function timeAgo(date: Date | string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return new Date(date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function NoticeBoard({
  notices,
  currentUserId,
  currentUserRole,
}: {
  notices: Notice[];
  currentUserId: number;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

  // 수정 상태
  const [editCategory, setEditCategory] = useState("template");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const filtered = notices.filter((n) => {
    if (filter && n.category !== filter) return false;
    if (subFilter && n.subCategory !== subFilter) return false;
    return true;
  });

  const canModify = (n: Notice) => n.authorId === currentUserId || currentUserRole === "owner";

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createNotice(formData);
      setShowForm(false);
    });
  }

  function startEdit(n: Notice) {
    setEditingId(n.id);
    setEditCategory(n.category);
    setEditSubCategory(n.subCategory || "");
    setEditTitle(n.title);
    setEditContent(n.content);
  }

  function handleUpdate(id: number) {
    const fd = new FormData();
    fd.set("category", editCategory);
    fd.set("subCategory", editSubCategory);
    fd.set("title", editTitle);
    fd.set("content", editContent);
    startTransition(async () => {
      await updateNotice(id, fd);
      setEditingId(null);
    });
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(async () => { await deleteNotice(id); });
  }

  function handleTogglePin(id: number) {
    startTransition(async () => { await togglePin(id); });
  }

  function handleCopy(content: string, id: number) {
    // HTTP 환경 fallback
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content).catch(() => fallbackCopy(content));
    } else {
      fallbackCopy(content);
    }
    setCopyFeedback(id);
    setTimeout(() => setCopyFeedback(null), 1500);
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  return (
    <div>
      {/* 상단: 필터 + 등록 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => { setFilter(null); setSubFilter(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-[500] transition-all ${
              !filter ? "bg-[#3182F6] text-white" : "bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
            }`}
          >
            전체 {notices.length}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setFilter(filter === cat.value ? null : cat.value); setSubFilter(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-[500] transition-all flex items-center gap-1 ${
                filter === cat.value ? "bg-[#3182F6] text-white" : "bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
              }`}
            >
              {cat.icon} {cat.label} {notices.filter(n => n.category === cat.value).length}
            </button>
          ))}

          {/* 서브 필터 */}
          {filter && SUB_CATEGORIES[filter] && (
            <>
              <span className="text-[#8B95A1] mx-1">|</span>
              {SUB_CATEGORIES[filter].map((sub) => (
                <button
                  key={sub.value}
                  onClick={() => setSubFilter(subFilter === sub.value ? null : sub.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-[500] transition-all ${
                    subFilter === sub.value ? "bg-[#f7f8f8] text-[#0b0d10]" : "bg-[#F9FAFB] text-[#6B7684] hover:bg-[#F9FAFB]"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </>
          )}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#3182F6] text-white px-4 py-2 rounded-[6px] hover:bg-[#1B64DA] transition-colors"
        >
          {showForm ? "취소" : "+ 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form action={handleCreate} className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] p-5 mb-5">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">카테고리</label>
              <select name="category" defaultValue="template" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">세부 분류</label>
              <select name="subCategory" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none">
                <option value="">선택 안 함</option>
                {Object.values(SUB_CATEGORIES).flat().map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">제목</label>
              <input name="title" required placeholder="제목 입력" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#6B7684] mb-1">내용</label>
            <textarea name="content" required rows={5} placeholder="내용 입력 (템플릿의 경우 복사할 텍스트를 그대로 입력)" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none" />
          </div>
          <button type="submit" disabled={isPending} className="bg-[#3182F6] text-white text-sm px-5 py-2 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50">
            등록
          </button>
        </form>
      )}

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#8B95A1] text-sm">등록된 항목이 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((n) => {
            const cat = CATEGORIES.find(c => c.value === n.category);
            const isExpanded = expandedId === n.id;
            const isEditing = editingId === n.id;

            return (
              <div key={n.id} className={`bg-white rounded-[14px] border transition-all ${n.isPinned ? "border-[rgba(245,158,11,0.35)]" : "border-[#E5E8EB] hover:border-[#D1D6DB]"}`}>
                {isEditing ? (
                  /* 수정 모드 */
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]">
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <select value={editSubCategory} onChange={(e) => setEditSubCategory(e.target.value)} className="bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]">
                        <option value="">선택 안 함</option>
                        {(SUB_CATEGORIES[editCategory] || []).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]" />
                    </div>
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] resize-none mb-3" />
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(n.id)} disabled={isPending} className="text-xs bg-[#3182F6] text-white px-4 py-1.5 rounded-[6px] hover:bg-[#1B64DA]">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-[#6B7684] px-4 py-1.5">취소</button>
                    </div>
                  </div>
                ) : (
                  /* 보기 모드 */
                  <>
                    <div
                      className="flex items-center gap-3 px-5 py-3.5 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : n.id)}
                    >
                      {/* 핀 */}
                      {n.isPinned && <PinIcon width={14} height={14} className="text-[#92400e]" />}

                      {/* 카테고리 뱃지 */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-[500] border ${cat?.color ?? "bg-white text-[#4E5968] border-[#E5E8EB]"}`}>
                        {cat?.icon} {cat?.label}
                      </span>

                      {/* 서브 카테고리 */}
                      {n.subCategory && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#4E5968]">
                          {n.subCategory}
                        </span>
                      )}

                      {/* 제목 */}
                      <span className="text-sm font-[500] text-[#191F28] flex-1 truncate">{n.title}</span>

                      {/* 메타 */}
                      <span className="text-[10px] text-[#8B95A1] shrink-0">{n.author.name}</span>
                      <span className="text-[10px] text-[#8B95A1] shrink-0">{timeAgo(n.createdAt)}</span>

                      {/* 확장 아이콘 */}
                      <svg className={`w-4 h-4 text-[#8B95A1] transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* 확장 내용 */}
                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-[#E5E8EB] pt-3">
                        <div className="bg-[#F9FAFB] rounded-[6px] px-4 py-3 text-sm text-[#4E5968] whitespace-pre-wrap mb-3">
                          <Linkify text={n.content} />
                        </div>
                        <div className="flex items-center gap-2">
                          {/* 복사 버튼 */}
                          <button
                            onClick={() => handleCopy(n.content, n.id)}
                            className={`text-xs px-3 py-1.5 rounded-[6px] font-[500] transition-all ${
                              copyFeedback === n.id
                                ? "bg-[#ecfdf5] text-[#065f46]"
                                : "bg-[#eff6ff] text-[#1e40af] hover:bg-[rgba(59,130,246,0.18)]"
                            }`}
                          >
                            {copyFeedback === n.id ? (
                              <span className="inline-flex items-center gap-1"><CheckIcon width={12} height={12} /> 복사됨</span>
                            ) : (
                              <span className="inline-flex items-center gap-1"><ClipboardListIcon width={12} height={12} /> 내용 복사</span>
                            )}
                          </button>

                          {canModify(n) && (
                            <>
                              <button onClick={() => startEdit(n)} className="text-[11px] text-[#8B95A1] hover:text-[#191F28] px-2 py-1.5">수정</button>
                              <button onClick={() => handleDelete(n.id)} disabled={isPending} className="text-[11px] text-[#8B95A1] hover:text-[#dc2626] px-2 py-1.5">삭제</button>
                              {(currentUserRole === "owner" || currentUserRole === "admin") && (
                                <button onClick={() => handleTogglePin(n.id)} className="text-[11px] text-[#8B95A1] hover:text-[#92400e] px-2 py-1.5">
                                  {n.isPinned ? "📌 고정 해제" : "📌 고정"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
