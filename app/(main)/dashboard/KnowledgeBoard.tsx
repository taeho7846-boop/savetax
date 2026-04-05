"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createKnowledge, updateKnowledge, deleteKnowledge } from "@/app/actions/knowledge";

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
  { value: "4대보험", icon: "🏥", color: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "세율", icon: "📊", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "기준", icon: "📏", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "서식", icon: "📄", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "절차", icon: "🔄", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "기타", icon: "💡", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

function Linkify({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function KnowledgeBoard({
  items,
  currentUserId,
  currentUserRole,
}: {
  items: KnowledgeItem[];
  currentUserId: number;
  currentUserRole: string;
}) {
  const router = useRouter();
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
      const [url, name] = f.split("|");
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
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="키워드로 검색 (예: 피부양자, 세율, 간이과세)"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] bg-white"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !filter ? "bg-[#1a2e4a] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            전체
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter(filter === cat.value ? null : cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === cat.value ? "bg-[#1a2e4a] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {cat.icon} {cat.value}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#1a2e4a] text-white px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors ml-auto"
        >
          {showForm ? "취소" : "+ 등록"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form action={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">카테고리</label>
              <select name="category" defaultValue="기타" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">제목</label>
              <input name="title" required placeholder="예: 피부양자 자격 조건" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">태그 (검색용)</label>
              <input name="tags" placeholder="콤마로 구분" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">내용</label>
            <textarea name="content" required rows={6} placeholder="지식 내용을 정리하세요" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none" />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">첨부파일</label>
            <div className="flex items-center gap-3">
              <label className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploading ? "bg-gray-200 text-gray-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {uploading ? "업로드 중..." : "📎 파일 추가"}
                <input type="file" accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,.hwp" className="hidden" onChange={(e) => handleFileUpload(e, "new")} disabled={uploading} />
              </label>
              <span className="text-[10px] text-gray-400">이미지, PDF, 엑셀, 한글 파일 지원</span>
            </div>
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1 text-xs">
                    {f.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? "🖼️" : "📄"} {f.name}
                    <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="text-blue-400 hover:text-red-500 ml-0.5">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" disabled={isPending} className="bg-[#1a2e4a] text-white text-sm px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50">
            등록
          </button>
        </form>
      )}

      {/* 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📚</div>
          <div className="text-gray-400 text-sm">
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
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-all overflow-hidden">
                {isEditing ? (
                  <div className="p-5">
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                      </select>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                      <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="태그" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none mb-3" />
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(item.id)} disabled={isPending} className="text-xs bg-[#1a2e4a] text-white px-4 py-1.5 rounded-lg">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 px-4 py-1.5">취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="flex items-center gap-3 px-5 py-3.5 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium border ${cat?.color ?? "bg-gray-100 text-gray-600"}`}>
                        {cat?.icon} {item.category}
                      </span>
                      <span className="text-sm font-medium text-gray-800 flex-1">{item.title}</span>

                      {/* 태그 */}
                      {item.tags && (
                        <div className="hidden sm:flex gap-1">
                          {item.tags.split(",").slice(0, 3).map((tag, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      <span className="text-[10px] text-gray-400 shrink-0">
                        {new Date(item.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>

                      <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                        {/* 첨부 이미지 */}
                        {item.files && parseFiles(item.files).some(f => f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) && (
                          <div className="flex flex-wrap gap-3 mb-3">
                            {parseFiles(item.files).filter(f => f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={f.url} alt={f.name} className="max-h-60 rounded-lg border border-gray-200 hover:border-blue-400 transition-colors" />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap mb-3 leading-relaxed">
                          <Linkify text={item.content} />
                        </div>

                        {/* 첨부 파일 (이미지 외) */}
                        {item.files && parseFiles(item.files).some(f => !f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)) && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {parseFiles(item.files).filter(f => !f.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 transition-colors">
                                📄 {f.name}
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(item.content)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                          >
                            📋 복사
                          </button>
                          <span className="text-[10px] text-gray-400">{item.author.name}</span>
                          {canModify(item) && (
                            <>
                              <button onClick={() => startEdit(item)} className="text-[11px] text-gray-400 hover:text-[#1a2e4a] px-2 py-1.5 ml-auto">수정</button>
                              <button onClick={() => handleDelete(item.id)} disabled={isPending} className="text-[11px] text-gray-400 hover:text-red-500 px-2 py-1.5">삭제</button>
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
