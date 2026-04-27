"use client";

import { useState, useEffect, type ReactNode } from "react";

type NavLink = { tab: string; label: string; status?: boolean; badge?: string };
type NavGroup = { cat: string; links: NavLink[] };

export function SettingsShell({
  navGroups,
  progressNode,
  children,
  defaultActive = "hometax",
}: {
  navGroups: NavGroup[];
  progressNode?: ReactNode;
  children: ReactNode;
  defaultActive?: string;
}) {
  const [active, setActive] = useState(defaultActive);

  // hash 동기화 (새로고침 시 마지막 탭 유지, 다른 탭 링크에서도 점프 가능)
  useEffect(() => {
    const validTabs = new Set(navGroups.flatMap(g => g.links.map(l => l.tab)));
    function syncFromHash() {
      const h = (typeof window !== "undefined" ? window.location.hash : "").replace("#", "");
      if (h && validTabs.has(h)) setActive(h);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTab(tab: string) {
    setActive(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tab}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-4">
      {/* 활성 탭만 보이게 — display 토글로 (form 인풋 DOM 유지) */}
      <style dangerouslySetInnerHTML={{ __html: `
        [data-tab] { display: none !important; }
        [data-tab="${active}"] { display: block !important; }
      ` }} />

      {/* 좌측 sticky nav */}
      <aside className="self-start sticky top-[100px] space-y-3">
        <nav className="glass rounded-xl p-2">
          {navGroups.map((g, gi) => (
            <div key={g.cat}>
              <div className={`text-[10px] font-bold text-[#8B95A1] uppercase tracking-wider px-2.5 pb-1 ${gi === 0 ? "pt-1" : "pt-2.5"}`}>
                {g.cat}
              </div>
              {g.links.map(l => {
                const isActive = active === l.tab;
                return (
                  <button
                    key={l.tab}
                    type="button"
                    onClick={() => pickTab(l.tab)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-left transition ${
                      isActive
                        ? "bg-[#EDF3FF] text-[#1B64DA]"
                        : "text-[#6B7684] hover:bg-white/70 hover:text-[#191F28]"
                    }`}
                  >
                    {l.status !== undefined ? (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.status ? "bg-[#10B981]" : "bg-[#DC2626]"}`} />
                    ) : (
                      <span className="w-1.5 h-1.5 shrink-0" />
                    )}
                    <span className="flex-1 truncate">{l.label}</span>
                    {l.badge && (
                      <span className="text-[10px] font-semibold text-[#8B95A1] bg-[#F2F4F6] px-1.5 py-0.5 rounded">
                        {l.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {progressNode}
      </aside>

      {/* 우측 본문 */}
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
}
