"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClockIcon } from "@/components/icons";

type UnpaidClient = {
  id: number;
  name: string;
  phone: string | null;
  monthlyFee: number;
  affiliation: string | null;
  unpaidMonths: string[];
  totalUnpaid: number;
  postponedUntil: string | null;
  postponeNote: string | null;
  cmsStatus: string;
};

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);

  async function handleAlimtalk(clientId: number, clientName: string) {
    if (!confirm(`"${clientName}"에게 카카오톡 독촉을 발송하시겠습니까?`)) return;
    setSendingId(clientId);
    try {
      const res = await fetch("/api/alimtalk/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type: "fee_remind" }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert("카카오톡 독촉이 발송되었습니다");
    } catch { alert("발송 실패"); }
    finally { setSendingId(null); }
  }
  const [postponeModal, setPostponeModal] = useState<{ clientIds: number[]; clientName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("전체");
  const [postponedExpanded, setPostponedExpanded] = useState(false);

  // 소속 탭 옵션
  const affiliations = [...new Set(clients.map(c => c.affiliation).filter(Boolean))] as string[];
  const tabs = ["전체", ...affiliations];

  // 탭별 필터
  const tabClients = activeTab === "전체" ? clients : clients.filter(c => c.affiliation === activeTab);
  const activeClients = tabClients.filter(c => !c.postponedUntil);
  const postponedClients = tabClients.filter(c => c.postponedUntil);
  const totalAmount = activeClients.reduce((s, c) => s + c.totalUnpaid, 0);
  const display = expanded ? activeClients : activeClients.slice(0, 8);

  function toggleCheck(id: number) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === activeClients.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(activeClients.map(c => c.id)));
    }
  }

  async function handlePostpone(clientIds: number[], until: string, note: string) {
    setSaving(true);
    for (const clientId of clientIds) {
      await fetch("/api/receivables/postpone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, postponedUntil: until, note }),
      });
    }
    setSaving(false);
    setPostponeModal(null);
    setCheckedIds(new Set());
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
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/* 헤더 */}
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <span className="text-base">💸</span>
        <h2 className="font-[500] text-[#4E5968]">미수납</h2>
        {activeClients.length > 0 && (
          <span className="bg-[#f87171] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeClients.length}</span>
        )}
        {totalAmount > 0 && (
          <span className="ml-auto text-xs text-[#dc2626] font-[500]">{totalAmount.toLocaleString()}원</span>
        )}
      </div>

      {/* 소속 서브탭 */}
      {tabs.length > 1 && (
        <div className="px-5 pt-2 pb-1 flex gap-1 border-b border-[#E5E8EB]">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setCheckedIds(new Set()); setExpanded(false); }}
              className={`text-xs px-3 py-1.5 rounded-[6px] font-[500] transition-colors ${
                activeTab === tab
                  ? "bg-[#3182F6] text-white"
                  : "text-[#6B7684] hover:bg-[#F9FAFB]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* 체크 액션 바 */}
      {checkedIds.size > 0 && (
        <div className="px-5 py-2 bg-[#eff6ff] border-b border-[#bfdbfe] flex items-center gap-2">
          <span className="text-xs text-[#1e40af] font-[500]">{checkedIds.size}개 선택</span>
          <button
            onClick={() => {
              const names = activeClients.filter(c => checkedIds.has(c.id)).map(c => c.name);
              setPostponeModal({ clientIds: [...checkedIds], clientName: `${names[0]} 외 ${names.length - 1}건` });
            }}
            className="text-[10px] px-2.5 py-1 rounded-[6px] bg-white text-[#4E5968] hover:bg-[#F9FAFB] font-[500]"
          >
            일괄 미루기
          </button>
          <button
            onClick={() => setCheckedIds(new Set())}
            className="text-[10px] text-[#8B95A1] hover:text-[#4E5968] ml-auto"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 위쪽: 독촉 대상 */}
      <div className="divide-y divide-[#F2F4F6]">
        {activeClients.length === 0 ? (
          <div className="px-5 py-6 text-center text-[#8B95A1] text-sm">독촉 대상이 없습니다</div>
        ) : (
          <>
            {/* 전체 선택 */}
            <div className="px-5 py-1.5 flex items-center gap-2 bg-[#F9FAFB]">
              <input
                type="checkbox"
                checked={activeClients.length > 0 && checkedIds.size === activeClients.length}
                onChange={toggleAll}
                className="accent-[#5e6ad2] w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] text-[#8B95A1]">전체 선택</span>
            </div>
            {display.map(client => (
              <div key={client.id} className={`px-5 py-3 flex items-center gap-3 ${checkedIds.has(client.id) ? "bg-[rgba(59,130,246,0.06)]" : ""}`}>
                <input
                  type="checkbox"
                  checked={checkedIds.has(client.id)}
                  onChange={() => toggleCheck(client.id)}
                  className="accent-[#5e6ad2] w-3.5 h-3.5 cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-[500] text-[#191F28] truncate">{client.name}</div>
                  <div className="text-[10px] text-[#dc2626] mt-0.5 flex items-center gap-1">
                    {client.unpaidMonths.map(m => `${parseInt(m.split("-")[1])}월`).join(", ")} 미수납
                    {client.cmsStatus === "none" && (
                      <span className="px-1.5 py-0.5 rounded bg-[#F9FAFB] text-[#6B7684] font-[500]">미등록</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-[500] text-[#dc2626]">{client.totalUnpaid.toLocaleString()}원</span>
                  <button
                    onClick={() => handleAlimtalk(client.id, client.name)}
                    disabled={sendingId === client.id}
                    className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#fcd34d] text-[#0b0d10] font-bold hover:bg-[#fde68a] disabled:opacity-50"
                  >
                    {sendingId === client.id ? "발송중..." : "카카오톡독촉"}
                  </button>
                  <button
                    onClick={() => setPostponeModal({ clientIds: [client.id], clientName: client.name })}
                    className="text-[10px] px-2 py-1 rounded-[6px] bg-white text-[#6B7684] hover:bg-[#F9FAFB]"
                  >
                    미루기
                  </button>
                </div>
              </div>
            ))}
            {activeClients.length > 8 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="w-full py-2 text-xs text-[#8B95A1] hover:text-[#4E5968] text-center"
              >
                {expanded ? "접기" : `+${activeClients.length - 8}개 더 보기`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 아래쪽: 미루기 중 (접기/펴기) */}
      {postponedClients.length > 0 && (
        <>
          <button
            onClick={() => setPostponedExpanded(!postponedExpanded)}
            className="w-full px-5 py-2 bg-[#FFFBEB] border-t border-[#FDE68A] flex items-center gap-2 hover:bg-[#FEF3C7] transition-colors"
          >
            <ClockIcon width={12} height={12} className="text-[#D97706]" />
            <span className="text-xs font-bold text-[#D97706]">미루기 중</span>
            <span className="text-[10px] text-[#D97706]">{postponedClients.length}건</span>
            <span className="ml-auto text-[11px] text-[#D97706] font-bold">
              {postponedExpanded ? "접기 ▲" : "펴기 ▼"}
            </span>
          </button>
          {postponedExpanded && (
            <div className="divide-y divide-[#FDE68A] bg-[#FFFBEB]/40">
              {postponedClients.map(client => (
                <div key={client.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-[500] text-[#4E5968] truncate">{client.name}</div>
                    <div className="text-[10px] text-[#8B95A1] mt-0.5">
                      {client.unpaidMonths.map(m => `${parseInt(m.split("-")[1])}월`).join(", ")} · {client.totalUnpaid.toLocaleString()}원
                      {client.postponeNote && <span className="ml-1 text-[#D97706]">— {client.postponeNote}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[#D97706] font-[500]">{fmtDate(client.postponedUntil!)}까지</span>
                    <button
                      onClick={() => handleCancelPostpone(client.id)}
                      className="text-[10px] px-2 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] hover:bg-[#FEF3C7]"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 미루기 모달 */}
      {postponeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPostponeModal(null)}>
          <div className="bg-white rounded-2xl border border-[#E5E8EB] w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#191F28] mb-1">미루기</h3>
            <p className="text-xs text-[#8B95A1] mb-4">{postponeModal.clientName}</p>
            <label className="text-xs text-[#4E5968] mb-1 block">미루기 날짜</label>
            <input
              type="date"
              id="postpone-date"
              className="w-full bg-white border border-[#E5E8EB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] mb-3 focus:outline-none focus:border-[#3182F6]"
              min={new Date().toISOString().split("T")[0]}
            />
            <label className="text-xs text-[#4E5968] mb-1 block">사유 (선택)</label>
            <input
              type="text"
              id="postpone-note"
              placeholder="예: 25일 출금 예정"
              className="w-full bg-white border border-[#E5E8EB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] mb-4 focus:outline-none focus:border-[#3182F6]"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPostponeModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-[6px] hover:bg-[#F9FAFB]">취소</button>
              <button
                onClick={() => {
                  const date = (document.getElementById("postpone-date") as HTMLInputElement)?.value;
                  const note = (document.getElementById("postpone-note") as HTMLInputElement)?.value || "";
                  if (!date) { alert("날짜를 선택해주세요"); return; }
                  handlePostpone(postponeModal.clientIds, date, note);
                }}
                disabled={saving}
                className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50"
              >
                {saving ? "저장 중..." : `미루기${postponeModal.clientIds.length > 1 ? ` (${postponeModal.clientIds.length}건)` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
