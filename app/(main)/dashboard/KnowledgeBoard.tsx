"use client";

import { useState, useTransition } from "react";
import { createKnowledge, updateKnowledge, deleteKnowledge } from "@/app/actions/knowledge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardListIcon, FileTextIcon } from "@/components/icons";

type KnowledgeItem = {
  id: number;
  authorId: number;
  author: { name: string };
  category: string;
  title: string;
  content: string;
  files: string | null;
  tags: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const CATEGORIES = [
  { value: "4대보험", icon: "🏥", color: "bg-[rgba(244,63,94,0.1)] text-[#fda4af] border-[rgba(244,63,94,0.25)]" },
  { value: "세율", icon: "📊", color: "bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]" },
  { value: "기준", icon: "📏", color: "bg-[#fffbeb] text-[#92400e] border-[rgba(245,158,11,0.25)]" },
  { value: "서식", icon: "📄", color: "bg-[#ecfdf5] text-[#065f46] border-[rgba(16,185,129,0.25)]" },
  { value: "절차", icon: "🔄", color: "bg-[rgba(139,92,246,0.1)] text-[#0049BC] border-[rgba(139,92,246,0.25)]" },
  { value: "기타", icon: "💡", color: "bg-white text-[#4E5968] border-[#E5E8EB]" },
];


export function KnowledgeBoard({
  items,
  currentUserId,
  currentUserRole,
}: {
  items: KnowledgeItem[];
  currentUserId: number;
  currentUserRole: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // 수정 상태
  const [editCategory, setEditCategory] = useState("기타");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editFiles, setEditFiles] = useState<{ url: string; name: string }[]>([]);

  const filtered = items.filter((item) => {
    if (filter && item.category !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.tags ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const canModify = (item: KnowledgeItem) => item.authorId === currentUserId || currentUserRole === "owner";

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, target: "new" | "edit") {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        if (target === "new") {
          setUploadedFiles(prev => [...prev, { url: data.url, name: data.name }]);
        } else {
          setEditFiles(prev => [...prev, { url: data.url, name: data.name }]);
        }
      }
    } catch {} finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function handleCreate(formData: FormData) {
    if (uploadedFiles.length > 0) {
      formData.set("files", uploadedFiles.map(f => `${f.url}|${f.name}`).join(","));
    }
    startTransition(async () => {
      await createKnowledge(formData);
      setShowForm(false);
      setUploadedFiles([]);
    });
  }

  function startEdit(item: KnowledgeItem) {
    setEditingId(item.id);
    setEditCategory(item.category);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditTags(item.tags ?? "");
    setEditFiles(parseFiles(item.files));
  }

  function parseFiles(files: string | null): { url: string; name: string }[] {
    if (!files) return [];
    return files.split(",").map(f => {
      const [rawUrl, name] = f.split("|");
      // 기존 /uploads/ URL을 /api/uploads/로 변환
      const url = rawUrl.startsWith("/uploads/") ? `/api${rawUrl}` : rawUrl;
      return { url, name: name || url.split("/").pop() || "파일" };
    });
  }

  function handleUpdate(id: number) {
    const fd = new FormData();
    fd.set("category", editCategory);
    fd.set("title", editTitle);
    fd.set("content", editContent);
    fd.set("tags", editTags);
    fd.set("files", editFiles.map(f => `${f.url}|${f.name}`).join(","));
    startTransition(async () => {
      await updateKnowledge(id, fd);
      setEditingId(null);
    });
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(async () => { await deleteKnowledge(id); });
  }

  function handleCopy(content: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content).catch(() => fallbackCopy(content));
    } else {
      fallbackCopy(content);
    }
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
      {/* 상단: 검색 + 카테고리 + 등록 */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B95A1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="키워드로 검색 (예: 피부양자, 세율, 간이과세)"
            className="w-full pl-10 pr-3 py-2 border border-[#D1D6DB] rounded-[14px] text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] bg-white"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-[500] transition-all ${
              !filter ? "bg-[#3182F6] text-white" : "bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
            }`}
          >
            전체
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(filter === cat.value ? null : cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-[500] transition-all ${
                filter === cat.value ? "bg-[#3182F6] text-white" : "bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
              }`}
            >
              {cat.icon} {cat.value}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#3182F6] text-white px-4 py-2 rounded-[6px] hover:bg-[#1B64DA] transition-colors ml-auto"
        >
          {showForm ? "취소" : "+ 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form action={handleCreate} className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] p-5 mb-5">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">카테고리</label>
              <select name="category" defaultValue="기타" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[#6B7684] mb-1">제목</label>
              <input name="title" required placeholder="예: 피부양자 자격 조건" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">태그 (검색용)</label>
              <input name="tags" placeholder="콤마로 구분" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#6B7684] mb-1">내용</label>
            <textarea name="content" required rows={6} placeholder="지식 내용을 정리하세요" className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none" />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-[#6B7684] mb-1">첨부파일</label>
            <div className="flex items-center gap-3">
              <label className={`text-xs px-3 py-1.5 rounded-[6px] cursor-pointer transition-colors ${uploading ? "bg-[#F9FAFB] text-[#8B95A1]" : "bg-white text-[#4E5968] hover:bg-[#F9FAFB]"}`}>
                {uploading ? "업로드 중..." : "📎 파일 추가"}
                <input type="file" accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,.hwp" className="hidden" onChange={(e) => handleFileUpload(e, "new")} disabled={uploading} />
              </label>
              <span className="text-[10px] text-[#8B95A1]">이미지, PDF, 엑셀, 한글 파일 지원</span>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-[#eff6ff] text-[#1e40af] rounded-[6px] px-2.5 py-1 text-xs">
                    {f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? "🖼️" : "📄"} {f.name}
                    <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="text-[#1e40af] hover:text-[#dc2626] ml-0.5">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" disabled={isPending} className="bg-[#3182F6] text-white text-sm px-5 py-2 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50">
            등록
          </button>
        </form>
      )}

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📚</div>
          <div className="text-[#8B95A1] text-sm">
            {search ? `"${search}" 검색 결과가 없습니다` : "등록된 지식이 없습니다"}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((item) => {
            const cat = CATEGORIES.find(c => c.value === item.category);
            const isExpanded = expandedId === item.id;
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-[#D1D6DB] transition-all overflow-hidden">
                {isEditing ? (
                  <div className="p-5">
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]">
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                      </select>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="col-span-2 bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]" />
                      <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="태그" className="bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28]" />
                    </div>
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6} className="w-full bg-white border border-[#D1D6DB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] resize-none mb-3" />
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(item.id)} disabled={isPending} className="text-xs bg-[#3182F6] text-white px-4 py-1.5 rounded-[6px] hover:bg-[#1B64DA]">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-[#6B7684] px-4 py-1.5">취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="flex items-center gap-3 px-5 py-3.5 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-[500] border ${cat?.color ?? "bg-white text-[#4E5968] border-[#E5E8EB]"}`}>
                        {cat?.icon} {item.category}
                      </span>
                      <span className="text-sm font-[500] text-[#191F28] flex-1">{item.title}</span>

                      {/* 태그 */}
                      {item.tags && (
                        <div className="hidden sm:flex gap-1">
                          {item.tags.split(",").slice(0, 3).map((tag, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#6B7684]">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      <span className="text-[10px] text-[#8B95A1] shrink-0">
                        {new Date(item.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>

                      <svg className={`w-4 h-4 text-[#8B95A1] transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-[#E5E8EB] pt-3">
                        {/* 첨부 이미지 */}
                        {item.files && parseFiles(item.files).some(f => f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) && (
                          <div className="flex flex-wrap gap-3 mb-3">
                            {parseFiles(item.files).filter(f => f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={f.url} alt={f.name} className="max-h-60 rounded-[6px] border border-[#E5E8EB] hover:border-[#5e6ad2] transition-colors" />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="bg-[#F9FAFB] rounded-[6px] px-4 py-3 text-sm text-[#4E5968] mb-3 leading-relaxed prose prose-sm prose-invert max-w-none prose-headings:text-[#191F28] prose-headings:font-bold prose-h2:text-base prose-h3:text-sm prose-table:border-collapse prose-th:bg-[#3182F6] prose-th:text-white prose-th:px-4 prose-th:py-2 prose-th:text-sm prose-th:font-[500] prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-[#E5E8EB] prose-td:text-sm prose-tr:even:bg-[#F9FAFB] prose-strong:text-[#191F28] prose-a:text-[#1e40af] prose-a:no-underline hover:prose-a:underline prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                        </div>

                        {/* 첨부 파일 (이미지 외) */}
                        {item.files && parseFiles(item.files).some(f => !f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {parseFiles(item.files).filter(f => !f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-white hover:bg-[#F9FAFB] rounded-[6px] px-3 py-1.5 text-xs text-[#4E5968] transition-colors">
                                <FileTextIcon width={14} height={14} />
                                {f.name}
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(item.content)}
                            className="text-xs px-3 py-1.5 rounded-[6px] bg-[#eff6ff] text-[#1e40af] hover:bg-[rgba(59,130,246,0.18)] font-[500] inline-flex items-center gap-1"
                          >
                            <ClipboardListIcon width={12} height={12} />
                            복사
                          </button>
                          <span className="text-[10px] text-[#8B95A1]">{item.author.name}</span>
                          {canModify(item) && (
                            <>
                              <button onClick={() => startEdit(item)} className="text-[11px] text-[#8B95A1] hover:text-[#191F28] px-2 py-1.5 ml-auto">수정</button>
                              <button onClick={() => handleDelete(item.id)} disabled={isPending} className="text-[11px] text-[#8B95A1] hover:text-[#dc2626] px-2 py-1.5">삭제</button>
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
