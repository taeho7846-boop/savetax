"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";

const menus = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/clients", label: "고객사 관리", icon: "🏢" },
  { href: "/commission", label: "신규수임", icon: "📋" },
  { href: "/tax-agency", label: "신고대리", icon: "📄" },
  { href: "/receivables", label: "채권 관리", icon: "💰" },
  { href: "/tasks", label: "업무 일정", icon: "🗓️" },
  { href: "/memos", label: "내부 메모", icon: "📝" },
];

type LoginStatus = "idle" | "loading" | "success" | "error";

interface Settings {
  agentHometaxId: string | null;
  agentHometaxPw: string | null;
  certName: string | null;
  certPassword: string | null;
}

export default function Sidebar({
  user,
  settings,
}: {
  user: { name: string; role: string };
  settings: Settings | null;
}) {
  const pathname = usePathname();
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [loginError, setLoginError] = useState("");

  const hasCredentials = !!(settings?.agentHometaxId && settings?.agentHometaxPw);

  async function handleAgentLogin() {
    if (!settings?.agentHometaxId || !settings?.agentHometaxPw) return;
    setLoginStatus("loading");
    setLoginError("");
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
      setLoginError("오류 발생");
    }
  }

  return (
    <aside className="w-56 bg-[#1a2e4a] h-full flex flex-col">
      <div className="p-5 border-b border-[#243d61]">
        <h1 className="text-white font-bold text-base leading-tight">
          세무 업무 관리
        </h1>
        <p className="text-gray-400 text-xs mt-1">내부 직원 전용</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {menus.map((menu) => {
          const active = pathname.startsWith(menu.href);
          return (
            <Link
              key={menu.href}
              href={menu.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[#243d61] text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-[#243d61]"
              }`}
            >
              <span>{menu.icon}</span>
              <span>{menu.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 세무대리인 홈택스 로그인 */}
      <div className="px-3 pb-1">
        <div className="border border-[#2d4a6e] rounded-lg p-3">
          <div className="text-[10px] text-gray-500 mb-2 font-medium tracking-wide uppercase">
            세무대리인
          </div>
          {loginStatus === "idle" && (
            <button
              onClick={handleAgentLogin}
              disabled={!hasCredentials}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${
                hasCredentials
                  ? "bg-[#243d61] text-white hover:bg-[#2d4a6e] border border-[#3a5a82]"
                  : "bg-[#1f3654] text-gray-600 cursor-not-allowed"
              }`}
            >
              <span>🔐</span>
              홈택스 로그인
            </button>
          )}
          {loginStatus === "loading" && (
            <div className="w-full flex items-center justify-center gap-2 py-2 text-xs text-blue-300">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              실행 중...
            </div>
          )}
          {loginStatus === "success" && (
            <div className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-green-400 font-medium">
              ✓ 로그인 완료
            </div>
          )}
          {loginStatus === "error" && (
            <div className="space-y-1.5">
              <div className="text-xs text-red-400 text-center">✕ {loginError}</div>
              <button
                onClick={handleAgentLogin}
                className="w-full text-xs text-gray-500 hover:text-gray-300 underline text-center"
              >
                재시도
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 관리자 메뉴 */}
      <div className="px-3 pb-2 mt-1 space-y-1">
        {(user.role === "owner" || user.role === "admin") && (
          <Link
            href="/staff"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              pathname.startsWith("/staff")
                ? "bg-[#243d61] text-white font-medium"
                : "text-gray-400 hover:text-white hover:bg-[#243d61]"
            }`}
          >
            <span>👥</span>
            <span>직원 관리</span>
          </Link>
        )}
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-[#243d61] text-white font-medium"
              : "text-gray-400 hover:text-white hover:bg-[#243d61]"
          }`}
        >
          <span>⚙️</span>
          <span>설정</span>
        </Link>
      </div>

      <div className="p-4 border-t border-[#243d61]">
        <div className="text-gray-400 text-xs mb-2">
          <div className="text-white text-sm font-medium">{user.name}</div>
          <div className="text-gray-500">
            {user.role === "owner"
              ? "대표"
              : user.role === "admin"
              ? "관리자"
              : user.role === "staff"
              ? "실무자"
              : "조회전용"}
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left text-gray-400 hover:text-white text-xs py-1 transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}
