"use client";

import { openQuickCapture } from "@/components/QuickCapture";

// 거래처 상세 상단: 거래처가 미리 채워진 빠른입력을 연다
export function QuickTaskButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  return (
    <button
      type="button"
      onClick={() => openQuickCapture({ clientId, clientName, mode: "task" })}
      className="bg-[#191F28] text-white text-sm px-4 py-2 rounded-lg hover:bg-black transition-colors flex items-center gap-1.5"
      title="이 거래처 할 일을 바로 추가 (Ctrl+Q)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
      할 일
    </button>
  );
}
