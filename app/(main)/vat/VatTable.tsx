"use client";

import { useState, useEffect, useTransition } from "react";
import { setVatStage, toggleVatCheck, setVatFee, toggleVatExcluded, setVatMemo, type VatStage } from "@/app/actions/vat";

type Rec = {
  stage: VatStage;
  checklist: Record<string, boolean>;
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
  record: { stage: string; checklist: string | null; fee: number | null; excluded: boolean; memo: string | null } | null;
};

interface Props {
  clients: ClientRow[];
  period: string;
  activeTab: "bookkeeping" | "single";
  showAssignedUser: boolean;
}

const STAGES: { key: VatStage; label: string; color: string; tint: string }[] = [
  { key: "collect",  label: "자료수집",  color: "#92400E", tint: "#FEF3C7" },
  { key: "writing",  label: "작성중",    color: "#1B64DA", tint: "#E8F3FF" },
  { key: "approval", label: "결재",      color: "#B45309", tint: "#FEF3C7" },
  { key: "confirm",  label: "컨펌+보수", color: "#7C3AED", tint: "#F5E8FF" },
  { key: "done",     label: "신고완료",  color: "#15803D", tint: "#E7F7EE" },
];
const STAGE_INDEX: Record<VatStage, number> = { collect: 0, writing: 1, approval: 2, confirm: 3, done: 4 };

// 단계별 체크리스트 (그룹 + 항목). 항목은 자유롭게 추가 가능.
const CHECKLIST: Record<VatStage, { group?: string; items: { key: string; label: string }[] }[]> = {
  collect: [
    { items: [
      { key: "card_request", label: "카드수집요청" },
      { key: "card_excel", label: "카드엑셀자료 수취" },
      { key: "no_response", label: "무응답" },
    ] },
  ],
  writing: [
    { group: "매출", items: [
      { key: "sales_tax_invoice", label: "세금계산서" },
      { key: "sales_card", label: "신용카드" },
      { key: "sales_cash", label: "현금영수증" },
      { key: "sales_pg", label: "PG" },
    ] },
    { group: "매입", items: [
      { key: "buy_rent", label: "임차료" },
      { key: "buy_telecom", label: "통신비" },
      { key: "buy_car_deduct", label: "차량유지비(공제)" },
      { key: "buy_car_nondeduct", label: "차량유지비(불공제)" },
    ] },
  ],
  approval: [],
  confirm: [],
  done: [],
};

const TAXATION_CHIP: Record<string, string> = {
  "과세": "border-[#3182F6] text-[#1B64DA] bg-[#F5F9FF] font-bold",
  "간이": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "간이(세금계산서발행)": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "상가임대업": "border-[#99F6E4] text-[#0F766E] bg-[#F0FDFA]",
};

function fmtWon(n: number) { return n.toLocaleString("ko-KR") + "원"; }
function normStage(s: string | undefined): VatStage { return (STAGES.some(st => st.key === s) ? s : "collect") as VatStage; }
function parseChecklist(s: string | null | undefined): Record<string, boolean> {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, boolean>; } catch { return {}; }
}
function stageItemKeys(stage: VatStage): string[] {
  return CHECKLIST[stage].flatMap(g => g.items.map(i => i.key));
}

function buildMap(clients: ClientRow[], activeTab: string): Map<number, Rec> {
  const m = new Map<number, Rec>();
  for (const c of clients) {
    m.set(c.id, {
      stage: normStage(c.record?.stage),
      checklist: parseChecklist(c.record?.checklist),
      fee: c.record?.fee ?? (activeTab === "bookkeeping" ? 0 : null),
      excluded: c.record?.excluded ?? false,
      memo: c.record?.memo ?? null,
    });
  }
  return m;
}

export function VatTable({ clients, period, activeTab, showAssignedUser }: Props) {
  const [recMap, setRecMap] = useState<Map<number, Rec>>(() => buildMap(clients, activeTab));
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<VatStage | null>(null);

  useEffect(() => { setRecMap(buildMap(clients, activeTab)); }, [clients, activeTab]);

  function getRec(id: number): Rec {
    return recMap.get(id) ?? { stage: "collect", checklist: {}, fee: activeTab === "bookkeeping" ? 0 : null, excluded: false, memo: null };
  }
  function update(id: number, patch: Partial<Rec>) {
    setRecMap(prev => { const n = new Map(prev); n.set(id, { ...getRec(id), ...patch }); return n; });
  }

  function moveStage(clientId: number, dir: 1 | -1) {
    const cur = STAGE_INDEX[getRec(clientId).stage];
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, cur + dir))].key;
    update(clientId, { stage: next });
    startTransition(() => { setVatStage(clientId, period, next); });
  }
  function toggleCheck(clientId: number, key: string) {
    const r = getRec(clientId);
    update(clientId, { checklist: { ...r.checklist, [key]: !r.checklist[key] } });
    startTransition(() => { toggleVatCheck(clientId, period, key); });
  }
  function toggleExcluded(clientId: number) {
    update(clientId, { excluded: !getRec(clientId).excluded });
    startTransition(() => { toggleVatExcluded(clientId, period); });
  }
  function changeFee(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    update(clientId, { fee: Number.isNaN(num as number) ? null : num });
  }
  function commitFee(clientId: number) { startTransition(() => { setVatFee(clientId, period, getRec(clientId).fee); }); }
  function changeMemo(clientId: number, value: string) { update(clientId, { memo: value }); }
  function commitMemo(clientId: number) { startTransition(() => { setVatMemo(clientId, period, getRec(clientId).memo ?? ""); }); }

  const searched = q.trim()
    ? clients.filter(c => c.name.includes(q.trim()) || (c.ceoName ?? "").includes(q.trim()))
    : clients;
  const active = searched.filter(c => !getRec(c.id).excluded);
  const excluded = searched.filter(c => getRec(c.id).excluded);

  const stageCounts: Record<VatStage, number> = { collect: 0, writing: 0, approval: 0, confirm: 0, done: 0 };
  for (const c of active) stageCounts[getRec(c.id).stage]++;

  const shown = stageFilter ? active.filter(c => getRec(c.id).stage === stageFilter) : active;
  const feeSum = active.reduce((s, c) => s + (getRec(c.id).fee ?? 0), 0);

  const colCount = 1 + (showAssignedUser ? 1 : 0) + 5;

  function row(client: ClientRow, dim: boolean) {
    const r = getRec(client.id);
    const cur = STAGE_INDEX[r.stage];
    const meta = STAGES[cur];
    const keys = stageItemKeys(r.stage);
    const doneN = keys.filter(k => r.checklist[k]).length;
    const chip = client.taxationType ? (TAXATION_CHIP[client.taxationType] ?? "border-[#D1D6DB] text-[#6B7684] bg-[#F9FAFB]") : null;
    const chipLabel = client.taxationType === "간이(세금계산서발행)" ? "간이(세계발행)" : client.taxationType;
    return (
      <tr key={client.id} className={`align-top transition-colors ${dim ? "opacity-40" : "hover:bg-white/60"}`} style={dim ? undefined : { background: `${meta.tint}44` }}>
        {/* 거래처 */}
        <td className="sticky left-0 z-10 px-4 py-3 whitespace-nowrap bg-white/85 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${dim ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}>{client.name}</span>
            {chip && <span className={`inline-flex items-center border ${chip} rounded-md px-1.5 py-0.5 text-[11px]`}>{chipLabel}</span>}
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-0.5">{client.clientType === "corporate" ? "법인" : "개인"}{client.ceoName ? ` · ${client.ceoName}` : ""}</div>
        </td>

        {showAssignedUser && (
          <td className="px-3 py-3 text-center text-xs text-[#4E5968] whitespace-nowrap">{client.assignedUserName || <span className="text-[#B0B8C1]">-</span>}</td>
        )}

        {/* 진행 단계 + 이동 버튼 */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold w-fit" style={{ background: meta.color, color: "#fff" }}>
              {cur + 1}. {meta.label}
              {keys.length > 0 && <span className="text-white/75 font-medium">{doneN}/{keys.length}</span>}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => moveStage(client.id, -1)} disabled={dim || cur === 0} className="px-2 py-1 rounded-lg text-[11px] font-bold glass-strong text-[#8B95A1] hover:text-[#4E5968] disabled:opacity-30">← 이전</button>
              {cur < STAGES.length - 1 ? (
                <button onClick={() => moveStage(client.id, 1)} disabled={dim} className="px-3 py-1 rounded-lg text-[11px] font-bold text-white disabled:opacity-40" style={{ background: STAGES[cur + 1].color }}>다음 단계 →</button>
              ) : (
                <span className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#15803D] bg-[#E7F7EE]">완료 ✓</span>
              )}
            </div>
          </div>
        </td>

        {/* 체크리스트 (현재 단계) */}
        <td className="px-3 py-3">
          {CHECKLIST[r.stage].length === 0 ? (
            <span className="text-[12px] text-[#B0B8C1]">{r.stage === "confirm" ? "보수 확인 단계 →" : "체크 항목 없음"}</span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {CHECKLIST[r.stage].map((grp, gi) => (
                <div key={gi} className="flex items-center gap-1.5 flex-wrap">
                  {grp.group && <span className="text-[11px] font-bold text-[#6B7684] mr-0.5">{grp.group}</span>}
                  {grp.items.map((it) => {
                    const on = !!r.checklist[it.key];
                    return (
                      <button
                        key={it.key}
                        onClick={() => toggleCheck(client.id, it.key)}
                        disabled={dim}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 ${
                          on ? "border-transparent text-white" : "border-[#E5E8EB] text-[#6B7684] bg-white/60 hover:border-[#B0B8C1]"
                        }`}
                        style={on ? { background: meta.color } : undefined}
                      >
                        {on ? "✓ " : ""}{it.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </td>

        {/* 보수 */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            <input
              value={r.fee == null ? "" : r.fee.toLocaleString("ko-KR")}
              onChange={(e) => changeFee(client.id, e.target.value)}
              onBlur={() => commitFee(client.id)}
              disabled={dim}
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
            disabled={dim}
            placeholder="-"
            className="w-full min-w-[110px] bg-transparent rounded-lg px-2 py-1.5 text-[13px] text-[#191F28] outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-200 disabled:opacity-40"
          />
        </td>

        {/* 제외 */}
        <td className="px-3 py-3 text-center">
          <button onClick={() => toggleExcluded(client.id)} className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-colors ${dim ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]" : "glass-strong text-[#8B95A1] hover:text-[#4E5968]"}`}>
            {dim ? "포함" : "제외"}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 5단계 칸반 카드 */}
      <div className="grid grid-cols-5 gap-2.5">
        {STAGES.map((s) => {
          const activeCard = stageFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStageFilter(activeCard ? null : s.key)}
              className={`glass rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 ${activeCard ? "ring-2" : ""}`}
              style={activeCard ? ({ ["--tw-ring-color" as any]: s.color, borderColor: s.color }) : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-[11px] font-bold uppercase" style={{ color: s.color }}>{s.label}</span>
              </div>
              <div className="text-[24px] font-extrabold text-[#191F28] mt-1">{stageCounts[s.key]}<span className="text-[13px] text-[#B0B8C1] font-bold">곳</span></div>
            </button>
          );
        })}
      </div>

      {/* 통계 + 검색 */}
      <div className="glass rounded-2xl p-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처명 · 대표자 검색" className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]" />
        </div>
        <span className="text-[12px] text-[#6B7684] px-1">대상 <b className="text-[#191F28]">{active.length}곳</b> · 신고완료 <b className="text-[#15803D]">{stageCounts.done}</b> · 보수합계 <b className="text-[#191F28]">{fmtWon(feeSum)}</b></span>
        {stageFilter && <button onClick={() => setStageFilter(null)} className="text-[12px] font-bold text-[#3182F6] hover:underline">필터 해제</button>}
        {activeTab === "bookkeeping" && <span className="text-[11px] text-[#8B95A1]">기장은 보수 기본 0원</span>}
      </div>

      {/* 테이블 */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="overflow-auto max-h-[64vh]">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-white/90 backdrop-blur-md border-b border-white/60">
                <th className="sticky left-0 top-0 z-30 bg-white/90 backdrop-blur-md text-left px-4 py-3 text-[#333D4B] font-medium min-w-[170px]">거래처명</th>
                {showAssignedUser && <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">담당자</th>}
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[150px]">진행 단계</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium min-w-[260px]">체크리스트</th>
                <th className="text-right px-4 py-3 text-[#333D4B] font-medium whitespace-nowrap">보수</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[110px]">메모</th>
                <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">제외</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {shown.length === 0 && excluded.length === 0 && (
                <tr><td colSpan={colCount} className="text-center py-12 text-[#8B95A1]">대상 거래처가 없습니다</td></tr>
              )}
              {shown.map((c) => row(c, false))}
              {!stageFilter && excluded.length > 0 && (
                <tr><td colSpan={colCount} className="px-4 py-2 text-[11px] font-bold text-[#8B95A1] bg-[#F9FAFB]/60">제외됨 ({excluded.length}곳)</td></tr>
              )}
              {!stageFilter && excluded.map((c) => row(c, true))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
