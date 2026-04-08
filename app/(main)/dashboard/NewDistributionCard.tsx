"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type DistItem = {
  id: number;
  clientName: string;
  clientType: string;
  createdAt: string;
};

export function NewDistributionCard({ items }: { items: DistItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const router = useRouter();

  const visible = items.filter(i => !dismissed.has(i.id));

  function handleConfirm(id: number) {
    startTransition(async () => {
      await fetch("/api/distribution/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDismissed(prev => new Set(prev).add(id));
      router.refresh();
    });
  }

  function handleConfirmAll() {
    startTransition(async () => {
      await fetch("/api/distribution/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visible.map(i => i.id) }),
      });
      setDismissed(prev => {
        const next = new Set(prev);
        visible.forEach(i => next.add(i.id));
        return next;
      });
      router.refresh();
    });
  }

  if (visible.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-2 border-b border-blue-100">
        <span className="text-base">🆕</span>
        <span className="text-sm font-medium text-blue-800">새 거래처 배분 {visible.length}건</span>
        <Link href="/distribution" className="text-xs text-blue-500 hover:underline ml-auto">배분 탭 →</Link>
        <button
          onClick={handleConfirmAll}
          disabled={isPending}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ml-2"
        >
          전체 확인
        </button>
      </div>
      <div className="divide-y divide-blue-100">
        {visible.map(item => (
          <div key={item.id} className="px-5 py-2.5 flex items-center gap-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              item.clientType === "corporate" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
            }`}>
              {item.clientType === "corporate" ? "법인" : "개인"}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800">{item.clientName}</span>
            </div>
            <span className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleDateString("ko-KR")}</span>
            <button
              onClick={() => handleConfirm(item.id)}
              disabled={isPending}
              className="text-[10px] px-2 py-0.5 rounded bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 disabled:opacity-50"
            >
              확인
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
