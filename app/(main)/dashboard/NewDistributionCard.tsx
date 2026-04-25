"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NewDistributionCard({ count, ids }: { count: number; ids: number[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (count === 0) return null;

  function handleConfirmAll() {
    startTransition(async () => {
      await fetch("/api/distribution/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      router.refresh();
    });
  }

  return (
    <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-[14px] px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🆕</span>
        <span className="text-sm font-[500] text-[#1e40af]">새 거래처 배분 {count}건</span>
        <Link href="/distribution" className="text-xs text-[#1e40af] hover:underline ml-auto">배분 탭 →</Link>
        <button
          onClick={handleConfirmAll}
          disabled={isPending}
          className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#3182F6] text-white hover:bg-[#1B64DA] disabled:opacity-50 ml-1"
        >
          확인
        </button>
      </div>
    </div>
  );
}
