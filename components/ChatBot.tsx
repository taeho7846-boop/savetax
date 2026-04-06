"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = { role: "user" | "assistant"; content: string; image?: string };

export function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하 이미지만 업로드 가능합니다.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImagePreview(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // 드래그 앤 드롭
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하 이미지만 업로드 가능합니다.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // 클립보드 붙여넣기 (Ctrl+V)
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setImageFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
        break;
      }
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function send() {
    if ((!input.trim() && !imagePreview) || loading) return;
    const userMsg = input.trim();
    const currentImage = imagePreview;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg || "📎 이미지 분석 요청", image: currentImage || undefined }]);
    clearImage();
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg || "이 이미지를 분석해주세요.",
          history: messages.map(m => ({ role: m.role, content: m.content })),
          image: currentImage || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* 채팅창 */}
      {open && (
        <div
          className={`fixed bottom-4 left-[240px] w-[600px] h-[780px] bg-white rounded-2xl shadow-2xl border flex flex-col z-50 overflow-hidden transition-colors ${isDragging ? "border-blue-400 border-2" : "border-gray-200"}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 드래그 오버레이 */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-blue-50/90 flex flex-col items-center justify-center rounded-2xl pointer-events-none">
              <div className="text-5xl mb-3">📎</div>
              <div className="text-blue-600 font-semibold text-lg">이미지를 여기에 놓으세요</div>
              <div className="text-blue-400 text-sm mt-1">신분증, 사업자등록증, 계약서 등</div>
            </div>
          )}
          {/* 헤더 */}
          <div className="bg-[#1a2e4a] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm">AI</div>
              <div>
                <div className="text-sm font-medium">세무 AI 어시스턴트</div>
                <div className="text-[10px] text-white/60">지식한입 기반 답변</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([])}
                className="text-white/60 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                title="대화 초기화"
              >
                초기화
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-white/60 hover:text-white text-lg px-1 hover:bg-white/10 rounded transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🤖</div>
                <div className="text-sm text-gray-500 mb-1">세무 AI 어시스턴트입니다</div>
                <div className="text-xs text-gray-400">세무/회계 관련 궁금한 점을 물어보세요</div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                  >
                    📎 사업자등록증으로 거래처 등록
                  </button>
                  {["피부양자 자격요건", "간이과세 기준", "4대보험 요율"].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-[#1a2e4a] text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {msg.image && (
                    <img src={msg.image} alt="업로드 이미지" className="max-w-full max-h-40 rounded-lg mb-2 border border-white/20" />
                  )}
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0 prose-headings:my-1 prose-headings:text-sm prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 입력 */}
          <div className="border-t border-gray-100 px-3 py-2.5 shrink-0">
            {/* 이미지 미리보기 */}
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img src={imagePreview} alt="미리보기" className="max-h-24 rounded-lg border border-gray-200" />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 shadow"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-gray-400 hover:text-[#1a2e4a] px-1.5 py-2 rounded-xl text-lg transition-colors shrink-0 disabled:opacity-40"
                title="이미지 업로드 (사업자등록증, 계약서 등)"
              >
                📎
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                onPaste={handlePaste}
                placeholder={imagePreview ? "이미지에 대한 요청을 입력하세요..." : "질문을 입력하세요... (이미지 붙여넣기 가능)"}
                rows={1}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a] resize-none max-h-24 overflow-y-auto"
                style={{ height: "auto", minHeight: "36px" }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 96) + "px"; }}
              />
              <button
                onClick={send}
                disabled={loading || (!input.trim() && !imagePreview)}
                className="bg-[#1a2e4a] text-white px-3.5 py-2 rounded-xl text-sm hover:bg-[#243d61] disabled:opacity-40 transition-colors shrink-0"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토글 버튼 - 사이드바 하단에서 호출 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <span className="text-lg">🤖</span>
          <span>AI 어시스턴트</span>
        </button>
      )}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#a0c4ff] bg-white/10 rounded-lg transition-colors"
        >
          <span className="text-lg">🤖</span>
          <span>AI 어시스턴트</span>
        </button>
      )}
    </>
  );
}
