"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientContractStatus } from "@/app/actions/clients";

type TerminatedClient = {
  id: number;
  name: string;
  ceoName: string | null;
  bizNumber: string | null;
  clientType: string;
  monthlyFee: number | null;
  updatedAt: Date;
};

export function TerminatedBinButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-2 rounded-lg border border-[#D1D6DB] text-[#6B7684] hover:bg-[#F9FAFB] transition-colors flex items-center gap-1.5"
      >
        <span>🗂</span>
        해지거래처
        {count > 0 && (
          <span className="bg-[#E5E8EB] text-[#4E5968] text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{count}</span>
        )}
      </button>
      {open && <TerminatedBinModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TerminatedBinModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TerminatedClient[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // 데이터 로드
  useState(() => {
    fetch("/api/clients/terminated")
      .then(r => r.json())
      .then(setItems);
  });

  function handleReactivate(id: number, name: string) {
    if (!confirm(`'${name}'을(를) 다시 '계약중'으로 되돌리시겠습니까?`)) return;
    startTransition(async () => {
      await setClientContractStatus(id, "active");
      setItems(prev => prev?.filter(c => c.id !== id) ?? null);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F4F6] shrink-0">
          <div>
            <h3 className="text-base font-bold text-[#191F28]">🗂 해지거래처</h3>
            <p className="text-[11px] text-[#8B95A1] mt-0.5">계약종료된 거래처 · 데이터는 보존되며 종합소득세·채권관리에는 그대로 표시됩니다</p>
          </div>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="py-12 text-center text-[#8B95A1] text-sm">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[#8B95A1] text-sm">해지된 거래처가 없습니다</div>
          ) : (
            <div className="divide-y divide-[#F2F4F6]">
              {items.map(c => (
                <div key={c.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#191F28] truncate">{c.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F2F4F6] text-[#8B95A1] shrink-0">{c.clientType === "corporate" ? "법인" : "개인"}</span>
                    </div>
                    <div className="text-[10px] text-[#8B95A1] mt-0.5">
                      {c.ceoName || "-"} · {c.bizNumber || "-"}
                      {c.monthlyFee != null && ` · 월 ${c.monthlyFee.toLocaleString()}원`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleReactivate(c.id, c.name)}
                    disabled={isPending}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F1FBF4] text-[#15803D] hover:bg-[#E7F7EE] disabled:opacity-50 shrink-0"
                  >
                    해지취소
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
