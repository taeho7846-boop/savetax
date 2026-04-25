"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";
import { logout } from "@/app/actions/auth";
import { ChatBot } from "./ChatBot";
import {
  LayoutDashboardIcon,
  BuildingIcon,
  ClipboardListIcon,
  FileTextIcon,
  ReceiptIcon,
  FileSpreadsheetIcon,
  WalletIcon,
  DownloadIcon,
  BarChartIcon,
  BanknoteIcon,
  TrendingUpIcon,
  CalendarIcon,
  CheckSquareIcon,
  UsersIcon,
  SettingsIcon,
  KeyIcon,
  LogOutIcon,
  LoaderIcon,
  CheckIcon,
} from "./icons";

type IconComp = ComponentType<SVGProps<SVGSVGElement>>;

const menus: { href: string; label: string; Icon: IconComp }[] = [
  { href: "/dashboard", label: "대시보드", Icon: LayoutDashboardIcon },
  { href: "/clients", label: "고객사관리", Icon: BuildingIcon },
  { href: "/commission", label: "신규수임", Icon: ClipboardListIcon },
  { href: "/tax-agency", label: "신고대리", Icon: FileTextIcon },
  { href: "/withholding", label: "원천세", Icon: ReceiptIcon },
  { href: "/income-tax", label: "종합소득세", Icon: FileSpreadsheetIcon },
  { href: "/receivables", label: "채권관리", Icon: WalletIcon },
  { href: "/data-collect", label: "자료수집", Icon: DownloadIcon },
  { href: "/distribution", label: "Savetax 배분", Icon: BarChartIcon },
  { href: "/settlement", label: "Savetax 정산", Icon: BanknoteIcon },
  { href: "/distribution-taeho", label: "세무회계태호 배분", Icon: BarChartIcon },
  { href: "/revenue", label: "수익추이", Icon: TrendingUpIcon },
  { href: "/schedule", label: "스케쥴", Icon: CalendarIcon },
  { href: "/tasks", label: "업무/메모", Icon: CheckSquareIcon },
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
  user: { name: string; role: string; allowedMenus: string | null };
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

  const roleLabel =
    user.role === "owner"
      ? "대표"
      : user.role === "admin"
      ? "관리자"
      : user.role === "accountant"
      ? "세무사"
      : user.role === "employee"
      ? "직원"
      : user.role === "staff"
      ? "세무사"
      : "조회전용";

  const visibleMenus = menus.filter((menu) => {
    if (user.role === "owner" || user.role === "admin") return true;
    if (!user.allowedMenus) return true;
    const allowed = user.allowedMenus.split(",");
    const menuKey = menu.href.replace("/", "");
    return allowed.includes(menuKey);
  });

  return (
    <aside className="w-60 bg-[#ffffff] h-full flex flex-col border-r border-[#F2F4F6]">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-[#3182F6] flex items-center justify-center">
            <span className="text-white text-[14px] font-bold">S</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#191F28] text-[14px] font-bold leading-tight tracking-tight">
              Savetax
            </div>
            <div className="text-[#8B95A1] text-[10.5px] leading-tight mt-0.5 font-[500]">
              세무 업무 관리
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pb-3 overflow-y-auto">
        <div className="space-y-px">
          {visibleMenus.map((m) => (
            <NavItem key={m.href} {...m} pathname={pathname} />
          ))}
        </div>

        {/* Admin section */}
        <div className="mt-4 pt-3 border-t border-[#F2F4F6]">
          <div className="px-3 mb-1.5 text-[10.5px] font-bold tracking-[0.04em] uppercase text-[#8B95A1]">
            관리
          </div>
          <div className="space-y-px">
            {(user.role === "owner" || user.role === "admin") && (
              <NavItem href="/staff" label="직원관리" Icon={UsersIcon} pathname={pathname} />
            )}
            <NavItem href="/settings" label="설정" Icon={SettingsIcon} pathname={pathname} />
          </div>
        </div>
      </nav>

      {/* AI assistant + Hometax quick action */}
      <div className="px-3 pb-3 space-y-2">
        <ChatBot />

        <div>
          {loginStatus === "idle" && (
            <button
              onClick={handleAgentLogin}
              disabled={!hasCredentials}
              className={`w-full h-10 flex items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-bold transition-colors ${
                hasCredentials
                  ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
                  : "bg-[#F2F4F6] text-[#8B95A1] cursor-not-allowed"
              }`}
            >
              <KeyIcon width={13} height={13} />
              홈택스 로그인
            </button>
          )}
          {loginStatus === "loading" && (
            <div className="w-full h-9 flex items-center justify-center gap-2 rounded-[6px] bg-white text-[12.5px] text-[#4E5968]">
              <LoaderIcon width={13} height={13} />
              실행 중...
            </div>
          )}
          {loginStatus === "success" && (
            <div className="w-full h-9 flex items-center justify-center gap-1.5 rounded-[10px] bg-[#E7F7EE] border border-[#BBF7D0] text-[12.5px] text-[#16A865] font-bold">
              <CheckIcon width={13} height={13} />
              로그인 완료
            </div>
          )}
          {loginStatus === "error" && (
            <div className="space-y-1.5">
              <div className="text-[11.5px] text-[#E02E2E] text-center font-[500]">✕ {loginError}</div>
              <button
                onClick={handleAgentLogin}
                className="w-full text-[11.5px] text-[#6B7684] hover:text-[#191F28] underline text-center"
              >
                재시도
              </button>
            </div>
          )}
        </div>
      </div>

      {/* User */}
      <div className="px-2 py-3 border-t border-[#F2F4F6]">
        <div className="flex items-center gap-2.5 px-2 mb-1.5">
          <div className="w-8 h-8 rounded-full bg-[#E8F3FF] flex items-center justify-center text-[#3182F6] text-[12px] font-bold">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#191F28] text-[13px] font-bold truncate leading-tight">
              {user.name}
            </div>
            <div className="text-[#8B95A1] text-[11px] leading-tight mt-0.5 font-[500]">
              {roleLabel}
            </div>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-[12px] text-[#6B7684] hover:text-[#191F28] hover:bg-[#F9FAFB] font-[500] transition-colors"
          >
            <LogOutIcon width={13} height={13} />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  Icon,
  pathname,
}: {
  href: string;
  label: string;
  Icon: IconComp;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] transition-colors ${
        active
          ? "bg-[#F2F4F6] text-[#191F28] font-bold"
          : "text-[#4E5968] hover:text-[#191F28] hover:bg-[#F9FAFB] font-[500]"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r-full bg-[#3182F6]" />
      )}
      <Icon
        width={16}
        height={16}
        className={active ? "text-[#3182F6]" : "text-[#8B95A1] group-hover:text-[#4E5968]"}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
