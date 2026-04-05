"use client";

import Link from "next/link";

const TABS = [
  { key: "overview", label: "현황", icon: "📊" },
  { key: "notice", label: "공지사항", icon: "📋" },
  { key: "memo", label: "임시메모함", icon: "💬" },
];

export function DashboardTabs({ activeTab, tempMemoCount }: { activeTab: string; tempMemoCount: number }) {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/dashboard?tab=${tab.key}`}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.key
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <span>{tab.icon}</span>
          {tab.label}
          {tab.key === "memo" && tempMemoCount > 0 && (
            <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {tempMemoCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
