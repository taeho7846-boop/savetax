"use client";

import { useState, useEffect, useTransition } from "react";
import { toggleVatStage, setVatFee, toggleVatExcluded, setVatMemo, type VatStage } from "@/app/actions/vat";

type Rec = {
  stageCollect: boolean;
  stageDraft: boolean;
  stageReview: boolean;
  stageFiled: boolean;
  stagePaid: boolean;
  fee: number | null;
  excluded: boolean;
  memo: string | null;
};

type ClientRow = {
  id: number;
  name: string;
  ceoName: string | null;
  clientType: string;
  taxationType: string | null;
  assignedUserName: string | null;
  record: Rec | null;
};

interface Props {
  clients: ClientRow[];
  period: string;
  activeTab: "bookkeeping" | "single";
  showAssignedUser: boolean;
}

const STAGES: { key: VatStage; label: string }[] = [
  { key: "stageCollect", label: "자료수집" },
  { key: "stageDraft", label: "신고서작성" },
  { key: "stageReview", label: "검토" },
  { key: "stageFiled", label: "신고완료" },
  { key: "stagePaid", label: "수금" },
];

const TAXATION_CHIP: Record<string, string> = {
  "과세": "border-[#3182F6] text-[#1B64DA] bg-[#F5F9FF] font-bold",
  "간이": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "간이(세금계산서발행)": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "상가임대업": "border-[#99F6E4] text-[#0F766E] bg-[#F0FDFA]",
};

function fmtWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function blankRec(activeTab: string): Rec {
  return {
    stageCollect: false, stageDraft: false, stageReview: false, stageFiled: false, stagePaid: false,
    fee: activeTab === "bookkeeping" ? 0 : null,
    excluded: false, memo: null,
  };
}

function buildMap(clients: ClientRow[], activeTab: string): Map<number, Rec> {
  const m = new Map<number, Rec>();
  for (const c of clients) {
    if (c.record) {
      m.set(c.id, {
        ...c.record,
        fee: c.record.fee ?? (activeTab === "bookkeeping" ? 0 : null),
      });
    } else {
      m.set(c.id, blankRec(activeTab));
    }
  }
  return m;
}

export function VatTable({ clients, period, activeTab, showAssignedUser }: Props) {
  const [recMap, setRecMap] = useState<Map<number, Rec>>(() => buildMap(clients, activeTab));
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");

  // 서버 새로고침으로 clients가 바뀌면 다시 동기화
  useEffect(() => {
    setRecMap(buildMap(clients, activeTab));
  }, [clients, activeTab]);

  function getRec(id: number): Rec {
    return recMap.get(id) ?? blankRec(activeTab);
  }

  function toggleStage(clientId: number, stage: VatStage) {
    setRecMap(prev => {
      const n = new Map(prev);
      const r = { ...getRecFrom(n, clientId) };
      r[stage] = !r[stage];
      n.set(clientId, r);
      return n;
    });
    startTransition(() => { toggleVatStage(clientId, period, stage); });
  }

  function getRecFrom(map: Map<number, Rec>, id: number): Rec {
    return map.get(id) ?? blankRec(activeTab);
  }

  function toggleExcluded(clientId: number) {
    setRecMap(prev => {
      const n = new Map(prev);
      const r = { ...getRecFrom(n, clientId) };
      r.excluded = !r.excluded;
      n.set(clientId, r);
      return n;
    });
    startTransition(() => { toggleVatExcluded(clientId, period); });
  }

  function changeFee(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    setRecMap(prev => {
      const n = new Map(prev);
      const r = { ...getRecFrom(n, clientId) };
      r.fee = Number.isNaN(num as number) ? null : num;
      n.set(clientId, r);
      return n;
    });
  }

  function commitFee(clientId: number) {
    const r = getRec(clientId);
    startTransition(() => { setVatFee(clientId, period, r.fee); });
  }

  function changeMemo(clientId: number, value: string) {
    setRecMap(prev => {
      const n = new Map(prev);
      const r = { ...getRecFrom(n, clientId) };
      r.memo = value;
      n.set(clientId, r);
      return n;
    });
  }

  function commitMemo(clientId: number) {
    const r = getRec(clientId);
    startTransition(() => { setVatMemo(clientId, period, r.memo ?? ""); });
  }

  const filtered = q.trim()
    ? clients.filter(c => c.name.includes(q.trim()) || (c.ceoName ?? "").includes(q.trim()))
    : clients;

  // 요약 (제외 제외)
  const active = filtered.filter(c => !getRec(c.id).excluded);
  const filedCount = active.filter(c => getRec(c.id).stageFiled).length;
  const paidCount = active.filter(c => getRec(c.id).stagePaid).length;
  const feeSum = active.reduce((s, c) => s + (getRec(c.id).fee ?? 0), 0);

  const colCount = 1 + (showAssignedUser ? 1 : 0) + STAGES.length + 3;

  return (
    <div className="flex flex-col gap-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="glass rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 bg-[#3182F6] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] uppercase pl-2">신고 대상</div>
          <div className="text-[22px] font-extrabold text-[#191F28] mt-1 pl-2">{active.length}곳</div>
        </div>
        <div className="glass rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 bg-[#15803D] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] uppercase pl-2">신고 완료</div>
          <div className="text-[22px] font-extrabold text-[#15803D] mt-1 pl-2">{filedCount}<span className="text-[14px] text-[#B0B8C1]"> / {active.length}</span></div>
        </div>
        <div className="glass rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 bg-[#7C3AED] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] uppercase pl-2">수금 완료</div>
          <div className="text-[22px] font-extrabold text-[#7C3AED] mt-1 pl-2">{paidCount}<span className="text-[14px] text-[#B0B8C1]"> / {active.length}</span></div>
        </div>
        <div className="glass rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 bg-[#F59E0B] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] uppercase pl-2">수수료 합계</div>
          <div className="text-[22px] font-extrabold text-[#191F28] mt-1 pl-2">{fmtWon(feeSum)}</div>
        </div>
      </div>

      {/* 검색 */}
      <div className="glass rounded-2xl p-2.5 flex items-center gap-2">
        <div className="flex-1 bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="거래처명 · 대표자 검색"
            className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]"
          />
        </div>
        {activeTab === "bookkeeping" && (
          <span className="text-[11px] text-[#8B95A1] pr-2">기장 거래처는 수수료 기본 0원 (필요 시 수정)</span>
        )}
      </div>

      {/* 테이블 */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="overflow-auto max-h-[68vh]">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-white/90 backdrop-blur-md border-b border-white/60">
                <th className="sticky left-0 top-0 z-30 bg-white/90 backdrop-blur-md text-left px-4 py-3 text-[#333D4B] font-medium min-w-[180px]">거래처명</th>
                {showAssignedUser && <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">담당자</th>}
                {STAGES.map((s, i) => (
                  <th key={s.key} className="text-center px-2 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[70px]">
                    <span className="text-[#B0B8C1] mr-0.5">{i + 1}</span>{s.label}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[110px]">신고수수료</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[120px]">메모</th>
                <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">제외</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {filtered.length === 0 && (
                <tr><td colSpan={colCount} className="text-center py-12 text-[#8B95A1]">대상 거래처가 없습니다</td></tr>
              )}
              {filtered.map((client) => {
                const r = getRec(client.id);
                const allDone = STAGES.every(s => r[s.key]);
                const chip = client.taxationType ? (TAXATION_CHIP[client.taxationType] ?? "border-[#D1D6DB] text-[#6B7684] bg-[#F9FAFB]") : null;
                const chipLabel = client.taxationType === "간이(세금계산서발행)" ? "간이(세계발행)" : client.taxationType;
                return (
                  <tr key={client.id} className={`transition-colors ${r.excluded ? "opacity-40" : allDone ? "bg-[#F1FBF4]/40 hover:bg-[#F1FBF4]/70" : "hover:bg-white/60"}`}>
                    {/* 거래처명 */}
                    <td className={`sticky left-0 z-10 px-4 py-3 whitespace-nowrap ${r.excluded ? "bg-white/70" : allDone ? "bg-[#F1FBF4]/70" : "bg-white/80"} backdrop-blur-md`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${r.excluded ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}>{client.name}</span>
                        {chip && <span className={`inline-flex items-center border ${chip} rounded-md px-1.5 py-0.5 text-[11px] whitespace-nowrap`}>{chipLabel}</span>}
                      </div>
                      <div className="text-[11px] text-[#8B95A1] mt-0.5">
                        {client.clientType === "corporate" ? "법인" : "개인"}
                        {client.ceoName ? ` · ${client.ceoName}` : ""}
                      </div>
                    </td>

                    {showAssignedUser && (
                      <td className="px-3 py-3 text-center text-xs text-[#4E5968] whitespace-nowrap">
                        {client.assignedUserName || <span className="text-[#B0B8C1]">-</span>}
                      </td>
                    )}

                    {/* 5단계 */}
                    {STAGES.map((s) => {
                      const on = r[s.key];
                      return (
                        <td key={s.key} className="px-2 py-3 text-center">
                          <button
                            onClick={() => toggleStage(client.id, s.key)}
                            disabled={r.excluded}
                            className={`w-8 h-8 rounded-full text-xs font-bold transition-colors disabled:opacity-40 ${
                              on ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]" : "bg-[#FEF2F2] text-[#F87171] hover:bg-[#FEE2E2]"
                            }`}
                            title={on ? `${s.label} 완료 (클릭: 취소)` : `${s.label} 미완료 (클릭: 완료)`}
                          >
                            {on ? "✓" : "✕"}
                          </button>
                        </td>
                      );
                    })}

                    {/* 수수료 */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          value={r.fee == null ? "" : r.fee.toLocaleString("ko-KR")}
                          onChange={(e) => changeFee(client.id, e.target.value)}
                          onBlur={() => commitFee(client.id)}
                          disabled={r.excluded}
                          inputMode="numeric"
                          placeholder={activeTab === "bookkeeping" ? "0" : "입력"}
                          className="w-[88px] bg-white/80 rounded-lg px-2 py-1.5 text-[13px] text-right text-[#191F28] outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-40"
                        />
                        <span className="text-[12px] text-[#8B95A1]">원</span>
                      </div>
                    </td>

                    {/* 메모 */}
                    <td className="px-3 py-3">
                      <input
                        value={r.memo ?? ""}
                        onChange={(e) => changeMemo(client.id, e.target.value)}
                        onBlur={() => commitMemo(client.id)}
                        disabled={r.excluded}
                        placeholder="-"
                        className="w-full min-w-[110px] bg-transparent rounded-lg px-2 py-1.5 text-[13px] text-[#191F28] outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-200 disabled:opacity-40"
                      />
                    </td>

                    {/* 제외 */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleExcluded(client.id)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-colors ${
                          r.excluded ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]" : "glass-strong text-[#8B95A1] hover:text-[#4E5968]"
                        }`}
                      >
                        {r.excluded ? "포함" : "제외"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
