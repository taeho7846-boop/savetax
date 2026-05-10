"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { TransferDocsCard } from "@/app/(main)/dashboard/TransferDocsCard";
import {
  LayoutDashboardIcon,
  BuildingIcon,
  FileTextIcon,
  BanknoteIcon,
  SettingsIcon,
  KeyIcon,
  BellIcon,
  LogOutIcon,
  LoaderIcon,
  CheckIcon,
  CalendarIcon,
  ClockIcon,
} from "@/components/icons";

type Settings = {
  agentHometaxId: string | null;
  agentHometaxPw: string | null;
  certName: string | null;
  certPassword: string | null;
};

type User = {
  name: string;
  role: string;
  allowedMenus: string | null;
};

type SubItem = { href: string; label: string };
type CatKey = "home" | "clients" | "filing" | "settle" | "ops";
type Category = { key: CatKey; label: string; icon: ReactNode; subs: SubItem[] };

const CATEGORIES: Category[] = [
  {
    key: "home",
    label: "홈",
    icon: <LayoutDashboardIcon width={14} height={14} />,
    subs: [{ href: "/dashboard", label: "현황" }],
  },
  {
    key: "clients",
    label: "거래처",
    icon: <BuildingIcon width={14} height={14} />,
    subs: [
      { href: "/clients", label: "기장대리" },
      { href: "/tax-agency", label: "신고대리" },
      { href: "/distribution", label: "Savetax 배분" },
      { href: "/distribution-taeho", label: "세무회계태호 배분" },
      { href: "/commission", label: "신규수임" },
      { href: "/receivables", label: "채권관리" },
    ],
  },
  {
    key: "filing",
    label: "신고",
    icon: <FileTextIcon width={14} height={14} />,
    subs: [
      { href: "/withholding", label: "원천세" },
      { href: "/income-tax", label: "종합소득세" },
      { href: "/freelancer-calc", label: "프리랜서 장부" },
      { href: "/data-collect", label: "자료수집" },
    ],
  },
  {
    key: "settle",
    label: "정산",
    icon: <BanknoteIcon width={14} height={14} />,
    subs: [
      { href: "/settlement", label: "Savetax 정산" },
      { href: "/revenue", label: "수익추이" },
    ],
  },
  {
    key: "ops",
    label: "운영",
    icon: <SettingsIcon width={14} height={14} />,
    subs: [
      { href: "/schedule", label: "스케쥴" },
      { href: "/tasks", label: "업무/메모" },
      { href: "/staff", label: "직원관리" },
      { href: "/settings", label: "설정" },
    ],
  },
];

type LoginStatus = "idle" | "loading" | "success" | "error";

type Notifications = {
  distribution: number;
  urgent: number;
  delayed: number;
};

export default function TopNav({
  user,
  settings,
  notifications = { distribution: 0, urgent: 0, delayed: 0 },
}: {
  user: User;
  settings: Settings | null;
  notifications?: Notifications;
}) {
  const pathname = usePathname();

  const allowedHrefs = (() => {
    if (user.role === "owner" || user.role === "admin") return null; // 전체 허용
    if (!user.allowedMenus) return null;
    return new Set(user.allowedMenus.split(",").map((k) => "/" + k));
  })();

  const visibleCategories = CATEGORIES.map((cat) => {
    const subs = cat.subs.filter((s) => {
      if (s.href === "/staff" && !(user.role === "owner" || user.role === "admin")) return false;
      if (allowedHrefs && !allowedHrefs.has(s.href) && s.href !== "/dashboard" && s.href !== "/settings" && s.href !== "/freelancer-calc") return false;
      return true;
    });
    return { ...cat, subs };
  }).filter((cat) => cat.subs.length > 0);

  const activeCat: CatKey =
    visibleCategories.find((cat) => cat.subs.some((s) => pathname.startsWith(s.href)))?.key ??
    visibleCategories[0]?.key ??
    "home";

  const activeSubs = visibleCategories.find((c) => c.key === activeCat)?.subs ?? [];

  return (
    <header className="sticky top-0 z-30 px-6 pt-4 pb-2 bg-gradient-to-b from-[#f0f4ff]/95 via-[#f0f4ff]/70 to-transparent">
      {/* Row 1: 3 pills */}
      <div className="flex items-center gap-3 mb-2.5">
        {/* 좌: 로고 */}
        <Link href="/dashboard" className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center text-white font-bold text-[15px] shadow-md shadow-[#3182F6]/30">
            S
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-tight text-[#191F28]">Savetax</div>
            <div className="text-[9.5px] text-[#6B7684]">세무 업무</div>
          </div>
        </Link>

        {/* 중: 카테고리 */}
        <div className="flex-1 flex justify-center">
          <div className="glass-strong rounded-2xl px-2 py-2 flex items-center gap-1">
            {visibleCategories.map((cat) => {
              const isActive = cat.key === activeCat;
              const defaultHref = cat.subs[0].href;
              return (
                <Link
                  key={cat.key}
                  href={defaultHref}
                  className={`px-4 py-2 rounded-xl text-[13.5px] font-bold transition flex items-center gap-1.5 ${
                    isActive
                      ? "text-white bg-[#3182F6]"
                      : "text-[#6B7684] hover:text-[#191F28] hover:bg-white/60"
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* 우: 이관자료 + 검색 + 알림 + 프로필 */}
        <div className="glass-strong rounded-2xl px-2 py-2 flex items-center gap-1.5">
          <TransferDocsBell />
          <SearchPill />
          <NotificationBell notifications={notifications} />
          <ProfileMenu user={user} settings={settings} />
        </div>
      </div>

      {/* Row 2: 서브탭 (개별 pill) */}
      {activeSubs.length > 1 && (
        <div className="flex items-center gap-3">
          {/* 좌측 placeholder (로고 pill 폭 매칭) */}
          <div className="invisible flex items-center gap-2 px-3 py-2" aria-hidden>
            <div className="w-9 h-9" />
            <div>
              <div className="text-[13px] font-bold">Savetax</div>
              <div className="text-[9.5px]">세무 업무</div>
            </div>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2">
              {activeSubs.map((s) => {
                const active = pathname.startsWith(s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={`rounded-xl px-4 py-2 text-[12.5px] font-bold transition ${
                      active
                        ? "text-white bg-[#3182F6]"
                        : "glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
                    }`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
          </div>
          {/* 우측 placeholder (검색·알림·프로필 pill 폭 매칭) */}
          <div className="invisible flex items-center gap-1.5 px-2 py-2" aria-hidden>
            <div className="w-[200px] h-9" />
            <div className="w-9 h-9" />
            <div className="w-9 h-9" />
          </div>
        </div>
      )}
    </header>
  );
}

function SearchPill() {
  return (
    <button
      className="px-3 h-9 rounded-xl flex items-center gap-2 text-[12.5px] text-[#6B7684] hover:text-[#3182F6] hover:bg-white/60 transition w-[200px]"
      onClick={() => {
        window.dispatchEvent(new Event("savetax-open-global-search"));
      }}
      title="검색 (/)"
    >
      <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx={11} cy={11} r={8} />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="flex-1 text-left">검색</span>
      <kbd className="text-[10px] px-1.5 py-0.5 bg-white/80 rounded font-bold text-[#4E5968]">/</kbd>
    </button>
  );
}

function ProfileMenu({ user, settings }: { user: User; settings: Settings | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hasCredentials = !!(settings?.agentHometaxId && settings?.agentHometaxPw);
  const roleLabel =
    user.role === "owner" ? "대표"
      : user.role === "admin" ? "관리자"
      : user.role === "accountant" || user.role === "staff" ? "세무사"
      : user.role === "employee" ? "직원"
      : "조회전용";

  async function handleAgentLogin() {
    if (!settings?.agentHometaxId || !settings?.agentHometaxPw) return;
    setLoginStatus("loading");
    try {
      const json = JSON.stringify({
        id: settings.agentHometaxId,
        pw: settings.agentHometaxPw,
        certName: settings.certName || "",
        certPw: settings.certPassword || "",
      });
      const creds = btoa(unescape(encodeURIComponent(json)));
      window.open(
        `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
        "_blank"
      );
      setLoginStatus("success");
      setTimeout(() => setLoginStatus("idle"), 3000);
    } catch {
      setLoginStatus("error");
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182F6] to-[#1B64DA] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-[#3182F6]/30 cursor-pointer"
        title={user.name}
      >
        {user.name.charAt(0)}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 glass-strong rounded-2xl p-3 shadow-2xl z-40">
          {/* 사용자 정보 */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3182F6] to-[#1B64DA] flex items-center justify-center text-white font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-[#191F28] truncate">{user.name}</div>
              <div className="text-[11px] text-[#8B95A1] mt-0.5">{roleLabel}</div>
            </div>
          </div>

          <div className="my-2 h-px bg-white/40" />

          {/* 홈택스 로그인 */}
          {loginStatus === "idle" && (
            <button
              onClick={handleAgentLogin}
              disabled={!hasCredentials}
              className={`w-full h-10 flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-colors ${
                hasCredentials
                  ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
                  : "bg-[#F2F4F6] text-[#8B95A1] cursor-not-allowed"
              }`}
              title={hasCredentials ? "" : "설정 → 홈택스 계정 등록 필요"}
            >
              <KeyIcon width={13} height={13} />
              홈택스 로그인
            </button>
          )}
          {loginStatus === "loading" && (
            <div className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-white text-[12.5px] text-[#4E5968]">
              <LoaderIcon width={13} height={13} />
              실행 중...
            </div>
          )}
          {loginStatus === "success" && (
            <div className="w-full h-10 flex items-center justify-center gap-1.5 rounded-xl bg-[#E7F7EE] border border-[#BBF7D0] text-[12.5px] text-[#16A865] font-bold">
              <CheckIcon width={13} height={13} />
              로그인 완료
            </div>
          )}
          {loginStatus === "error" && (
            <button
              onClick={handleAgentLogin}
              className="w-full h-10 rounded-xl bg-[#FEE2E2] text-[#DC2626] text-[12.5px] font-bold"
            >
              ✕ 오류 — 재시도
            </button>
          )}

          <div className="my-2 h-px bg-white/40" />

          {/* 로그아웃 */}
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 font-medium transition-colors"
            >
              <LogOutIcon width={13} height={13} />
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NotificationBell({ notifications }: { notifications: Notifications }) {
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  const total = notifications.distribution + notifications.urgent + notifications.delayed;

  // 마운트 시 localStorage에서 baseline 로드
  useEffect(() => {
    const stored = parseInt(localStorage.getItem("bell_baseline") || "0", 10);
    setBaseline(Number.isFinite(stored) ? stored : 0);
  }, []);

  // total이 baseline보다 작아지면 (업무 처리 등) baseline도 따라 내림
  useEffect(() => {
    if (total < baseline) {
      localStorage.setItem("bell_baseline", String(total));
      setBaseline(total);
    }
  }, [total, baseline]);

  // 드롭다운 열면 자동으로 "읽음" 처리
  useEffect(() => {
    if (open && total > baseline) {
      localStorage.setItem("bell_baseline", String(total));
      setBaseline(total);
    }
  }, [open, total, baseline]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // 뱃지 = baseline 대비 새로 늘어난 만큼만
  const badgeCount = Math.max(0, total - baseline);

  function markAllRead() {
    localStorage.setItem("bell_baseline", String(total));
    setBaseline(total);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-xl hover:bg-white/60 flex items-center justify-center text-[#6B7684]"
        title={badgeCount > 0 ? `새 알림 ${badgeCount}건` : "알림"}
      >
        <BellIcon width={16} height={16} />
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#DC2626] text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 glass-strong rounded-2xl p-2 shadow-2xl z-40">
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="text-[13px] font-bold text-[#191F28]">알림</div>
            <div className="flex items-center gap-1.5">
              {total > 0 && (
                <span className="text-[11px] text-[#DC2626] font-bold bg-[#DC2626]/10 px-2 py-0.5 rounded-full">{total}건</span>
              )}
              {badgeCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] text-[#3182F6] font-bold hover:underline px-1"
                  title="새 알림 표시 끄기"
                >
                  모두 읽음
                </button>
              )}
            </div>
          </div>
          <div className="my-1 h-px bg-white/40" />
          {total === 0 ? (
            <div className="py-6 text-center text-[12px] text-[#8B95A1]">새 알림이 없어요</div>
          ) : (
            <div className="space-y-1">
              {notifications.distribution > 0 && (
                <Link
                  href="/distribution"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/60 transition"
                >
                  <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center text-white shrink-0">
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#191F28]">신규 거래처 배분</div>
                    <div className="text-[11px] text-[#6B7684]">미확인 배정 건</div>
                  </div>
                  <span className="text-[14px] font-bold text-[#3182F6] tabular-nums shrink-0">{notifications.distribution}</span>
                </Link>
              )}
              {notifications.urgent > 0 && (
                <Link
                  href="/tasks"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/60 transition"
                >
                  <div className="w-9 h-9 rounded-xl gradient-amber flex items-center justify-center text-white shrink-0">
                    <CalendarIcon width={18} height={18} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#191F28]">마감 임박</div>
                    <div className="text-[11px] text-[#6B7684]">3일 이내 마감</div>
                  </div>
                  <span className="text-[14px] font-bold text-[#D97706] tabular-nums shrink-0">{notifications.urgent}</span>
                </Link>
              )}
              {notifications.delayed > 0 && (
                <Link
                  href="/tasks?status=delayed"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/60 transition"
                >
                  <div className="w-9 h-9 rounded-xl gradient-rose flex items-center justify-center text-white shrink-0">
                    <ClockIcon width={18} height={18} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#191F28]">지연 업무</div>
                    <div className="text-[11px] text-[#6B7684]">마감 지난 건</div>
                  </div>
                  <span className="text-[14px] font-bold text-[#DC2626] tabular-nums shrink-0">{notifications.delayed}</span>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransferDocsBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마운트 시 + 갱신 이벤트 수신 시 신규 이관자료 카운트 조회
  useEffect(() => {
    function refetch() {
      fetch("/api/transfer-docs")
        .then((r) => r.json())
        .then((d) => setCount((d.pending ?? []).length))
        .catch(() => setCount(0));
    }
    refetch();
    window.addEventListener("transfer-docs-updated", refetch);
    return () => window.removeEventListener("transfer-docs-updated", refetch);
  }, []);

  // 드롭다운 열릴 때마다 최신 카운트로 갱신
  useEffect(() => {
    if (!open) return;
    fetch("/api/transfer-docs")
      .then((r) => r.json())
      .then((d) => setCount((d.pending ?? []).length))
      .catch(() => {});
  }, [open]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  }

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 h-9 rounded-xl flex items-center gap-1.5 text-[12px] font-bold text-[#6B7684] hover:text-[#3182F6] hover:bg-white/60 transition border border-[#E5E8EB]/70 bg-white/40"
        title="이관자료 (호버 또는 클릭)"
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
        <span>이관자료</span>
        {count !== null && count > 0 && (
          <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#DC2626] text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[540px] max-h-[640px] overflow-y-auto glass-strong rounded-2xl shadow-2xl z-40 p-3">
          <TransferDocsCard />
        </div>
      )}
    </div>
  );
}
