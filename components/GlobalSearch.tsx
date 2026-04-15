"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";

type ClientResult = {
  id: number;
  name: string;
  ceoName: string | null;
  bizNumber: string | null;
  clientType: string;
};

type BookmarkResult = {
  id: number;
  name: string;
  url: string;
  scope: string;
  category: string | null;
  usageCount: number;
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 키보드 단축키: / 또는 Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if ((e.ctrlKey && e.key === "k") || (e.key === "/" && !isTyping)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // 검색 디바운스
  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setClients(data.clients ?? []);
      setBookmarks(data.bookmarks ?? []);
    } catch {
      setClients([]);
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 150);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, open, search]);

  // 열릴 때 초기 로드
  useEffect(() => {
    if (open) {
      setQuery("");
      search("");
    }
  }, [open, search]);

  function handleSelectClient(clientId: number) {
    setOpen(false);
    router.push(`/clients/${clientId}/edit`);
  }

  function handleSelectBookmark(bookmark: BookmarkResult) {
    setOpen(false);
    // 사용 횟수 증가 (fire-and-forget)
    fetch(`/api/search/bookmark-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookmark.id }),
    }).catch(() => {});
    window.open(bookmark.url, "_blank", "noopener,noreferrer");
  }

  const hasResults = clients.length > 0 || bookmarks.length > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* 팔레트 */}
      <div
        className="relative w-full max-w-[560px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          shouldFilter={false}
        >
          {/* 검색 입력 */}
          <div className="flex items-center px-4 border-b border-gray-100">
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="거래처, 사이트 검색..."
              className="w-full px-3 py-4 text-[15px] text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-gray-400 bg-gray-100 rounded-md border border-gray-200">
              ESC
            </kbd>
          </div>

          {/* 결과 */}
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            {loading && (
              <Command.Loading>
                <div className="py-8 text-center text-sm text-gray-400">검색 중...</div>
              </Command.Loading>
            )}

            {!loading && !hasResults && (
              <div className="py-8 text-center text-sm text-gray-400">
                검색 결과가 없습니다
              </div>
            )}

            {/* 외부 사이트 */}
            {bookmarks.length > 0 && (
              <Command.Group heading={
                <span className="px-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  외부 사이트
                </span>
              }>
                {bookmarks.map((bm) => (
                  <Command.Item
                    key={`bm-${bm.id}`}
                    value={`bookmark-${bm.name}-${bm.id}`}
                    onSelect={() => handleSelectBookmark(bm)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#1a2e4a] data-[selected=true]:text-white group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 group-data-[selected=true]:bg-white/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-blue-500 group-data-[selected=true]:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{bm.name}</div>
                      <div className="text-xs text-gray-400 group-data-[selected=true]:text-white/60 truncate">
                        {bm.url.replace(/^https?:\/\//, "").split("/")[0]}
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                      bm.scope === "shared"
                        ? "bg-gray-100 text-gray-500 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white/70"
                        : "bg-purple-50 text-purple-500 group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white/70"
                    }`}>
                      {bm.scope === "shared" ? "공통" : "개인"}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* 거래처 */}
            {clients.length > 0 && (
              <Command.Group heading={
                <span className="px-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  거래처
                </span>
              }>
                {clients.map((client) => (
                  <Command.Item
                    key={client.id}
                    value={`${client.name}-${client.id}`}
                    onSelect={() => handleSelectClient(client.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#1a2e4a] data-[selected=true]:text-white group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 group-data-[selected=true]:bg-white/20 flex items-center justify-center text-xs font-medium text-gray-500 group-data-[selected=true]:text-white shrink-0">
                      {client.clientType === "corporate" ? "법" : "개"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{client.name}</div>
                      <div className="text-xs text-gray-400 group-data-[selected=true]:text-white/60 truncate">
                        {[client.ceoName, client.bizNumber].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-data-[selected=true]:text-white/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* 하단 힌트 */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">↑↓</kbd>
              <span>이동</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">Enter</kbd>
              <span>선택</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">/</kbd>
              <span>검색 열기</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
