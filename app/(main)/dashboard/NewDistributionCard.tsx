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
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🆕</span>
        <span className="text-sm font-medium text-blue-800">새 거래처 배분 {count}건</span>
        <Link href="/distribution" className="text-xs text-blue-500 hover:underline ml-auto">배분 탭 →</Link>
        <button
          onClick={handleConfirmAll}
          disabled={isPending}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ml-1"
        >
          확인
        </button>
      </div>
    </div>
  );
}
