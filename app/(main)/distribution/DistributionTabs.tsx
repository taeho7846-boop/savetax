"use client";

import Link from "next/link";

export function DistributionTabs({ tab }: { tab: string }) {
  const isCorporate = tab === "corporate";

  return (
    <>
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <Link
          href="/distribution?tab=corporate"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isCorporate
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          법인
        </Link>
        <Link
          href="/distribution?tab=individual"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            !isCorporate
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          개인
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
        {isCorporate ? "법인 배분 내용이 여기에 표시됩니다" : "개인 배분 내용이 여기에 표시됩니다"}
      </div>
    </>
  );
}
