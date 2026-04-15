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

type SelectedClient = { id: number; name: string } | null;

const ACTIONS = [
  { key: "수정", label: "수정", desc: "거래처 정보 수정", icon: "✏️", path: (id: number) => `/clients/${id}/edit` },
  { key: "메모", label: "메모", desc: "메모 작성", icon: "📝", path: (id: number) => `/memos/new?clientId=${id}` },
  { key: "히스토리", label: "히스토리", desc: "업무/메모 히스토리", icon: "📋", path: (id: number) => `/clients/${id}?tab=history` },
  { key: "원천세", label: "원천세", desc: "원천세 현황", icon: "🧾", path: (_id: number) => `/withholding` },
  { key: "종소세", label: "종합소득세", desc: "종합소득세 현황", icon: "📑", path: (_id: number) => `/income-tax` },
  { key: "자료", label: "자료수집", desc: "자료수집 현황", icon: "📥", path: (_id: number) => `/data-collect` },
  { key: "로그인", label: "홈택스 로그인", desc: "홈택스 자동 로그인", icon: "🔐", path: (id: number) => `/clients/${id}?action=hometax-login` },
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClient>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 액션 모드: 거래처가 선택된 상태
  const isActionMode = selectedClient !== null;
  const actionQuery = isActionMode ? query.slice(selectedClient!.name.length).trim() : "";
  const filteredActions = isActionMode
    ? ACTIONS.filter((a) => !actionQuery || a.key.includes(actionQuery) || a.label.includes(actionQuery))
    : [];

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

  // 검색 디바운스 (액션 모드가 아닐 때만)
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
    if (!open || isActionMode) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(query), 150);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, open, search, isActionMode]);

  // 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedClient(null);
      search("");
    }
  }, [open, search]);

  // 액션 모드에서 Backspace로 거래처명 지우면 일반 모드로 복귀
  function handleQueryChange(val: string) {
    if (isActionMode && !val.startsWith(selectedClient!.name)) {
      setSelectedClient(null);
      setQuery(val);
      return;
    }
    setQuery(val);
  }

  // Tab으로 거래처 선택 → 액션 모드 진입
  function handleTabSelect(client: ClientResult) {
    setSelectedClient({ id: client.id, name: client.name });
    setQuery(client.name + " ");
    // 포커스를 입력창 끝으로
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  // 거래처 직접 선택 (Enter) → 수정 페이지로 이동
  function handleSelectClient(clientId: number) {
    setOpen(false);
    setSelectedClient(null);
    router.push(`/clients/${clientId}/edit`);
  }

  // 액션 실행
  function handleSelectAction(action: typeof ACTIONS[0]) {
    if (!selectedClient) return;
    setOpen(false);
    const path = action.path(selectedClient.id);
    setSelectedClient(null);
    router.push(path);
  }

  function handleSelectBookmark(bookmark: BookmarkResult) {
    setOpen(false);
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
      onClick={() => { setOpen(false); setSelectedClient(null); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-[560px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          shouldFilter={false}
          onKeyDown={(e) => {
            // Tab으로 거래처 선택 (액션 모드가 아닐 때)
            if (e.key === "Tab" && !isActionMode && clients.length > 0) {
              e.preventDefault();
              // 현재 하이라이트된 거래처 찾기
              const selected = document.querySelector('[cmdk-item][data-selected="true"]');
              const clientId = selected?.getAttribute("data-client-id");
              if (clientId) {
                const client = clients.find((c) => c.id === parseInt(clientId));
                if (client) handleTabSelect(client);
              } else {
                // 첫 번째 거래처 선택
                if (clients[0]) handleTabSelect(clients[0]);
              }
            }
          }}
        >
          {/* 검색 입력 */}
          <div className="flex items-center px-4 border-b border-gray-100">
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {isActionMode && (
              <span className="ml-2 px-2 py-0.5 bg-[#1a2e4a] text-white text-xs rounded-md shrink-0">
                {selectedClient!.name}
              </span>
            )}
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={handleQueryChange}
              placeholder={isActionMode ? "액션 입력... (수정, 메모, 원천세...)" : "거래처, 사이트 검색..."}
              className="w-full px-3 py-4 text-[15px] text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-gray-400 bg-gray-100 rounded-md border border-gray-200">
              ESC
            </kbd>
          </div>

          {/* 결과 */}
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            {loading && !isActionMode && (
              <Command.Loading>
                <div className="py-8 text-center text-sm text-gray-400">검색 중...</div>
              </Command.Loading>
            )}

            {/* === 액션 모드 === */}
            {isActionMode && (
              <Command.Group heading={
                <span className="px-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {selectedClient!.name} 액션
                </span>
              }>
                {filteredActions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">일치하는 액션이 없습니다</div>
                ) : (
                  filteredActions.map((action) => (
                    <Command.Item
                      key={action.key}
                      value={`action-${action.key}`}
                      onSelect={() => handleSelectAction(action)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#1a2e4a] data-[selected=true]:text-white group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 group-data-[selected=true]:bg-white/20 flex items-center justify-center text-base shrink-0">
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-gray-400 group-data-[selected=true]:text-white/60">
                          {action.desc}
                        </div>
                      </div>
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 group-data-[selected=true]:bg-white/20 rounded text-gray-400 group-data-[selected=true]:text-white/60">
                        {action.key}
                      </kbd>
                    </Command.Item>
                  ))
                )}
              </Command.Group>
            )}

            {/* === 일반 모드 === */}
            {!isActionMode && (
              <>
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
                      거래처 <span className="text-gray-300 font-normal ml-1">Tab으로 액션 선택</span>
                    </span>
                  }>
                    {clients.map((client) => (
                      <Command.Item
                        key={client.id}
                        value={`${client.name}-${client.id}`}
                        data-client-id={client.id}
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
                        <div className="flex items-center gap-1 shrink-0">
                          <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-100 group-data-[selected=true]:bg-white/20 rounded text-gray-300 group-data-[selected=true]:text-white/40">
                            Tab
                          </kbd>
                          <svg className="w-4 h-4 text-gray-300 group-data-[selected=true]:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>

          {/* 하단 힌트 */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">↑↓</kbd>
              <span>이동</span>
            </div>
            {!isActionMode && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">Tab</kbd>
                <span>액션 선택</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-medium">Enter</kbd>
              <span>{isActionMode ? "실행" : "바로 이동"}</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
