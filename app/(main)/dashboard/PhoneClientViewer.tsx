"use client";

import { useState, useEffect, useMemo, useRef, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ClipboardCopyIcon,
  CheckIcon,
  StarIcon,
  StarFilledIcon,
  LandmarkIcon,
  SettingsIcon,
  BookOpenIcon,
  ClockIcon,
  NoteIcon,
  PhotosIcon,
  UploadIcon,
  BotIcon,
  KakaoTalkIcon,
  CalendarIcon,
  PaperclipIcon,
} from "@/components/icons";
import { getSchedules } from "@/app/actions/schedule";

type AppIcon = ComponentType<SVGProps<SVGSVGElement>>;

type ClientMini = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  phone: string | null;
  laborTypes?: string | null;
};

// 검색용 외부 사이트 — 세무대리인 홈택스 로그인만 (나머지는 사용자 북마크에서 처리)
type BuiltinSite = {
  name: string;
  keywords: string;
  url: string;
  group: string;
  agentLogin?: boolean;
  autoLogin?: boolean;
};
const BUILTIN_SITES: BuiltinSite[] = [
  { name: "세무대리인 홈택스 로그인", keywords: "세무대리인 홈택스 로그인 agent hometax", url: "", group: "홈택스", agentLogin: true },
];

// 북마크 타입 (/api/search 응답)
type BookmarkResult = {
  id: number;
  name: string;
  url: string;
  scope: "shared" | "personal";
  category: string | null;
  usageCount: number;
};

// 클라이언트 액션 (GlobalSearch ACTIONS와 동일)
type PhoneAction = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  path?: (id: number) => string;
  custom?: boolean;
};
// 거래처 액션 — 홈택스 로그인만
const PHONE_ACTIONS: PhoneAction[] = [
  { key: "로그인", label: "홈택스 로그인", desc: "홈택스 자동 로그인 (새 탭)", icon: "🔐", custom: true },
];

// 외부 사이트 클릭 핸들러 — agentLogin/autoLogin 처리
async function handleSiteOpen(site: BuiltinSite, openFn: (url: string) => void) {
  if (site.agentLogin) {
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
        openFn(`https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`);
        return;
      }
      alert("세무대리인 홈택스 계정이 설정되지 않았습니다");
    } catch {
      alert("네트워크 오류");
    }
  } else if (site.autoLogin) {
    try {
      const res = await fetch("/api/settings/wemembers-credentials");
      const data = await res.json();
      if (data.id && data.pw) {
        const creds = btoa(unescape(encodeURIComponent(JSON.stringify({ id: data.id, pw: data.pw }))));
        openFn(site.url + "#savetax=" + creds);
        return;
      }
      openFn(site.url);
    } catch {
      openFn(site.url);
    }
  } else {
    openFn(site.url);
  }
}

async function doClientHometaxLogin(clientId: number, openFn: (url: string) => void) {
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
    openFn(`https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`);
  } catch {
    alert("네트워크 오류");
  }
}

async function doClientDriveFolder(clientId: number, openFn: (url: string) => void) {
  try {
    const res = await fetch(`/api/clients/${clientId}/drive-folder`);
    const data = await res.json();
    if (data.url) {
      openFn(data.url);
    } else {
      alert("구글드라이브 폴더가 설정되지 않았습니다");
    }
  } catch {
    alert("네트워크 오류");
  }
}

// 내비 메뉴 (GlobalSearch와 동일)
type NavItem = { name: string; keywords: string; path: string };
const NAV_ITEMS: NavItem[] = [
  { name: "대시보드", keywords: "대시보드 홈 dashboard", path: "/dashboard" },
  { name: "고객사관리", keywords: "고객사 거래처 clients", path: "/clients" },
  { name: "신규수임", keywords: "신규수임 commission", path: "/commission" },
  { name: "신고대리", keywords: "신고대리 tax-agency", path: "/tax-agency" },
  { name: "원천세", keywords: "원천세 withholding", path: "/withholding" },
  { name: "종합소득세", keywords: "종합소득세 종소세 income-tax", path: "/income-tax" },
  { name: "채권관리", keywords: "채권 미수납 receivables", path: "/receivables" },
  { name: "자료수집", keywords: "자료수집 data-collect", path: "/data-collect" },
  { name: "Savetax 배분", keywords: "배분 distribution", path: "/distribution" },
  { name: "Savetax 정산", keywords: "정산 settlement", path: "/settlement" },
  { name: "세무회계태호 배분", keywords: "태호 배분 taeho", path: "/distribution-taeho" },
  { name: "수익추이", keywords: "수익 추이 revenue", path: "/revenue" },
  { name: "스케쥴", keywords: "스케쥴 일정 schedule", path: "/schedule" },
  { name: "업무/메모", keywords: "업무 메모 tasks", path: "/tasks" },
  { name: "직원관리", keywords: "직원 스탭 staff", path: "/staff" },
  { name: "설정", keywords: "설정 settings", path: "/settings" },
];

type ClientDetail = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  residentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  clientType: string;
  taxationType: string | null;
  taxTypes: string | null;
  laborTypes: string | null;
  bizType: string | null;
  bizCategory: string | null;
  bizItem: string | null;
  accountingProgram: string;
  contactMethod: string;
  openDate: string | null;
  halfYearTax: boolean;
  contractDate: string | null;
  withholdingType: string | null;
  assignedUser: { id: number; name: string } | null;
  affiliation: string | null;
  hometaxId: string | null;
  hometaxPw: string | null;
  monthlyFee: number | null;
  freeMonths: number | null;
  firstWithdrawalMonth: string | null;
  bankName: string | null;
  bankAccount: string | null;
  notes: string | null;
  cmsStatus: string;
};

// 현재 시각 (모형 상태바용)
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtTime(d: Date | null) {
  if (!d) return "";
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateKo(d: Date | null) {
  if (!d) return "";
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return `${days[d.getDay()]} · ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ========== iPhone 홈스크린 ==========

function laborInitials(laborTypes: string | null): string {
  if (!laborTypes) return "";
  return laborTypes
    .split(",")
    .map((t) => t.trim())
    .map((t) => LABOR_LETTER_MAP[t] ?? "")
    .filter(Boolean)
    .join("");
}

// 클라이언트 타일 (즐겨찾기/최근 본 용)
function ClientTile({
  client,
  onTap,
}: {
  client: ClientMini;
  onTap: () => void;
}) {
  const initials = laborInitials(client.laborTypes ?? null);
  const sizeCls =
    initials.length <= 1
      ? "text-[20px]"
      : initials.length === 2
      ? "text-[16px]"
      : initials.length === 3
      ? "text-[13px]"
      : "text-[11px]";
  return (
    <button
      onClick={onTap}
      className="flex flex-col items-center active:scale-95 transition-transform min-w-0"
    >
      <div
        className={`w-[52px] h-[52px] rounded-[14px] bg-gradient-to-br from-[#E8F3FF] to-white border border-white/40 flex items-center justify-center text-[#1B64DA] font-bold tracking-tight ${sizeCls}`}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)" }}
      >
        {initials || <span className="text-[11px] text-[#8B95A1]">—</span>}
      </div>
      <div
        className="text-[10px] text-white font-[500] mt-1 text-center leading-tight max-w-full truncate"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
      >
        {client.name}
      </div>
    </button>
  );
}

// iOS 앱 타일 (SVG 아이콘)
function UtilityAppTile({
  name,
  Icon,
  bg,
  href,
  external,
  action,
  hideLabel,
  iconColor = "text-white",
}: {
  name: string;
  Icon: AppIcon;
  bg: string;
  href?: string;
  external?: string;
  action?: () => void;
  hideLabel?: boolean;
  iconColor?: string;
}) {
  const content = (
    <>
      <div
        className={`w-[46px] h-[46px] rounded-[12px] ${bg} flex items-center justify-center border border-white/10`}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)" }}
      >
        <Icon width={24} height={24} strokeWidth={2.2} className={iconColor} />
      </div>
      {!hideLabel && (
        <div
          className="text-[10px] text-white font-[500] mt-1 text-center leading-tight"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
        >
          {name}
        </div>
      )}
    </>
  );
  const cls = "flex flex-col items-center active:scale-95 transition-transform";
  if (action) return <button onClick={action} className={cls}>{content}</button>;
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  if (external) return <a href={external} target="_blank" rel="noreferrer" className={cls}>{content}</a>;
  return <div className={cls}>{content}</div>;
}

// ========== 미리알림 위젯 (iPhone Reminders 스타일) ==========
type Reminder = {
  id: string;
  text: string;
  checked: boolean;
  createdAt: number;
};
const REMINDERS_KEY = "savetax-phone-reminders";

function RemindersWidget() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const r = localStorage.getItem(REMINDERS_KEY);
      if (r) setReminders(JSON.parse(r));
    } catch {}

    function onStorage(e: StorageEvent) {
      if (e.key !== REMINDERS_KEY || !e.newValue) return;
      try {
        setReminders(JSON.parse(e.newValue));
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function persist(next: Reminder[]) {
    setReminders(next);
    try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(next)); } catch {}
  }

  function add() {
    const text = input.trim();
    if (!text) return;
    const r: Reminder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      checked: false,
      createdAt: Date.now(),
    };
    persist([...reminders, r]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function toggle(id: string) {
    persist(reminders.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }

  function remove(id: string) {
    persist(reminders.filter((r) => r.id !== id));
  }

  function clearCompleted() {
    persist(reminders.filter((r) => !r.checked));
  }

  const completedCount = reminders.filter((r) => r.checked).length;

  // 미체크 먼저, 체크된 건 아래
  const sorted = [...reminders].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.createdAt - b.createdAt;
  });

  return (
    <div
      className="rounded-[20px] p-4 border border-white/15"
      style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      <div className="flex items-center gap-1.5 mb-2.5 px-1">
        <span className="w-3 h-3 rounded-full bg-[#FBBF24] flex items-center justify-center">
          <span className="w-1 h-1 rounded-full bg-white" />
        </span>
        <span className="text-[11px] font-bold text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
          미리알림
        </span>
        {reminders.length > 0 && (
          <span className="text-[10px] text-white/60 ml-auto">
            {reminders.length - completedCount}/{reminders.length}
          </span>
        )}
      </div>

      <div className="space-y-0.5 max-h-[180px] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {sorted.map((r) => (
          <div key={r.id} className="group flex items-center gap-2 px-1 py-1">
            <button
              onClick={() => toggle(r.id)}
              className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${
                r.checked
                  ? "bg-white border-white scale-100"
                  : "border-white/55 hover:border-white hover:scale-110"
              }`}
            >
              {r.checked && <CheckIcon width={11} height={11} strokeWidth={2.6} className="text-[#3182F6]" />}
            </button>
            <span
              className={`flex-1 text-[12.5px] transition-all leading-snug break-words ${
                r.checked ? "text-white/45 line-through" : "text-white"
              }`}
              style={!r.checked ? { textShadow: "0 1px 1px rgba(0,0,0,0.2)" } : undefined}
            >
              {r.text}
            </span>
            <button
              onClick={() => remove(r.id)}
              className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white text-[15px] leading-none px-1"
              title="삭제"
            >
              ×
            </button>
          </div>
        ))}

        {/* 입력 */}
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="shrink-0 w-[18px] h-[18px] rounded-full border-2 border-dashed border-white/35" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="새 알림 추가..."
            className="flex-1 bg-transparent text-[12.5px] text-white placeholder:text-white/45 focus:outline-none"
          />
        </div>
      </div>

      {completedCount > 0 && (
        <button
          onClick={clearCompleted}
          className="mt-2 w-full text-[10.5px] text-white/65 hover:text-white py-1.5 rounded-[10px] hover:bg-white/10 transition-colors"
        >
          완료한 {completedCount}개 지우기
        </button>
      )}
    </div>
  );
}

type DockAppDef = {
  id: DockAppId;
  name: string;
  Icon: AppIcon;
  bg: string;
  iconColor?: string;
  action: () => void;
};

function DraggableAppTile({
  app,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  app: DockAppDef;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={app.action}
      className={`flex flex-col items-center active:scale-95 transition-all ${isDragging ? "opacity-30 scale-95" : ""}`}
      title={app.name}
    >
      <div
        className={`w-[46px] h-[46px] rounded-[12px] ${app.bg} flex items-center justify-center border border-white/10`}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)" }}
      >
        <app.Icon width={24} height={24} strokeWidth={2.2} className={app.iconColor ?? "text-white"} />
      </div>
    </button>
  );
}

function HomeView({
  recentClients,
  onLaunchSearch,
  onSelectClient,
  onLaunchGlobalSearch,
  appDefs,
  appPositions,
  draggingApp,
  setDraggingApp,
  moveAppTo,
}: {
  recentClients: ClientMini[];
  onLaunchSearch: () => void;
  onSelectClient: (id: number) => void;
  onLaunchGlobalSearch: () => void;
  appDefs: DockAppDef[];
  appPositions: AppPositions;
  draggingApp: DockAppId | null;
  setDraggingApp: (id: DockAppId | null) => void;
  moveAppTo: (id: DockAppId, target: "dock" | "home") => void;
}) {
  const now = useNow();
  const homeApps = appDefs.filter((a) => appPositions[a.id] === "home");
  const dockApps = appDefs.filter((a) => appPositions[a.id] === "dock");

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Wallpaper는 폰 화면 레벨에 있음 — 여기는 비워둠 */}

      <div className="relative h-full overflow-y-auto pb-[110px]">
        {/* 날짜/시간 위젯 */}
        <div className="pt-7 pb-4 text-center">
          <div
            className="text-[11px] text-white/80 font-[500]"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
          >
            {fmtDateKo(now)}
          </div>
          <div
            className="text-[60px] font-light text-white leading-none mt-0.5 tabular-nums"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
          >
            {fmtTime(now)}
          </div>
        </div>

        {/* 미리알림 위젯 */}
        <div className="px-4 mb-3">
          <RemindersWidget />
        </div>

        {/* 전역 검색 위젯 */}
        <div className="px-4">
          <button
            onClick={onLaunchGlobalSearch}
            className="w-full rounded-[20px] p-3.5 border border-white/15 flex items-center gap-2.5 transition-colors hover:bg-white/15"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/85 shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="text-[12.5px] text-white/85 font-[500] flex-1 text-left" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
              고객사 · 도구 · 사이트 검색
            </span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white font-bold tabular-nums">/</kbd>
          </button>
        </div>

        {/* 최근 본 위젯 */}
        {recentClients.length > 0 && (
          <div className="px-4 mt-3">
            <div
              className="rounded-[20px] p-4 border border-white/15"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <div className="flex items-center gap-1.5 mb-3 px-1">
                <ClockIcon width={12} height={12} className="text-white" />
                <span className="text-[11px] font-bold text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                  최근 본
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {recentClients.slice(0, 10).map((c) => (
                  <div key={c.id} className="shrink-0 w-[62px]">
                    <ClientTile client={c} onTap={() => onSelectClient(c.id)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 홈 그리드 (드래그된 앱이 여기로) — 드롭 존 */}
      <div
        onDragOver={(e) => {
          if (draggingApp) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingApp) moveAppTo(draggingApp, "home");
        }}
        className={`absolute inset-0 z-0 ${
          draggingApp ? "" : "pointer-events-none"
        } ${
          draggingApp && appPositions[draggingApp] === "dock"
            ? "ring-2 ring-white/40 ring-inset"
            : ""
        }`}
      />

      {/* 홈 그리드 콘텐츠 */}
      {homeApps.length > 0 && (
        <div className="absolute bottom-[120px] left-0 right-0 px-5 z-[5] pointer-events-none">
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 pointer-events-auto">
            {homeApps.map((app) => (
              <div key={app.id} className="flex justify-center">
                <DraggableAppTile
                  app={app}
                  isDragging={draggingApp === app.id}
                  onDragStart={() => setDraggingApp(app.id)}
                  onDragEnd={() => setDraggingApp(null)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dock — 드롭 존 */}
      <div className="absolute bottom-[28px] left-3 right-3 z-10">
        <div
          onDragOver={(e) => {
            if (draggingApp) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingApp) moveAppTo(draggingApp, "dock");
          }}
          className={`rounded-[28px] px-2 py-2 border transition-colors ${
            draggingApp && appPositions[draggingApp] === "home"
              ? "border-white/60"
              : "border-white/20"
          }`}
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
        >
          {dockApps.length === 0 ? (
            <div className="h-[46px] flex items-center justify-center text-[10.5px] text-white/60">
              여기에 끌어 놓아주세요
            </div>
          ) : (
            <div className={`grid gap-0.5 ${dockApps.length <= 4 ? "grid-cols-4" : "grid-cols-5"}`}>
              {dockApps.map((app) => (
                <div key={app.id} className="flex justify-center">
                  <DraggableAppTile
                    app={app}
                    isDragging={draggingApp === app.id}
                    onDragStart={() => setDraggingApp(app.id)}
                    onDragEnd={() => setDraggingApp(null)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// fallback 포함한 클립보드 복사 (HTTPS 아니어도 작동)
function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  fallbackCopy(text);
  return Promise.resolve();
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

function CopyButton({ text, size = 14 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  function handle(e: React.MouseEvent) {
    e.stopPropagation();
    copyToClipboard(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <button
      type="button"
      onClick={handle}
      className={`shrink-0 p-1 rounded-[6px] transition-colors ${
        copied
          ? "text-[#16A865] bg-[#E7F7EE]"
          : "text-[#8B95A1] hover:text-[#191F28] hover:bg-[#F2F4F6]"
      }`}
      title={copied ? "복사됨" : "복사"}
    >
      {copied ? (
        <CheckIcon width={size} height={size} strokeWidth={2.2} />
      ) : (
        <ClipboardCopyIcon width={size} height={size} strokeWidth={2} />
      )}
    </button>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  const copyText =
    typeof value === "string" || typeof value === "number" ? String(value) : null;

  return (
    <div className="group flex items-start justify-between gap-2 py-1.5">
      <span className="text-[11.5px] text-[#8B95A1] shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[12.5px] text-[#191F28] font-[500] text-right break-all tabular-nums">
          {value}
        </span>
        {copyText && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={copyText} size={13} />
          </div>
        )}
      </div>
    </div>
  );
}

function CopyableText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`group inline-flex items-center gap-1 ${className ?? ""}`}>
      <span>{text}</span>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={text} size={13} />
      </div>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[#F2F4F6]">
      <div className="text-[10.5px] font-bold text-[#8B95A1] uppercase tracking-wider mb-1.5">
        {title}
      </div>
      <div className="divide-y divide-[#F9FAFB]">{children}</div>
    </div>
  );
}

const LABOR_LETTER_MAP: Record<string, string> = {
  "1인사업자": "A",
  "근로소득": "B",
  "사업소득": "C",
  "일용직": "D",
};

function ClientDetailView({
  detail,
  onBack,
  isPinned,
  onTogglePin,
}: {
  detail: ClientDetail;
  onBack: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const clientTypeLabel = detail.clientType === "individual" ? "개인" : detail.clientType === "corporate" ? "법인" : detail.clientType;
  const laborTypes = detail.laborTypes?.split(",").filter(Boolean).join(", ") || null;
  const taxTypes = detail.taxTypes?.split(",").filter(Boolean).join(", ") || null;

  // 인건비 분류 → ABCD 이니셜 (예: "근로소득,사업소득" → "BC")
  const laborLetters = (detail.laborTypes ?? "")
    .split(",")
    .map((t) => t.trim())
    .map((t) => LABOR_LETTER_MAP[t] ?? "")
    .filter(Boolean)
    .join("");
  const laborLetterSize =
    laborLetters.length <= 1
      ? "text-[22px]"
      : laborLetters.length === 2
      ? "text-[18px]"
      : laborLetters.length === 3
      ? "text-[15px]"
      : "text-[13px]";

  return (
    <>
      {/* 상단 네비 */}
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onBack} className="text-[#3182F6] text-[13px] font-[500]">
          ← 검색
        </button>
        <div className="flex-1 text-center truncate">
          <div className="text-[13px] font-bold text-[#191F28] truncate">{detail.name}</div>
        </div>
        <button
          onClick={onTogglePin}
          className={`p-1.5 rounded-[6px] transition-colors ${
            isPinned ? "text-[#FBBF24] hover:bg-[#FFFBEB]" : "text-[#B0B8C1] hover:bg-[#F2F4F6]"
          }`}
          title={isPinned ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {isPinned ? <StarFilledIcon width={16} height={16} /> : <StarIcon width={16} height={16} />}
        </button>
        <Link
          href={`/clients/${detail.id}/edit`}
          className="text-[11.5px] px-2.5 py-1 rounded-[6px] bg-[#3182F6] text-white font-bold"
        >
          편집
        </Link>
      </div>

      <div className="overflow-y-auto flex-1">
        {/* 히어로 */}
        <div className="px-4 py-4 text-center border-b border-[#F2F4F6] bg-gradient-to-b from-[#F5F9FF] to-white">
          <div
            className={`w-14 h-14 rounded-full bg-[#E8F3FF] flex items-center justify-center text-[#3182F6] font-bold mx-auto mb-2 tracking-tight ${laborLetterSize}`}
            title={laborTypes ? `인건비: ${laborTypes}` : "인건비 미입력"}
          >
            {laborLetters}
          </div>
          <div className="text-[16px] font-bold text-[#191F28]">
            <CopyableText text={detail.name} />
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-0.5 tabular-nums inline-flex items-center gap-1 justify-center">
            <span>{clientTypeLabel}</span>
            <span>·</span>
            {detail.bizNumber ? <CopyableText text={detail.bizNumber} /> : <span>사업자번호 없음</span>}
          </div>
          <div className="flex gap-1.5 justify-center mt-2 flex-wrap">
            {detail.affiliation && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                detail.affiliation === "세이브택스" ? "bg-[#E8F3FF] text-[#3182F6]" : "bg-[#F2F4F6] text-[#4E5968]"
              }`}>
                {detail.affiliation}
              </span>
            )}
            {detail.cmsStatus === "active" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#E7F7EE] text-[#15803D]">CMS 등록</span>
            )}
            {detail.cmsStatus !== "active" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#FEF2F2] text-[#DC2626]">CMS 미등록</span>
            )}
          </div>
        </div>

        <Section title="기본 정보">
          <Field label="대표자명" value={detail.ceoName} />
          <Field label="연락처" value={detail.phone} />
          <Field label="이메일" value={detail.email} />
          <Field label="주민등록번호" value={detail.residentNumber} />
          <Field label="개업년월일" value={detail.openDate} />
        </Section>

        {detail.address && (
          <Section title="주소">
            <div className="text-[12.5px] text-[#191F28] font-[500] py-1.5">{detail.address}</div>
          </Section>
        )}

        <Section title="세무 정보">
          <Field label="과세유형" value={detail.taxationType} />
          <Field label="신고유형" value={taxTypes} />
          <Field label="업종코드" value={detail.bizType} />
          <Field label="업태" value={detail.bizCategory} />
          <Field label="종목" value={detail.bizItem} />
          <Field label="원천세 유형" value={detail.withholdingType} />
          <Field label="인건비" value={laborTypes} />
          <Field label="6개월납" value={detail.halfYearTax ? "예" : null} />
        </Section>

        <Section title="담당">
          <Field label="담당 직원" value={detail.assignedUser?.name} />
          <Field label="소속" value={detail.affiliation} />
        </Section>

        <Section title="청구">
          <Field label="월 기장료" value={detail.monthlyFee ? `${detail.monthlyFee.toLocaleString()}원` : null} />
          <Field label="무료 기장" value={detail.freeMonths ? `${detail.freeMonths}개월` : null} />
          <Field label="최초 출금월" value={detail.firstWithdrawalMonth} />
          <Field label="출금 은행" value={detail.bankName} />
          <Field label="출금 계좌" value={detail.bankAccount} />
        </Section>

        {(detail.hometaxId || detail.hometaxPw) && (
          <Section title="홈택스">
            <Field label="ID" value={detail.hometaxId} />
            <Field label="PW" value={detail.hometaxPw} />
          </Section>
        )}

        <Section title="일자">
          <Field label="계약일자" value={detail.contractDate} />
        </Section>

        <Section title="소통">
          <Field label="업무소통" value={detail.contactMethod} />
          <Field label="회계프로그램" value={detail.accountingProgram} />
        </Section>

        {detail.notes && (
          <Section title="특이사항">
            <div className="text-[12.5px] text-[#4E5968] py-1.5 whitespace-pre-wrap">{detail.notes}</div>
          </Section>
        )}

        <div className="h-8" />
      </div>
    </>
  );
}

function SearchView({
  query,
  setQuery,
  clientResults,
  siteResults,
  bookmarkResults,
  onSelectClient,
  onOpenSite,
  onOpenBookmark,
  onOpenPath,
  onHome,
}: {
  query: string;
  setQuery: (q: string) => void;
  clientResults: ClientMini[];
  siteResults: BuiltinSite[];
  bookmarkResults: BookmarkResult[];
  onSelectClient: (id: number) => void;
  onOpenSite: (site: BuiltinSite) => void;
  onOpenBookmark: (b: BookmarkResult) => void;
  onOpenPath: (path: string) => void;
  onHome: () => void;
}) {
  const [actionClient, setActionClient] = useState<ClientMini | null>(null);
  const isActionMode = actionClient !== null;
  // 액션 모드 쿼리 파싱: "회사명 액션필터" 형태
  const actionQuery = actionClient
    ? query.startsWith(actionClient.name)
      ? query.slice(actionClient.name.length).trim()
      : ""
    : "";
  const filteredActions = actionClient
    ? PHONE_ACTIONS.filter(
        (a) => !actionQuery || a.key.includes(actionQuery) || a.label.includes(actionQuery)
      )
    : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 통합된 flat 결과 (키보드 네비용)
  type FlatItem =
    | { kind: "client"; client: ClientMini }
    | { kind: "site"; site: BuiltinSite }
    | { kind: "bookmark"; bookmark: BookmarkResult };
  const flat: FlatItem[] = !isActionMode
    ? [
        ...clientResults.map((c) => ({ kind: "client" as const, client: c })),
        ...siteResults.map((s) => ({ kind: "site" as const, site: s })),
        ...bookmarkResults.map((b) => ({ kind: "bookmark" as const, bookmark: b })),
      ]
    : [];

  // 활성 항목 수 (모드별)
  const totalItems = isActionMode ? filteredActions.length : flat.length;

  useEffect(() => {
    setActiveIdx(0);
  }, [query, isActionMode]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function enterActionMode(client: ClientMini) {
    setActionClient(client);
    setQuery(client.name + " ");
  }
  function exitActionMode() {
    setActionClient(null);
    setQuery("");
  }
  function executeAction(action: PhoneAction) {
    if (!actionClient) return;
    if (action.custom && action.key === "보기") {
      onSelectClient(actionClient.id);
    } else if (action.custom && action.key === "로그인") {
      doClientHometaxLogin(actionClient.id, onOpenPath);
    } else if (action.custom && action.key === "드라이브") {
      doClientDriveFolder(actionClient.id, onOpenPath);
    } else if (action.path) {
      onOpenPath(action.path(actionClient.id));
    }
    exitActionMode();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (isActionMode) {
        exitActionMode();
      } else {
        (e.target as HTMLInputElement).blur();
      }
      return;
    }
    if (totalItems === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isActionMode) {
        const action = filteredActions[activeIdx];
        if (action) executeAction(action);
      } else {
        const target = flat[activeIdx];
        if (!target) return;
        if (target.kind === "client") onSelectClient(target.client.id);
        else if (target.kind === "site") onOpenSite(target.site);
        else if (target.kind === "bookmark") onOpenBookmark(target.bookmark);
      }
    } else if (e.key === " " && !isActionMode) {
      // Space → 강조된 거래처에서 액션 모드 진입
      const target = flat[activeIdx];
      if (target?.kind === "client") {
        e.preventDefault();
        enterActionMode(target.client);
      }
    }
  }

  return (
    <>
      <div className="px-4 pt-4 pb-3 border-b border-[#F2F4F6]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="text-[16px] leading-none hover:opacity-70 transition-opacity"
              title="홈"
            >
              🏠
            </button>
            <div className="text-[15px] font-bold text-[#191F28]">고객사 검색</div>
          </div>
          <div className="text-[10px] text-[#8B95A1] flex gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-[#F2F4F6] text-[#4E5968] font-bold tabular-nums">/</kbd>
            <kbd className="px-1 py-0.5 rounded bg-[#F2F4F6] text-[#4E5968] font-bold tabular-nums">⇧H</kbd>
          </div>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="이름·사업자번호·대표자 (↑↓ 엔터 · ESC)"
          className="w-full h-10 px-3 bg-[#F9FAFB] border border-[#F2F4F6] rounded-[10px] text-[13.5px] text-[#191F28] placeholder:text-[#B0B8C1] focus:outline-none focus:border-[#3182F6] transition-colors"
        />
      </div>
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {isActionMode ? (
          <div>
            <div className="px-4 py-2 bg-[#E8F3FF] border-b border-[#A3CAFD] flex items-center gap-2">
              <span className="text-[10px] text-[#1B64DA] font-bold uppercase tracking-wider">선택됨</span>
              <span className="text-[12.5px] font-bold text-[#191F28] flex-1 truncate">{actionClient!.name}</span>
              <span className="text-[10px] text-[#8B95A1]">ESC 취소</span>
            </div>
            {filteredActions.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="text-[12.5px] text-[#4E5968] font-[500]">일치하는 액션 없음</div>
              </div>
            ) : (
              <div className="divide-y divide-[#F2F4F6]">
                {filteredActions.map((a, idx) => {
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={a.key}
                      data-idx={idx}
                      onClick={() => executeAction(a)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${
                        active ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                      }`}
                    >
                      <span className="text-[18px] shrink-0">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-bold ${active ? "text-[#1B64DA]" : "text-[#191F28]"}`}>
                          {a.label}
                        </div>
                        <div className="text-[10.5px] text-[#8B95A1] mt-0.5 truncate">{a.desc}</div>
                      </div>
                      <span className="text-[10px] text-[#3182F6] font-bold shrink-0">Enter</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : query.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] text-[#4E5968] font-[500]">통합 검색</div>
            <div className="text-[11px] text-[#8B95A1] mt-1 leading-[1.5]">
              거래처 · 북마크 · 세무대리인 홈택스<br />
              거래처 선택 후 <kbd className="px-1 py-0.5 rounded bg-[#F2F4F6] text-[#4E5968] text-[10px] font-bold">스페이스</kbd>로 액션
            </div>
          </div>
        ) : flat.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] text-[#4E5968] font-[500]">검색 결과가 없어요</div>
            <div className="text-[11px] text-[#8B95A1] mt-1">다른 키워드로 시도해보세요</div>
          </div>
        ) : (
          <div>
            {clientResults.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#8B95A1] uppercase tracking-wider bg-[#F9FAFB]">
                  거래처 · {clientResults.length}건
                </div>
                <div className="divide-y divide-[#F2F4F6]">
                  {clientResults.map((c, idx) => {
                    const flatIdx = idx;
                    const active = flatIdx === activeIdx;
                    return (
                      <button
                        key={c.id}
                        data-idx={flatIdx}
                        onClick={() => onSelectClient(c.id)}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          active ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                        }`}
                      >
                        <div className={`text-[13px] font-bold truncate ${active ? "text-[#1B64DA]" : "text-[#191F28]"}`}>
                          {c.name}
                        </div>
                        <div className="text-[10.5px] text-[#8B95A1] mt-0.5 truncate tabular-nums">
                          {c.ceoName ? `${c.ceoName} · ` : ""}
                          {c.bizNumber ?? "사업자번호 없음"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {siteResults.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#8B95A1] uppercase tracking-wider bg-[#F9FAFB]">
                  로그인 · {siteResults.length}건
                </div>
                <div className="divide-y divide-[#F2F4F6]">
                  {siteResults.map((s, idx) => {
                    const flatIdx = clientResults.length + idx;
                    const active = flatIdx === activeIdx;
                    return (
                      <button
                        key={s.name}
                        data-idx={flatIdx}
                        onClick={() => onOpenSite(s)}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-2 ${
                          active ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                        }`}
                      >
                        <span className="text-[16px] shrink-0">🔐</span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-bold truncate ${active ? "text-[#1B64DA]" : "text-[#191F28]"}`}>
                            {s.name}
                          </div>
                          <div className="text-[10.5px] text-[#8B95A1] mt-0.5 truncate">{s.group}</div>
                        </div>
                        <span className="text-[10px] text-[#3182F6] font-bold shrink-0">↗</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {bookmarkResults.length > 0 && (
              <>
                <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#8B95A1] uppercase tracking-wider bg-[#F9FAFB]">
                  북마크 · {bookmarkResults.length}건
                </div>
                <div className="divide-y divide-[#F2F4F6]">
                  {bookmarkResults.map((b, idx) => {
                    const flatIdx = clientResults.length + siteResults.length + idx;
                    const active = flatIdx === activeIdx;
                    return (
                      <button
                        key={b.id}
                        data-idx={flatIdx}
                        onClick={() => onOpenBookmark(b)}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-2 ${
                          active ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
                        }`}
                      >
                        <span className="text-[14px] shrink-0">🔖</span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-bold truncate ${active ? "text-[#1B64DA]" : "text-[#191F28]"}`}>
                            {b.name}
                          </div>
                          <div className="text-[10.5px] text-[#8B95A1] mt-0.5 truncate">
                            {b.category ?? (b.scope === "shared" ? "공통" : "개인")}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#3182F6] font-bold shrink-0">↗</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

type ViewMode = "home" | "search" | "detail" | "notes" | "wallpaper" | "chatbot" | "schedule";

const PINNED_KEY = "savetax-phone-pinned";
const RECENT_KEY = "savetax-phone-recent";
const NOTES_KEY = "savetax-phone-notes";
const WALLPAPER_KEY = "savetax-phone-wallpaper";
const APP_POSITIONS_KEY = "savetax-phone-app-positions";

// ========== Dock 앱 정의 + 드래그앤드롭 ==========
type DockAppId = "notes" | "ai" | "kakao" | "wallpaper" | "schedule";
type AppPositions = Record<DockAppId, "dock" | "home">;
const DEFAULT_APP_POSITIONS: AppPositions = {
  notes: "dock",
  ai: "dock",
  kakao: "dock",
  wallpaper: "dock",
  schedule: "dock",
};

// ========== 배경화면 ==========
type Wallpaper = { type: "preset"; value: string } | { type: "custom"; value: string };

const WALLPAPER_PRESETS: Record<string, { name: string; bg: string }> = {
  toss: {
    name: "Toss 블루",
    bg: `radial-gradient(at 78% 18%, rgba(49, 130, 246, 0.95) 0px, transparent 38%),
         radial-gradient(at 22% 75%, rgba(125, 211, 252, 0.45) 0px, transparent 50%),
         radial-gradient(at 55% 45%, rgba(226, 232, 240, 0.20) 0px, transparent 55%),
         linear-gradient(165deg, #475569 0%, #334155 45%, #1E293B 100%)`,
  },
  midnight: {
    name: "미드나잇",
    bg: `radial-gradient(at 80% 20%, rgba(99, 102, 241, 0.45) 0px, transparent 50%),
         linear-gradient(170deg, #1E1B4B 0%, #0F172A 100%)`,
  },
  dawn: {
    name: "새벽",
    bg: `radial-gradient(at 25% 25%, rgba(244, 114, 182, 0.65) 0px, transparent 50%),
         radial-gradient(at 80% 65%, rgba(167, 139, 250, 0.65) 0px, transparent 50%),
         linear-gradient(170deg, #1E1B4B 0%, #4C1D95 50%, #831843 100%)`,
  },
  sunset: {
    name: "일몰",
    bg: `radial-gradient(at 20% 30%, rgba(251, 113, 133, 0.7) 0px, transparent 50%),
         radial-gradient(at 75% 60%, rgba(251, 146, 60, 0.65) 0px, transparent 50%),
         linear-gradient(170deg, #7C2D12 0%, #1E293B 100%)`,
  },
  aurora: {
    name: "오로라",
    bg: `radial-gradient(at 30% 20%, rgba(52, 211, 153, 0.55) 0px, transparent 45%),
         radial-gradient(at 70% 55%, rgba(96, 165, 250, 0.65) 0px, transparent 50%),
         radial-gradient(at 45% 90%, rgba(167, 139, 250, 0.5) 0px, transparent 50%),
         linear-gradient(170deg, #134E4A 0%, #1E1B4B 100%)`,
  },
  ivory: {
    name: "아이보리",
    bg: `radial-gradient(at 30% 20%, rgba(254, 243, 199, 0.95) 0px, transparent 50%),
         radial-gradient(at 70% 65%, rgba(254, 215, 170, 0.85) 0px, transparent 50%),
         linear-gradient(170deg, #FEF3C7 0%, #FED7AA 50%, #FCA5A5 100%)`,
  },
};

const DEFAULT_WALLPAPER: Wallpaper = { type: "preset", value: "toss" };

function isLightWallpaper(w: Wallpaper): boolean {
  return w.type === "preset" && w.value === "ivory";
}

function getWallpaperStyle(w: Wallpaper): React.CSSProperties {
  if (w.type === "preset") {
    return { background: WALLPAPER_PRESETS[w.value]?.bg ?? WALLPAPER_PRESETS.toss.bg };
  }
  return {
    backgroundImage: `url(${w.value})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

async function compressImage(file: File, maxDim = 1080): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas error"));
        ctx.drawImage(img, 0, 0, width, height);
        let q = 0.85;
        let result = canvas.toDataURL("image/jpeg", q);
        // localStorage 4MB 안전선
        while (result.length > 3.5 * 1024 * 1024 && q > 0.4) {
          q -= 0.1;
          result = canvas.toDataURL("image/jpeg", q);
        }
        resolve(result);
      };
      img.onerror = () => reject(new Error("img error"));
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(file);
  });
}

// ========== 스케쥴 (폰 내부 미니 캘린더) ==========
type PhoneSchedule = {
  id: number;
  userId: number;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string;
  notes: string | null;
  user: { id: number; name: string };
};

const SCHEDULE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  blue: { dot: "bg-[#3182F6]", bg: "bg-[#E8F3FF]", text: "text-[#1B64DA]" },
  red: { dot: "bg-[#E02E2E]", bg: "bg-[#FEF2F2]", text: "text-[#B91C1C]" },
  green: { dot: "bg-[#1AB266]", bg: "bg-[#E7F7EE]", text: "text-[#15803D]" },
  purple: { dot: "bg-[#8B5CF6]", bg: "bg-[#F5F3FF]", text: "text-[#6D28D9]" },
  orange: { dot: "bg-[#F59E0B]", bg: "bg-[#FFFBEB]", text: "text-[#92400E]" },
};

function ymToDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function dateToYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftMonth(ym: string, delta: number) {
  const d = ymToDate(ym);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PhoneScheduleView({ onHome }: { onHome: () => void }) {
  const [ym, setYM] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [schedules, setSchedules] = useState<PhoneSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => dateToYMD(new Date()));

  useEffect(() => {
    setLoading(true);
    getSchedules(ym)
      .then((data) => setSchedules(data as PhoneSchedule[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ym]);

  // 그리드 만들기
  const [year, month] = ym.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= lastDate; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  // 날짜별 일정 집계
  const eventsByDate = useMemo(() => {
    const m = new Map<string, PhoneSchedule[]>();
    schedules.forEach((s) => {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    });
    return m;
  }, [schedules]);

  const todayYMD = dateToYMD(new Date());
  const dayEvents = selectedDate ? eventsByDate.get(selectedDate) || [] : [];

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onHome} className="text-[#3182F6] text-[13px] font-[500]">
          ← 홈
        </button>
        <div className="flex-1 text-center">
          <div className="text-[13.5px] font-bold text-[#191F28]">스케쥴</div>
        </div>
        <Link
          href="/schedule"
          className="text-[11.5px] text-[#3182F6] font-bold px-2 py-1 rounded-[6px] hover:bg-[#E8F3FF]"
          title="전체 스케쥴 페이지"
        >
          전체 ↗
        </Link>
      </div>

      {/* 월 이동 + 헤더 */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <button
          onClick={() => setYM(shiftMonth(ym, -1))}
          className="w-7 h-7 rounded-full hover:bg-[#F2F4F6] text-[#4E5968] text-[14px]"
        >
          ‹
        </button>
        <div className="text-[15px] font-bold text-[#191F28] tabular-nums">
          {year}년 {month}월
        </div>
        <button
          onClick={() => setYM(shiftMonth(ym, 1))}
          className="w-7 h-7 rounded-full hover:bg-[#F2F4F6] text-[#4E5968] text-[14px]"
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-2 mt-1">
        {weekdays.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] font-bold py-1 ${
              i === 0 ? "text-[#DC2626]" : i === 6 ? "text-[#3182F6]" : "text-[#8B95A1]"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 px-2 gap-y-0.5">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = ymd === todayYMD;
          const isSelected = ymd === selectedDate;
          const events = eventsByDate.get(ymd) || [];
          const dow = (firstDay + day - 1) % 7;
          const dowColor = dow === 0 ? "text-[#DC2626]" : dow === 6 ? "text-[#3182F6]" : "text-[#191F28]";
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(ymd)}
              className={`relative h-9 flex flex-col items-center justify-center rounded-[8px] transition-colors ${
                isSelected ? "bg-[#E8F3FF]" : "hover:bg-[#F9FAFB]"
              }`}
            >
              <span
                className={`text-[12px] font-[500] ${
                  isToday
                    ? "w-5 h-5 rounded-full bg-[#3182F6] text-white flex items-center justify-center font-bold"
                    : isSelected
                    ? "text-[#1B64DA] font-bold"
                    : dowColor
                }`}
              >
                {day}
              </span>
              {events.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {events.slice(0, 3).map((e, idx) => {
                    const c = SCHEDULE_COLORS[e.color] ?? SCHEDULE_COLORS.blue;
                    return <span key={idx} className={`w-1 h-1 rounded-full ${c.dot}`} />;
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택 날짜 일정 리스트 */}
      <div className="flex-1 overflow-y-auto border-t border-[#F2F4F6] mt-2">
        {selectedDate && (
          <>
            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-[#191F28]">
                {parseInt(selectedDate.slice(5, 7))}월 {parseInt(selectedDate.slice(8, 10))}일
              </span>
              <span className="text-[10.5px] text-[#8B95A1]">
                {dayEvents.length > 0 ? `${dayEvents.length}건` : "일정 없음"}
              </span>
            </div>
            {loading ? (
              <div className="px-4 py-4 text-[11.5px] text-[#8B95A1]">불러오는 중...</div>
            ) : dayEvents.length === 0 ? (
              <div className="px-4 py-4 text-[11.5px] text-[#8B95A1]">
                일정이 없어요
              </div>
            ) : (
              <div className="divide-y divide-[#F2F4F6]">
                {dayEvents.map((e) => {
                  const c = SCHEDULE_COLORS[e.color] ?? SCHEDULE_COLORS.blue;
                  return (
                    <div key={e.id} className="px-4 py-2.5 flex items-start gap-2">
                      <span className={`w-1 h-10 rounded-full shrink-0 ${c.dot} mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-[#191F28] truncate">
                          {e.title}
                        </div>
                        <div className="text-[10.5px] text-[#6B7684] mt-0.5 flex items-center gap-1.5">
                          {e.startTime && (
                            <span className="tabular-nums">
                              {e.startTime}
                              {e.endTime ? ` ~ ${e.endTime}` : ""}
                            </span>
                          )}
                          <span className="text-[#B0B8C1]">·</span>
                          <span className="truncate">{e.user?.name}</span>
                        </div>
                        {e.notes && (
                          <div className="text-[10.5px] text-[#8B95A1] mt-0.5 truncate">
                            {e.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ========== AI 챗봇 (폰 내부) ==========
type ChatMsg = { role: "user" | "assistant"; content: string; image?: string };

function PhoneChatbotView({ onHome }: { onHome: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function loadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하 이미지만 업로드 가능합니다.");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 1600);
      setImagePreview(dataUrl);
    } catch {
      alert("이미지 처리 실패");
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function clearImage() {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) loadFile(file);
        break;
      }
    }
  }

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
    if (file) loadFile(file);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !imagePreview) || loading) return;
    const currentImage = imagePreview;
    setInput("");
    const newUserMsg: ChatMsg = {
      role: "user",
      content: text || "📎 이미지 분석 요청",
      image: currentImage || undefined,
    };
    setMessages((p) => [...p, newUserMsg]);
    clearImage();
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "이 이미지를 분석해주세요.",
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          image: currentImage || undefined,
        }),
      });
      const data = await res.json();
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content: res.ok ? data.reply : data.detail ? `오류: ${data.detail}` : "오류가 발생했습니다",
        },
      ]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "네트워크 오류" }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div
      className={`relative flex flex-col h-full bg-white ${isDragging ? "ring-2 ring-[#3182F6] ring-inset" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[#F5F9FF]/95 flex flex-col items-center justify-center pointer-events-none">
          <PaperclipIcon width={36} height={36} className="text-[#3182F6] mb-2" />
          <div className="text-[#3182F6] font-bold text-[13px]">이미지를 여기에 놓으세요</div>
          <div className="text-[#8B95A1] text-[11px] mt-1">신분증 · 사업자등록증 등</div>
        </div>
      )}
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onHome} className="text-[#3182F6] text-[13px] font-[500]">
          ← 홈
        </button>
        <div className="flex-1 text-center">
          <div className="text-[13.5px] font-bold text-[#191F28]">AI 어시스턴트</div>
        </div>
        <button
          onClick={() => setMessages([])}
          className="text-[11.5px] text-[#8B95A1] hover:text-[#191F28] px-2 py-1 rounded-[6px] hover:bg-[#F2F4F6]"
          title="대화 초기화"
        >
          새 대화
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#F9FAFB]">
        {messages.length === 0 && !loading && (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#A855F7] to-[#6D28D9] flex items-center justify-center mx-auto mb-3">
              <BotIcon width={22} height={22} strokeWidth={2.2} className="text-white" />
            </div>
            <div className="text-[13px] text-[#4E5968] font-[500]">무엇이든 물어보세요</div>
            <div className="text-[11px] text-[#8B95A1] mt-1">세무 질문, 신분증/사업자등록증 업로드</div>
            <div className="flex flex-wrap gap-1.5 justify-center mt-4 px-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] px-2.5 py-1 rounded-full border border-[#A3CAFD] text-[#3182F6] bg-[#F5F9FF] hover:bg-[#E8F3FF] transition-colors inline-flex items-center gap-1"
              >
                <PaperclipIcon width={11} height={11} />
                사업자등록증으로 거래처 등록
              </button>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-[14px] px-3 py-2 text-[12.5px] leading-[1.5] ${
                m.role === "user"
                  ? "bg-[#3182F6] text-white"
                  : "bg-white border border-[#F2F4F6] text-[#191F28]"
              }`}
            >
              {m.image && (
                <img src={m.image} alt="업로드 이미지" className="max-w-full max-h-32 rounded-[8px] mb-1.5 border border-white/20" />
              )}
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none [&>*]:my-1 [&_p]:my-1 [&_pre]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12.5px] [&_code]:text-[11.5px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#F2F4F6] rounded-[14px] px-3 py-2 text-[12.5px] text-[#8B95A1]">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A1] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A1] animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B95A1] animate-pulse" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[#F2F4F6] p-2 bg-white">
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img src={imagePreview} alt="미리보기" className="max-h-20 rounded-[8px] border border-[#E5E8EB]" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#E02E2E] text-white rounded-full text-[10px] flex items-center justify-center hover:bg-[#DC2626] shadow"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex gap-1.5 items-end">
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
            className="text-[#8B95A1] hover:text-[#3182F6] p-2 rounded-[10px] transition-colors shrink-0 disabled:opacity-40 flex items-center"
            title="이미지 업로드 (신분증, 사업자등록증 등)"
          >
            <PaperclipIcon width={16} height={16} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={handlePaste}
            placeholder={imagePreview ? "이미지 설명 (예: 쇠터닭갈비 대표자신분증)" : "메시지... (이미지 붙여넣기 가능)"}
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-[12.5px] bg-[#F9FAFB] border border-[#F2F4F6] rounded-[12px] focus:outline-none focus:border-[#3182F6] max-h-24 leading-[1.4]"
          />
          <button
            onClick={send}
            disabled={loading || (!input.trim() && !imagePreview)}
            className="px-3 py-2 bg-[#3182F6] text-white rounded-[12px] text-[12px] font-bold disabled:opacity-50 shrink-0 hover:bg-[#1B64DA] transition-colors"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

function WallpaperPickerView({
  current,
  onSelect,
  onHome,
}: {
  current: Wallpaper;
  onSelect: (w: Wallpaper) => void;
  onHome: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file);
      onSelect({ type: "custom", value: dataUrl });
    } catch {
      setError("사진 처리 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onHome} className="text-[#3182F6] text-[13px] font-[500]">
          ← 홈
        </button>
        <div className="flex-1 text-center">
          <div className="text-[13.5px] font-bold text-[#191F28]">배경화면</div>
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* 내 사진 */}
        <div>
          <div className="text-[10.5px] font-bold text-[#8B95A1] mb-2 uppercase tracking-wider">
            내 사진
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full h-20 rounded-[14px] border-2 border-dashed border-[#E5E8EB] hover:border-[#3182F6] hover:bg-[#F5F9FF] transition-colors flex flex-col items-center justify-center text-[#8B95A1] hover:text-[#3182F6] disabled:opacity-50"
          >
            <UploadIcon width={20} height={20} strokeWidth={2} />
            <div className="text-[12px] font-[500] mt-1">
              {uploading ? "처리 중..." : "사진 업로드"}
            </div>
          </button>
          {error && <div className="text-[11px] text-[#DC2626] mt-1">{error}</div>}

          {current.type === "custom" && (
            <div className="mt-3 relative w-full rounded-[14px] overflow-hidden border-2 border-[#3182F6]" style={{ aspectRatio: "9/19" }}>
              <img src={current.value} alt="현재" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 bg-[#3182F6] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                선택됨
              </div>
            </div>
          )}
        </div>

        {/* 프리셋 */}
        <div>
          <div className="text-[10.5px] font-bold text-[#8B95A1] mb-2 uppercase tracking-wider">
            프리셋
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(WALLPAPER_PRESETS).map(([id, preset]) => {
              const selected = current.type === "preset" && current.value === id;
              const lightTone = id === "ivory";
              return (
                <button
                  key={id}
                  onClick={() => onSelect({ type: "preset", value: id })}
                  className={`relative rounded-[14px] overflow-hidden border-2 transition-all active:scale-95 ${
                    selected ? "border-[#3182F6]" : "border-transparent hover:border-[#E5E8EB]"
                  }`}
                  style={{ aspectRatio: "9/16" }}
                >
                  <div className="absolute inset-0" style={{ background: preset.bg }} />
                  <div
                    className={`absolute bottom-2 left-2 right-2 text-[11px] font-bold ${
                      lightTone ? "text-[#191F28]" : "text-white"
                    }`}
                    style={!lightTone ? { textShadow: "0 1px 2px rgba(0,0,0,0.5)" } : undefined}
                  >
                    {preset.name}
                  </div>
                  {selected && (
                    <div className="absolute top-2 right-2 bg-[#3182F6] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 메모 앱 ==========
type Note = {
  id: string;
  content: string;
  updatedAt: number;
};

function fmtRelative(ts: number) {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "방금 전";
  if (diff < hour) return `${Math.floor(diff / min)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function NoteEditor({
  note,
  onChange,
  onBack,
  onDelete,
}: {
  note: Note;
  onChange: (c: string) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    taRef.current?.focus();
    // 끝 위치로 커서
    if (taRef.current) {
      taRef.current.selectionStart = taRef.current.value.length;
      taRef.current.selectionEnd = taRef.current.value.length;
    }
  }, [note.id]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onBack} className="text-[#3182F6] text-[13px] font-[500]">
          ← 메모
        </button>
        <div className="flex-1 text-center">
          <div className="text-[11px] text-[#8B95A1]">{fmtRelative(note.updatedAt)}</div>
        </div>
        <button
          onClick={onDelete}
          className="text-[#DC2626] text-[12.5px] font-[500] px-2 py-1 rounded-[6px] hover:bg-[#FEF2F2]"
        >
          삭제
        </button>
      </div>
      <textarea
        ref={taRef}
        value={note.content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="여기에 메모하세요..."
        className="flex-1 w-full px-4 py-3 text-[13.5px] leading-[1.6] text-[#191F28] focus:outline-none resize-none placeholder:text-[#B0B8C1] tabular-nums"
      />
    </div>
  );
}

function NotesView({ onHome, newNoteTrigger }: { onHome: () => void; newNoteTrigger: number }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const lastTriggerRef = useRef(newNoteTrigger);

  useEffect(() => {
    try {
      const n = localStorage.getItem(NOTES_KEY);
      if (n) setNotes(JSON.parse(n));
    } catch {}
    function onStorage(e: StorageEvent) {
      if (e.key !== NOTES_KEY || !e.newValue) return;
      try {
        setNotes(JSON.parse(e.newValue));
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function persist(next: Note[]) {
    setNotes(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch {}
  }

  function createNew() {
    const note: Note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: "",
      updatedAt: Date.now(),
    };
    persist([note, ...notes]);
    setCurrentId(note.id);
  }

  // 외부 트리거 (Shift+N) → 즉시 새 메모 열기
  useEffect(() => {
    if (newNoteTrigger > lastTriggerRef.current) {
      lastTriggerRef.current = newNoteTrigger;
      createNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNoteTrigger]);

  function update(id: string, content: string) {
    persist(notes.map((n) => (n.id === id ? { ...n, content, updatedAt: Date.now() } : n)));
  }

  function remove(id: string) {
    persist(notes.filter((n) => n.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  const current = notes.find((n) => n.id === currentId);

  if (current) {
    return (
      <NoteEditor
        note={current}
        onChange={(c) => update(current.id, c)}
        onBack={() => setCurrentId(null)}
        onDelete={() => remove(current.id)}
      />
    );
  }

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="sticky top-0 bg-white border-b border-[#F2F4F6] px-3 py-2 flex items-center gap-2 z-10">
        <button onClick={onHome} className="text-[#3182F6] text-[13px] font-[500]">
          ← 홈
        </button>
        <div className="flex-1 text-center">
          <div className="text-[13.5px] font-bold text-[#191F28]">메모</div>
        </div>
        <button
          onClick={createNew}
          className="text-[12.5px] px-2.5 py-1 rounded-[6px] bg-[#3182F6] text-white font-bold"
        >
          + 새 메모
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-[14px] text-[#4E5968] font-[500]">메모가 없어요</div>
            <div className="text-[12px] text-[#8B95A1] mt-1">
              우측 상단 <span className="text-[#3182F6] font-bold">+ 새 메모</span>로 시작하세요
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F2F4F6]">
            {sorted.map((n) => {
              const lines = n.content.split("\n");
              const title = lines[0]?.trim() || "(제목 없음)";
              const preview = lines.slice(1).join(" ").trim();
              return (
                <button
                  key={n.id}
                  onClick={() => setCurrentId(n.id)}
                  className="w-full text-left px-4 py-3 hover:bg-[#F9FAFB] transition-colors"
                >
                  <div className="text-[13px] font-bold text-[#191F28] truncate">{title}</div>
                  <div className="text-[11px] text-[#8B95A1] mt-0.5 truncate flex gap-1.5">
                    <span className="shrink-0">{fmtRelative(n.updatedAt)}</span>
                    {preview && (
                      <>
                        <span>·</span>
                        <span className="truncate">{preview}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function PhoneClientViewer({ clients }: { clients: ClientMini[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const now = useNow();
  const [focusKey, setFocusKey] = useState(0); // 단축키로 SearchView 재-포커스 트리거
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [newNoteTrigger, setNewNoteTrigger] = useState(0);
  const [wallpaper, setWallpaper] = useState<Wallpaper>(DEFAULT_WALLPAPER);
  const [appPositions, setAppPositions] = useState<AppPositions>(DEFAULT_APP_POSITIONS);
  const [draggingApp, setDraggingApp] = useState<DockAppId | null>(null);

  // localStorage 로드 + 다른 창(팝업)에서 변경시 실시간 sync
  useEffect(() => {
    try {
      const p = localStorage.getItem(PINNED_KEY);
      const r = localStorage.getItem(RECENT_KEY);
      const w = localStorage.getItem(WALLPAPER_KEY);
      const ap = localStorage.getItem(APP_POSITIONS_KEY);
      if (p) setPinnedIds(JSON.parse(p));
      if (r) setRecentIds(JSON.parse(r));
      if (w) setWallpaper(JSON.parse(w));
      if (ap) setAppPositions({ ...DEFAULT_APP_POSITIONS, ...JSON.parse(ap) });
    } catch {}

    function onStorage(e: StorageEvent) {
      try {
        if (e.key === PINNED_KEY && e.newValue) setPinnedIds(JSON.parse(e.newValue));
        if (e.key === RECENT_KEY && e.newValue) setRecentIds(JSON.parse(e.newValue));
        if (e.key === WALLPAPER_KEY && e.newValue) setWallpaper(JSON.parse(e.newValue));
        if (e.key === APP_POSITIONS_KEY && e.newValue) {
          setAppPositions({ ...DEFAULT_APP_POSITIONS, ...JSON.parse(e.newValue) });
        }
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function changeWallpaper(w: Wallpaper) {
    setWallpaper(w);
    try { localStorage.setItem(WALLPAPER_KEY, JSON.stringify(w)); } catch {}
  }

  function moveAppTo(id: DockAppId, target: "dock" | "home") {
    setAppPositions((prev) => {
      const next = { ...prev, [id]: target };
      try { localStorage.setItem(APP_POSITIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // 클라이언트 상세 진입 시 최근 본에 추가 (LRU 10개)
  useEffect(() => {
    if (selectedId == null) return;
    setRecentIds((prev) => {
      const next = [selectedId, ...prev.filter((i) => i !== selectedId)].slice(0, 10);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [selectedId]);

  function togglePin(id: number) {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // ID → 클라이언트 객체 매핑
  const clientMap = useMemo(() => {
    const m = new Map<number, ClientMini>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

  const pinnedClients = useMemo(
    () => pinnedIds.map((id) => clientMap.get(id)).filter(Boolean) as ClientMini[],
    [pinnedIds, clientMap]
  );
  const recentClients = useMemo(
    () => recentIds.map((id) => clientMap.get(id)).filter(Boolean) as ClientMini[],
    [recentIds, clientMap]
  );

  const clientResults = useMemo(() => {
    const qRaw = query.trim().toLowerCase();
    if (!qRaw) return [];
    const qNorm = qRaw.replace(/[-\s]/g, "");
    return clients
      .filter((c) => {
        const name = c.name.toLowerCase();
        const ceo = (c.ceoName ?? "").toLowerCase();
        const bizRaw = (c.bizNumber ?? "").toLowerCase();
        const bizNorm = bizRaw.replace(/[-\s]/g, "");
        const phoneRaw = (c.phone ?? "").toLowerCase();
        const phoneNorm = phoneRaw.replace(/[-\s]/g, "");
        return (
          name.includes(qRaw) ||
          ceo.includes(qRaw) ||
          bizRaw.includes(qRaw) ||
          bizNorm.includes(qNorm) ||
          phoneRaw.includes(qRaw) ||
          phoneNorm.includes(qNorm)
        );
      })
      .slice(0, 30);
  }, [query, clients]);

  const siteResults = useMemo(() => {
    const qRaw = query.trim().toLowerCase();
    if (!qRaw) return [];
    return BUILTIN_SITES.filter((s) => {
      return s.name.toLowerCase().includes(qRaw) || s.keywords.toLowerCase().includes(qRaw);
    });
  }, [query]);

  // 북마크 fetch (debounce 200ms)
  const [bookmarks, setBookmarks] = useState<BookmarkResult[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setBookmarks([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setBookmarks(data.bookmarks ?? []);
      } catch {
        setBookmarks([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // 호환: 기존 results 사용처 — 클라이언트만
  const results = clientResults;

  // 부모 창(대시보드) 또는 자기 창 — ChatBot/외부링크 라우팅용
  function getParentOrSelf(): Window {
    if (typeof window === "undefined") return null as any;
    return window.opener && !window.opener.closed ? window.opener : window;
  }

  // 단축키: Shift+S/H/N + Shift+A 부모창 포워딩
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (typing) return;
      // Shift+S 제거 — / 로 통일
      if (e.shiftKey && (e.key === "H" || e.key === "h")) {
        e.preventDefault();
        setSelectedId(null);
        setQuery("");
        setViewMode("home");
      }
      if (e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setSelectedId(null);
        setQuery("");
        setViewMode("notes");
        setNewNoteTrigger((c) => c + 1);
      }
      // Shift+A: 폰 안의 AI 챗봇 열기
      if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        setSelectedId(null);
        setQuery("");
        setViewMode("chatbot");
      }
      // / : 폰 안에서 검색 열기 (팝업/PWA에서만, 메인 대시보드는 부모 GlobalSearch가 처리)
      if (e.key === "/" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const isPopupOrStandalone = typeof window !== "undefined" && (window.opener || window.matchMedia("(display-mode: standalone)").matches);
        if (isPopupOrStandalone) {
          e.preventDefault();
          setSelectedId(null);
          setQuery("");
          setViewMode("search");
          setFocusKey((k) => k + 1);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${selectedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDetail(data.client);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div className="sticky top-0 flex items-start justify-center">
      {/* iPhone 프레임 */}
      <div
        className="relative bg-[#1a1a1a] rounded-[52px] p-[11px]"
        style={{
          width: "320px",
          height: "690px",
          boxShadow:
            "0 30px 60px -15px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 0 3px #2a2a2a inset",
        }}
      >
        {/* 사이드 버튼 (장식) */}
        <div className="absolute -left-[2px] top-[120px] w-[3px] h-[32px] bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute -left-[2px] top-[170px] w-[3px] h-[56px] bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute -left-[2px] top-[240px] w-[3px] h-[56px] bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute -right-[2px] top-[180px] w-[3px] h-[80px] bg-[#2a2a2a] rounded-r-sm" />

        {/* 화면 */}
        <div className="relative w-full h-full bg-white rounded-[42px] overflow-hidden flex flex-col">
          {/* Wallpaper — home 모드일 때만 (사용자가 선택한 배경) */}
          {viewMode === "home" && (
            <div className="absolute inset-0 z-0 pointer-events-none" style={getWallpaperStyle(wallpaper)} />
          )}

          {/* Dynamic Island */}
          <div
            className="absolute top-[10px] left-1/2 -translate-x-1/2 bg-black rounded-full z-20 pointer-events-none"
            style={{ width: "100px", height: "30px" }}
          />

          {/* Status bar — wallpaper 톤에 따라 흰/검정 자동 */}
          {(() => {
            const onLightBg = viewMode !== "home" || isLightWallpaper(wallpaper);
            return (
          <div
            className={`relative z-10 flex items-center justify-between px-7 pt-3 pb-1 text-[11px] font-bold shrink-0 transition-colors ${
              onLightBg ? "text-[#191F28]" : "text-white"
            }`}
            style={!onLightBg ? { textShadow: "0 1px 2px rgba(0,0,0,0.3)" } : undefined}
          >
            <span className="tabular-nums">{fmtTime(now)}</span>
            <div className="flex items-center gap-1">
              <svg width="15" height="10" viewBox="0 0 15 10" fill="currentColor">
                <rect x="0" y="7" width="3" height="3" rx="0.5" />
                <rect x="4" y="5" width="3" height="5" rx="0.5" />
                <rect x="8" y="3" width="3" height="7" rx="0.5" />
                <rect x="12" y="0" width="3" height="10" rx="0.5" />
              </svg>
              <svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor">
                <path d="M6 2.5c1.8 0 3.4.7 4.7 1.8l1.3-1.3C10.3 1.5 8.2.5 6 .5s-4.3 1-6 2.5L1.3 4.3C2.6 3.2 4.2 2.5 6 2.5zm0 3c1 0 1.9.3 2.6.9l1.4-1.4c-1.1-.9-2.5-1.5-4-1.5s-2.9.6-4 1.5L3.4 6.4C4.1 5.8 5 5.5 6 5.5zm0 3l2-2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8l2 2z" />
              </svg>
              <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
                <rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="currentColor" />
                <rect x="2" y="2" width="14" height="6" rx="1" fill="currentColor" />
                <rect x="19.5" y="3.5" width="1.5" height="3" rx="0.5" fill="currentColor" />
              </svg>
            </div>
          </div>
            );
          })()}

          {/* 컨텐츠 */}
          <div className="relative z-10 flex-1 overflow-hidden flex flex-col pt-2">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-[12px] text-[#8B95A1]">불러오는 중...</div>
              </div>
            ) : viewMode === "detail" && detail ? (
              <ClientDetailView
                detail={detail}
                onBack={() => {
                  setSelectedId(null);
                  setViewMode("search");
                }}
                isPinned={pinnedIds.includes(detail.id)}
                onTogglePin={() => togglePin(detail.id)}
              />
            ) : viewMode === "search" ? (
              <SearchView
                key={focusKey}
                query={query}
                setQuery={setQuery}
                clientResults={clientResults}
                siteResults={siteResults}
                bookmarkResults={bookmarks}
                onSelectClient={(id) => {
                  setSelectedId(id);
                  setViewMode("detail");
                }}
                onOpenSite={(site) => {
                  const target = getParentOrSelf();
                  try { target?.focus(); } catch {}
                  const openFn = (url: string) => (target ?? window).open(url, "_blank", "noopener,noreferrer");
                  void handleSiteOpen(site, openFn);
                }}
                onOpenBookmark={(b) => {
                  const target = getParentOrSelf();
                  try { target?.focus(); } catch {}
                  // 북마크 클릭 카운트 증가
                  fetch("/api/search/bookmark-click", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: b.id }),
                  }).catch(() => {});
                  (target ?? window).open(b.url, "_blank", "noopener,noreferrer");
                }}
                onOpenPath={(path) => {
                  const target = getParentOrSelf();
                  try { target?.focus(); } catch {}
                  (target ?? window).open(path, "_blank", "noopener,noreferrer");
                }}
                onHome={() => {
                  setQuery("");
                  setSelectedId(null);
                  setViewMode("home");
                }}
              />
            ) : viewMode === "notes" ? (
              <NotesView onHome={() => setViewMode("home")} newNoteTrigger={newNoteTrigger} />
            ) : viewMode === "wallpaper" ? (
              <WallpaperPickerView
                current={wallpaper}
                onSelect={changeWallpaper}
                onHome={() => setViewMode("home")}
              />
            ) : viewMode === "chatbot" ? (
              <PhoneChatbotView onHome={() => setViewMode("home")} />
            ) : viewMode === "schedule" ? (
              <PhoneScheduleView onHome={() => setViewMode("home")} />
            ) : (() => {
              const appDefs: DockAppDef[] = [
                { id: "notes", name: "메모", Icon: NoteIcon, bg: "bg-gradient-to-br from-[#FBBF24] to-[#D97706]", action: () => setViewMode("notes") },
                { id: "ai", name: "AI", Icon: BotIcon, bg: "bg-gradient-to-br from-[#A855F7] to-[#6D28D9]", action: () => setViewMode("chatbot") },
                { id: "kakao", name: "카카오", Icon: KakaoTalkIcon, bg: "bg-[#FEE500]", iconColor: "text-[#191F28]", action: () => {
                  const url = "https://business.kakao.com/_AZwHn/chats";
                  const target = getParentOrSelf();
                  try { target?.focus(); } catch {}
                  (target ?? window).open(url, "_blank", "noopener,noreferrer");
                } },
                { id: "wallpaper", name: "배경", Icon: PhotosIcon, bg: "bg-gradient-to-br from-[#FBBF24] via-[#F472B6] via-[#A855F7] to-[#3182F6]", action: () => setViewMode("wallpaper") },
                { id: "schedule", name: "스케쥴", Icon: CalendarIcon, bg: "bg-gradient-to-br from-[#F87171] to-[#DC2626]", action: () => setViewMode("schedule") },
              ];
              return (
                <HomeView
                  recentClients={recentClients}
                  onLaunchSearch={() => {
                    setQuery("");
                    setViewMode("search");
                    setFocusKey((k) => k + 1);
                  }}
                  onSelectClient={(id) => {
                    setSelectedId(id);
                    setViewMode("detail");
                  }}
                  onLaunchGlobalSearch={() => {
                    setQuery("");
                    setSelectedId(null);
                    setViewMode("search");
                    setFocusKey((k) => k + 1);
                  }}
                  appDefs={appDefs}
                  appPositions={appPositions}
                  draggingApp={draggingApp}
                  setDraggingApp={setDraggingApp}
                  moveAppTo={moveAppTo}
                />
              );
            })()}
          </div>

          {/* 홈 인디케이터 — 클릭하면 홈으로 (실제 iPhone 제스처처럼) */}
          <button
            onClick={() => {
              setSelectedId(null);
              setQuery("");
              setViewMode("home");
            }}
            className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[140px] h-[10px] flex items-center justify-center group z-30"
            title="홈으로 (Shift+H)"
          >
            <span
              className={`block h-[4px] rounded-full transition-all ${
                viewMode === "home" ? "bg-white/85 w-[120px]" : "bg-[#191F28] w-[120px]"
              } group-hover:bg-[#3182F6] group-hover:w-[130px]`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
