"use client";

import Link from "next/link";
import { BarChartIcon, ClipboardListIcon, BookOpenIcon, MessageCircleIcon, BellIcon } from "@/components/icons";
import type { ComponentType } from "react";

type IconComp = ComponentType<{ width?: number; height?: number; className?: string }>;

const TABS: { key: string; label: string; Icon: IconComp }[] = [
  { key: "overview", label: "현황", Icon: BarChartIcon },
  { key: "notice", label: "공지사항", Icon: ClipboardListIcon },
  { key: "knowledge", label: "지식한입", Icon: BookOpenIcon },
  { key: "feedback", label: "피드백", Icon: BellIcon },
  { key: "memo", label: "임시메모함", Icon: MessageCircleIcon },
];

export function DashboardTabs({ activeTab, tempMemoCount }: { activeTab: string; tempMemoCount: number }) {
  return (
    <div className="inline-flex gap-0.5 mb-6 p-1 bg-[#F2F4F6] rounded-[12px]">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.Icon;
        return (
          <Link
            key={tab.key}
            href={`/dashboard?tab=${tab.key}`}
            className={`flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-[10px] transition-all ${
              isActive
                ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-[#6B7684] hover:text-[#191F28] font-[500]"
            }`}
          >
            <Icon width={14} height={14} />
            {tab.label}
            {tab.key === "memo" && tempMemoCount > 0 && (
              <span className="bg-[#3182F6] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                {tempMemoCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
