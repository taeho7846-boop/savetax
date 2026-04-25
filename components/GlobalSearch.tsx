"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { IncomeTaxCalcModal } from "./IncomeTaxCalcModal";
import { BizTaxCalcModal } from "./BizTaxCalcModal";
import { BuildingIcon } from "@/components/icons";

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

type Action = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  path?: (id: number) => string;
  custom?: boolean;
};

const ACTIONS: Action[] = [
  { key: "수정", label: "수정", desc: "거래처 정보 수정", icon: "✏️", path: (id: number) => `/clients/${id}/edit` },
  { key: "메모", label: "메모", desc: "메모 작성", icon: "📝", path: (id: number) => `/memos/new?clientId=${id}` },
  { key: "히스토리", label: "히스토리", desc: "업무/메모 히스토리", icon: "📋", path: (id: number) => `/clients/${id}?tab=history` },
  { key: "원천세", label: "원천세", desc: "원천세 현황", icon: "🧾", path: () => `/withholding` },
  { key: "종소세", label: "종합소득세", desc: "종합소득세 현황", icon: "📑", path: () => `/income-tax` },
  { key: "자료", label: "자료수집", desc: "자료수집 현황", icon: "📥", path: () => `/data-collect` },
  { key: "로그인", label: "홈택스 로그인", desc: "홈택스 자동 로그인 (새 탭)", icon: "🔐", custom: true },
  { key: "드라이브", label: "구글드라이브", desc: "거래처 자료 폴더 열기 (새 탭)", icon: "📁", custom: true },
];

// 사이드바 메뉴 (내부 페이지)
const MENUS = [
  { name: "대시보드", keywords: "대시보드, dashboard, 홈", icon: "📊", path: "/dashboard" },
  { name: "고객사관리", keywords: "고객사, 거래처, clients", icon: "🏢", path: "/clients" },
  { name: "신규수임", keywords: "신규수임, 수임, commission", icon: "📋", path: "/commission" },
  { name: "신고대리", keywords: "신고대리, 신고, 대리", icon: "📄", path: "/tax-agency" },
  { name: "원천세", keywords: "원천세, 원천, withholding", icon: "🧾", path: "/withholding" },
  { name: "종합소득세", keywords: "종합소득세, 종소세, income-tax", icon: "📑", path: "/income-tax" },
  { name: "채권관리", keywords: "채권, 미수납, receivables", icon: "💰", path: "/receivables" },
  { name: "자료수집", keywords: "자료수집, 자료, data-collect", icon: "📥", path: "/data-collect" },
  { name: "Savetax 배분", keywords: "배분, savetax, distribution", icon: "📊", path: "/distribution" },
  { name: "Savetax 정산", keywords: "정산, settlement", icon: "💵", path: "/settlement" },
  { name: "세무회계태호 배분", keywords: "태호, 배분, taeho", icon: "📊", path: "/distribution-taeho" },
  { name: "수익추이", keywords: "수익, 추이, revenue", icon: "📈", path: "/revenue" },
  { name: "스케줄", keywords: "스케줄, 일정, schedule", icon: "📅", path: "/schedule" },
  { name: "업무/메모", keywords: "업무, 메모, tasks", icon: "🗓️", path: "/tasks" },
  { name: "직원관리", keywords: "직원, 스탭, staff", icon: "👥", path: "/staff" },
  { name: "설정", keywords: "설정, settings", icon: "⚙️", path: "/settings" },
];

// 빌트인 도구 (모달)
const TOOLS = [
  { name: "근로소득세 계산기", keywords: "근로소득세, 계산기, 급여, 세금, 원천세, tax calculator", icon: "🧮", key: "income-tax-calc" },
  { name: "사업소득세 계산기", keywords: "사업소득세, 종합소득세, 종소세, 사업소득, 계산기, 가공경비", icon: "📊", key: "biz-tax-calc" },
];

// 빌트인 외부 사이트 (검색어로 필터)
const BUILTIN_SITES = [
  { name: "세무대리인 홈택스 로그인", keywords: "세무대리인, 홈택스, 로그인, agent", url: "", group: "홈택스", agentLogin: true },
  { name: "위멤버스 로그인", keywords: "위멤버스, wemembers, 로그인", url: "https://www.wemembers.net/login_0001_01.act", group: "위멤버스", autoLogin: true },
  { name: "위멤버스 수임처", keywords: "위멤버스, 수임처", url: "https://tax.appplay.co.kr/outs_0003_01.act", group: "위멤버스" },
  { name: "위멤버스 급여관리", keywords: "위멤버스, 급여, 급여관리", url: "https://tax.appplay.co.kr/salm_0000_01.act", group: "위멤버스" },
  { name: "위멤버스 부가세", keywords: "위멤버스, 부가세, 부가가치세", url: "https://tax.appplay.co.kr/htax_0000_00.act", group: "위멤버스" },
  { name: "위멤버스 법인세", keywords: "위멤버스, 법인세", url: "https://tax.appplay.co.kr/txcp_main.act", group: "위멤버스" },
  { name: "위멤버스 종합소득세", keywords: "위멤버스, 종소세, 종합소득세", url: "https://tax.appplay.co.kr/trcc_0000_00.act", group: "위멤버스" },
  { name: "위멤버스 4대보험", keywords: "위멤버스, 4대보험, 사대보험", url: "https://tax.appplay.co.kr/outs_0000_00.act", group: "위멤버스" },
  { name: "위멤버스 세모리포트", keywords: "위멤버스, 세모리포트, 세모, 리포트", url: "https://reportmgmt.appplay.co.kr/main_dash_001.act", group: "위멤버스" },
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClient>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
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
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("savetax-open-global-search", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("savetax-open-global-search", onOpenEvent);
    };
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

  // 홈택스 로그인
  async function doHometaxLogin(clientId: number) {
    try {
      const res = await fetch("/api/automation/hometax-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "로그인 정보를 가져올 수 없습니다");
        return;
      }
      const isCorp = !!data.agentNumber;
      const credData: Record<string, string> = {
        mode: isCorp ? "corp_login" : "login",
        id: data.hometaxId,
        pw: data.hometaxPw,
        rn: data.residentNumber,
      };
      if (isCorp) {
        credData.certName = data.certName;
        credData.certPw = data.certPw;
        credData.agentNumber = data.agentNumber;
        credData.agentPw = data.hometaxPw;
      }
      const creds = btoa(unescape(encodeURIComponent(JSON.stringify(credData)))).replace(/=/g, "");
      window.open(
        `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
        "_blank"
      );
    } catch {
      alert("네트워크 오류가 발생했습니다");
    }
  }

  // 구글드라이브 열기 — 로컬 기본 경로 설정 시 파일탐색기, 아니면 웹 드라이브
  async function openClientDrive(clientId: number, clientName: string) {
    const basePath = typeof window !== "undefined" ? localStorage.getItem("savetax-drive-base-path") : null;
    if (basePath) {
      const sep = basePath.endsWith("\\") ? "" : "\\";
      const fullPath = `${basePath}${sep}${clientName}`;
      window.location.href = `savetax-app://folder?path=${encodeURIComponent(fullPath)}`;
      return;
    }
    try {
      const res = await fetch(`/api/clients/${clientId}/drive-folder`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        alert("구글드라이브 폴더가 설정되지 않았습니다");
      }
    } catch {
      alert("네트워크 오류");
    }
  }

  // 액션 실행
  function handleSelectAction(action: Action) {
    if (!selectedClient) return;
    setOpen(false);
    if (action.custom && action.key === "로그인") {
      doHometaxLogin(selectedClient.id);
    } else if (action.custom && action.key === "드라이브") {
      openClientDrive(selectedClient.id, selectedClient.name);
    } else if (action.path) {
      router.push(action.path(selectedClient.id));
    }
    setSelectedClient(null);
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

  async function handleSelectBuiltinSite(site: any) {
    setOpen(false);
    if (site.agentLogin) {
      // 세무대리인 홈택스 로그인
      try {
        const res = await fetch("/api/settings/agent-credentials");
        const data = await res.json();
        if (data.id && data.pw) {
          const isCorp = !!data.agentNumber;
          const credData: Record<string, string> = {
            mode: isCorp ? "corp_login" : "login",
            id: data.id,
            pw: data.pw,
            certName: data.certName || "",
            certPw: data.certPw || "",
          };
          if (isCorp) {
            credData.agentNumber = data.agentNumber;
            credData.agentPw = data.pw;
          }
          const creds = btoa(unescape(encodeURIComponent(JSON.stringify(credData)))).replace(/=/g, "");
          window.open(
            `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
            "_blank"
          );
          return;
        }
        alert("세무대리인 홈택스 계정이 설정되지 않았습니다");
      } catch {
        alert("네트워크 오류");
      }
    } else if (site.autoLogin) {
      // 위멤버스 자동 로그인
      try {
        const res = await fetch("/api/settings/wemembers-credentials");
        const data = await res.json();
        if (data.id && data.pw) {
          const creds = btoa(unescape(encodeURIComponent(JSON.stringify({ id: data.id, pw: data.pw }))));
          window.open(site.url + "#savetax=" + creds, "_blank");
          return;
        }
      } catch {}
      window.open(site.url, "_blank", "noopener,noreferrer");
    } else {
      window.open(site.url, "_blank", "noopener,noreferrer");
    }
  }

  // 메뉴 필터 (액션 모드가 아닐 때)
  const filteredMenus = !isActionMode && query.trim()
    ? MENUS.filter((m) => {
        const q = query.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.keywords.toLowerCase().includes(q);
      })
    : [];

  // 빌트인 사이트 필터 (액션 모드가 아닐 때)
  const filteredBuiltinSites = !isActionMode && query.trim()
    ? BUILTIN_SITES.filter((s) => {
        const q = query.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.keywords.toLowerCase().includes(q);
      })
    : [];

  // 도구 필터
  const filteredTools = !isActionMode && query.trim()
    ? TOOLS.filter((t) => {
        const q = query.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.keywords.toLowerCase().includes(q);
      })
    : [];

  const hasResults = clients.length > 0 || bookmarks.length > 0 || filteredBuiltinSites.length > 0 || filteredMenus.length > 0 || filteredTools.length > 0;

  if (!open && !activeTool) return null;

  if (activeTool === "income-tax-calc") {
    return <IncomeTaxCalcModal onClose={() => setActiveTool(null)} />;
  }
  if (activeTool === "biz-tax-calc") {
    return <BizTaxCalcModal onClose={() => setActiveTool(null)} />;
  }

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
          className="bg-white rounded-2xl shadow-2xl border border-[#E5E8EB] overflow-hidden"
          shouldFilter={false}
          onKeyDown={(e) => {
            // Space로 거래처 선택 → 액션 모드 (일반 모드일 때만)
            if (e.key === " " && !isActionMode && clients.length > 0 && query.trim()) {
              const selected = document.querySelector('[cmdk-item][data-selected="true"]');
              const clientId = selected?.getAttribute("data-client-id");
              if (clientId) {
                e.preventDefault();
                const client = clients.find((c) => c.id === parseInt(clientId));
                if (client) handleTabSelect(client);
              }
            }
          }}
        >
          {/* 검색 입력 */}
          <div className="flex items-center px-4 border-b border-[#F2F4F6]">
            <svg className="w-5 h-5 text-[#8B95A1] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {isActionMode && (
              <span className="ml-2 px-2 py-0.5 bg-[#3182F6] text-white text-xs rounded-md shrink-0">
                {selectedClient!.name}
              </span>
            )}
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={handleQueryChange}
              placeholder={isActionMode ? "액션 입력... (수정, 메모, 원천세...)" : "거래처, 사이트 검색..."}
              className="w-full px-3 py-4 text-[15px] text-[#191F28] placeholder-gray-400 outline-none bg-transparent"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-[#8B95A1] bg-[#F2F4F6] rounded-md border border-[#E5E8EB]">
              ESC
            </kbd>
          </div>

          {/* 결과 */}
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            {loading && !isActionMode && (
              <Command.Loading>
                <div className="py-8 text-center text-sm text-[#8B95A1]">검색 중...</div>
              </Command.Loading>
            )}

            {/* === 액션 모드 === */}
            {isActionMode && (
              <Command.Group heading={
                <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                  {selectedClient!.name} 액션
                </span>
              }>
                {filteredActions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[#8B95A1]">일치하는 액션이 없습니다</div>
                ) : (
                  filteredActions.map((action) => (
                    <Command.Item
                      key={action.key}
                      value={`action-${action.key}`}
                      onSelect={() => handleSelectAction(action)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#F2F4F6] group-data-[selected=true]:bg-white/20 flex items-center justify-center text-base shrink-0">
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{action.label}</div>
                        <div className="text-xs text-[#8B95A1] group-data-[selected=true]:text-white/60">
                          {action.desc}
                        </div>
                      </div>
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-[#F2F4F6] group-data-[selected=true]:bg-white/20 rounded text-[#8B95A1] group-data-[selected=true]:text-white/60">
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
                  <div className="py-8 text-center text-sm text-[#8B95A1]">
                    검색 결과가 없습니다
                  </div>
                )}

                {/* 메뉴 */}
                {filteredMenus.length > 0 && (
                  <Command.Group heading={
                    <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                      메뉴
                    </span>
                  }>
                    {filteredMenus.map((menu) => (
                      <Command.Item
                        key={menu.path}
                        value={`menu-${menu.name}`}
                        onSelect={() => { setOpen(false); router.push(menu.path); }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#F2F4F6] group-data-[selected=true]:bg-white/20 flex items-center justify-center text-base shrink-0">
                          {menu.icon}
                        </div>
                        <div className="font-medium">{menu.name}</div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* 도구 */}
                {filteredTools.length > 0 && (
                  <Command.Group heading={
                    <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                      도구
                    </span>
                  }>
                    {filteredTools.map((tool) => (
                      <Command.Item
                        key={tool.key}
                        value={`tool-${tool.key}`}
                        onSelect={() => { setOpen(false); setActiveTool(tool.key); }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] group-data-[selected=true]:bg-white/20 flex items-center justify-center text-base shrink-0">
                          {tool.icon}
                        </div>
                        <div className="font-medium">{tool.name}</div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* 빌트인 사이트 (위멤버스 등) */}
                {filteredBuiltinSites.length > 0 && (
                  <Command.Group heading={
                    <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                      위멤버스
                    </span>
                  }>
                    {filteredBuiltinSites.map((site) => (
                      <Command.Item
                        key={site.url}
                        value={`builtin-${site.name}`}
                        onSelect={() => handleSelectBuiltinSite(site)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 group-data-[selected=true]:bg-white/20 flex items-center justify-center shrink-0">
                          <BuildingIcon width={14} height={14} className="text-[#3182F6] group-data-[selected=true]:text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{site.name}</div>
                          <div className="text-xs text-[#8B95A1] group-data-[selected=true]:text-white/60 truncate">
                            {site.url.replace(/^https?:\/\//, "").split("/")[0]}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-[#B0B8C1] group-data-[selected=true]:text-white/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* 외부 사이트 (북마크) */}
                {bookmarks.length > 0 && (
                  <Command.Group heading={
                    <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                      외부 사이트
                    </span>
                  }>
                    {bookmarks.map((bm) => (
                      <Command.Item
                        key={`bm-${bm.id}`}
                        value={`bookmark-${bm.name}-${bm.id}`}
                        onSelect={() => handleSelectBookmark(bm)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#F5F9FF] group-data-[selected=true]:bg-white/20 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[#3182F6] group-data-[selected=true]:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{bm.name}</div>
                          <div className="text-xs text-[#8B95A1] group-data-[selected=true]:text-white/60 truncate">
                            {bm.url.replace(/^https?:\/\//, "").split("/")[0]}
                          </div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          bm.scope === "shared"
                            ? "bg-[#F2F4F6] text-[#6B7684] group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white/70"
                            : "bg-[#F5F9FF] text-[#3182F6] group-data-[selected=true]:bg-white/20 group-data-[selected=true]:text-white/70"
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
                    <span className="px-2 text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider">
                      거래처 <span className="text-[#B0B8C1] font-normal ml-1">Space로 액션 선택</span>
                    </span>
                  }>
                    {clients.map((client) => (
                      <Command.Item
                        key={client.id}
                        value={`${client.name}-${client.id}`}
                        data-client-id={client.id}
                        onSelect={() => handleSelectClient(client.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors data-[selected=true]:bg-[#3182F6] data-[selected=true]:text-white group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#F2F4F6] group-data-[selected=true]:bg-white/20 flex items-center justify-center text-xs font-medium text-[#6B7684] group-data-[selected=true]:text-white shrink-0">
                          {client.clientType === "corporate" ? "법" : "개"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{client.name}</div>
                          <div className="text-xs text-[#8B95A1] group-data-[selected=true]:text-white/60 truncate">
                            {[client.ceoName, client.bizNumber].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <kbd className="text-[10px] px-1.5 py-0.5 bg-[#F2F4F6] group-data-[selected=true]:bg-white/20 rounded text-[#B0B8C1] group-data-[selected=true]:text-white/40">
                            Space
                          </kbd>
                          <svg className="w-4 h-4 text-[#B0B8C1] group-data-[selected=true]:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#F2F4F6] bg-[#F9FAFB]/50">
            <div className="flex items-center gap-1.5 text-[11px] text-[#8B95A1]">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-[#E5E8EB] text-[10px] font-medium">↑↓</kbd>
              <span>이동</span>
            </div>
            {!isActionMode && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#8B95A1]">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-[#E5E8EB] text-[10px] font-medium">Space</kbd>
                <span>액션 선택</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-[#8B95A1]">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-[#E5E8EB] text-[10px] font-medium">Enter</kbd>
              <span>{isActionMode ? "실행" : "바로 이동"}</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
