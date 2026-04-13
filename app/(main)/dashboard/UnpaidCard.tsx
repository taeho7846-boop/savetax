"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UnpaidClient = {
  id: number;
  name: string;
  phone: string | null;
  monthlyFee: number;
  unpaidMonths: string[];
  totalUnpaid: number;
  postponedUntil: string | null;
  postponeNote: string | null;
};

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [postponeModal, setPostponeModal] = useState<{ clientId: number; clientName: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const activeClients = clients.filter(c => !c.postponedUntil);
  const postponedClients = clients.filter(c => c.postponedUntil);
  const totalAmount = activeClients.reduce((s, c) => s + c.totalUnpaid, 0);
  const display = expanded ? activeClients : activeClients.slice(0, 8);

  async function handlePostpone(clientId: number, until: string, note: string) {
    setSaving(true);
    await fetch("/api/receivables/postpone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, postponedUntil: until, note }),
    });
    setSaving(false);
    setPostponeModal(null);
    router.refresh();
  }

  async function handleCancelPostpone(clientId: number) {
    await fetch("/api/receivables/postpone", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.refresh();
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* 헤더 */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">💸</span>
        <h2 className="font-medium text-gray-700">미수납</h2>
        {activeClients.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeClients.length}</span>
        )}
        {totalAmount > 0 && (
          <span className="ml-auto text-xs text-red-500 font-medium">{totalAmount.toLocaleString()}원</span>
        )}
      </div>

      {/* 위쪽: 독촉 대상 */}
      <div className="divide-y divide-gray-50">
        {activeClients.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">독촉 대상이 없습니다</div>
        ) : (
          <>
            {display.map(client => (
              <div key={client.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{client.name}</div>
                  <div className="text-[10px] text-red-400 mt-0.5">
                    {client.unpaidMonths.map(m => `${parseInt(m.split("-")[1])}월`).join(", ")} 미수납
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-medium text-red-600">{client.totalUnpaid.toLocaleString()}원</span>
                  <button
                    onClick={() => alert("솔라피 연동 후 활성화됩니다")}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-yellow-400 text-gray-900 font-bold hover:bg-yellow-500"
                  >
                    카카오톡독촉
                  </button>
                  <button
                    onClick={() => setPostponeModal({ clientId: client.id, clientName: client.name })}
                    className="text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
                  >
                    미루기
                  </button>
                </div>
              </div>
            ))}
            {activeClients.length > 8 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                {expanded ? "접기" : `+${activeClients.length - 8}개 더 보기`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 아래쪽: 미루기 중 */}
      {postponedClients.length > 0 && (
        <>
          <div className="px-5 py-2 bg-orange-50 border-t border-orange-200 flex items-center gap-2">
            <span className="text-xs">⏰</span>
            <span className="text-xs font-medium text-orange-700">미루기 중</span>
            <span className="text-[10px] text-orange-500">{postponedClients.length}건</span>
          </div>
          <div className="divide-y divide-orange-100 bg-orange-50/30">
            {postponedClients.map(client => (
              <div key={client.id} className="px-5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-600 truncate">{client.name}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {client.unpaidMonths.map(m => `${parseInt(m.split("-")[1])}월`).join(", ")} · {client.totalUnpaid.toLocaleString()}원
                    {client.postponeNote && <span className="ml-1 text-orange-500">— {client.postponeNote}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-orange-600 font-medium">{fmtDate(client.postponedUntil!)}까지</span>
                  <button
                    onClick={() => handleCancelPostpone(client.id)}
                    className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-600 hover:bg-orange-200"
                  >
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 미루기 모달 */}
      {postponeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPostponeModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">미루기</h3>
            <p className="text-xs text-gray-400 mb-4">{postponeModal.clientName}</p>
            <label className="text-xs text-gray-600 mb-1 block">미루기 날짜</label>
            <input
              type="date"
              id="postpone-date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
              min={new Date().toISOString().split("T")[0]}
            />
            <label className="text-xs text-gray-600 mb-1 block">사유 (선택)</label>
            <input
              type="text"
              id="postpone-note"
              placeholder="예: 다음주 입금 예정"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPostponeModal(null)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">취소</button>
              <button
                onClick={() => {
                  const date = (document.getElementById("postpone-date") as HTMLInputElement)?.value;
                  const note = (document.getElementById("postpone-note") as HTMLInputElement)?.value || "";
                  if (!date) { alert("날짜를 선택해주세요"); return; }
                  handlePostpone(postponeModal.clientId, date, note);
                }}
                disabled={saving}
                className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50"
              >
                {saving ? "저장 중..." : "미루기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
