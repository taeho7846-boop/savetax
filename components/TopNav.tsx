"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
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
      { href: "/clients", label: "고객사관리" },
      { href: "/commission", label: "신규수임" },
      { href: "/receivables", label: "채권관리" },
    ],
  },
  {
    key: "filing",
    label: "신고",
    icon: <FileTextIcon width={14} height={14} />,
    subs: [
      { href: "/tax-agency", label: "신고대리" },
      { href: "/withholding", label: "원천세" },
      { href: "/income-tax", label: "종합소득세" },
      { href: "/data-collect", label: "자료수집" },
    ],
  },
  {
    key: "settle",
    label: "정산",
    icon: <BanknoteIcon width={14} height={14} />,
    subs: [
      { href: "/distribution", label: "Savetax 배분" },
      { href: "/settlement", label: "Savetax 정산" },
      { href: "/distribution-taeho", label: "세무회계태호 배분" },
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

export default function TopNav({
  user,
  settings,
}: {
  user: User;
  settings: Settings | null;
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
      if (allowedHrefs && !allowedHrefs.has(s.href) && s.href !== "/dashboard" && s.href !== "/settings") return false;
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
    <header className="sticky top-0 z-30 px-6 pt-4 pb-2 bg-gradient-to-b from-[#f0f4ff]/95 via-[#f0f4ff]/80 to-transparent">
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
                      ? "text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] shadow-md shadow-[#3182F6]/30"
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

        {/* 우: 검색 + 알림 + 프로필 */}
        <div className="glass-strong rounded-2xl px-2 py-2 flex items-center gap-1.5">
          <SearchPill />
          <button
            className="w-9 h-9 rounded-xl hover:bg-white/60 flex items-center justify-center text-[#6B7684]"
            title="알림"
          >
            <BellIcon width={16} height={16} />
          </button>
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
                    className={`glass-strong rounded-xl px-4 py-2 text-[12.5px] font-bold transition ${
                      active
                        ? "text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] border-transparent shadow-md shadow-[#3182F6]/30"
                        : "text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px"
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
        // GlobalSearch는 슬래시 단축키 기반으로 동작 — 실제 트리거는 GlobalSearch 컴포넌트가 처리
        const ev = new KeyboardEvent("keydown", { key: "/" });
        window.dispatchEvent(ev);
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
