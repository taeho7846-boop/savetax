"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { setVatStage, toggleVatCheck, setVatCheckValue, setVatNoticeTax, setVatFee, toggleVatExcluded, setVatMemo, type VatStage } from "@/app/actions/vat";

type Rec = {
  stage: VatStage;
  checklist: Record<string, boolean>;
  fee: number | null;
  noticeTax: number | null;
  excluded: boolean;
  memo: string | null;
};

type ClientRow = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  clientType: string;
  taxationType: string | null;
  assignedUserName: string | null;
  record: { stage: string; checklist: string | null; fee: number | null; noticeTax: number | null; excluded: boolean; memo: string | null } | null;
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

// 단계별 체크리스트 (그룹 + 항목). 보수는 confirm 단계에서 별도 입력.
const CHECKLIST: Record<VatStage, { group?: string; items: { key: string; label: string }[] }[]> = {
  collect: [
    { group: "1단계", items: [
      { key: "card_request", label: "카드수집요청" },
    ] },
    { group: "2단계", items: [
      { key: "card_register", label: "카드등록" },
      { key: "card_excel", label: "카드엑셀자료 수취" },
      { key: "no_response", label: "무응답" },
    ] },
  ],
  writing: [
    { group: "매출", items: [
      { key: "sales_tax_invoice", label: "세금계산서" },
      { key: "sales_invoice", label: "계산서" },
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
      noticeTax: c.record?.noticeTax ?? null,
      excluded: c.record?.excluded ?? false,
      memo: c.record?.memo ?? null,
    });
  }
  return m;
}

/** 사업자등록번호 복사 버튼 (HTTPS 아닌 환경 fallback 포함) */
function CopyBizBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* 무시 */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(fallback);
    else fallback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="사업자등록번호 복사"
      className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors ${
        copied ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E8F3FF] hover:text-[#3182F6]"
      }`}
    >
      {copied ? "✓ 복사됨" : value}
      {!copied && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

export function VatTable({ clients, period, activeTab, showAssignedUser }: Props) {
  const [recMap, setRecMap] = useState<Map<number, Rec>>(() => buildMap(clients, activeTab));
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<VatStage | null>(null);

  // 담당자 필터 (관리자 화면에서만 노출)
  const [assignFilter, setAssignFilter] = useState<string[]>([]);
  const [assignFilterOpen, setAssignFilterOpen] = useState(false);
  const assignFilterRef = useRef<HTMLDivElement>(null);
  const assignOptions = [...new Set(clients.map(c => c.assignedUserName).filter(Boolean))] as string[];

  useEffect(() => { setRecMap(buildMap(clients, activeTab)); }, [clients, activeTab]);

  // 담당자 필터 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (assignFilterRef.current && !assignFilterRef.current.contains(e.target as Node)) setAssignFilterOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function getRec(id: number): Rec {
    return recMap.get(id) ?? { stage: "collect", checklist: {}, fee: activeTab === "bookkeeping" ? 0 : null, noticeTax: null, excluded: false, memo: null };
  }
  function update(id: number, patch: Partial<Rec>) {
    setRecMap(prev => { const n = new Map(prev); n.set(id, { ...getRec(id), ...patch }); return n; });
  }
  // 서버 저장을 확실히 await + 실패 시 알림 (fire-and-forget 으로 조용히 누락되는 것 방지)
  function save(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        console.error("[VAT 저장 실패]", e);
        alert("저장에 실패했습니다. 새로고침 후 다시 시도해주세요.\n\n" + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  function moveStage(clientId: number, dir: 1 | -1) {
    const cur = STAGE_INDEX[getRec(clientId).stage];
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, cur + dir))].key;
    update(clientId, { stage: next });
    save(() => setVatStage(clientId, period, next));
  }
  function toggleCheck(clientId: number, key: string) {
    const r = getRec(clientId);
    update(clientId, { checklist: { ...r.checklist, [key]: !r.checklist[key] } });
    save(() => toggleVatCheck(clientId, period, key));
  }
  function setCheckVal(clientId: number, key: string, value: boolean) {
    const r = getRec(clientId);
    update(clientId, { checklist: { ...r.checklist, [key]: value } });
    save(() => setVatCheckValue(clientId, period, key, value));
  }
  function changeNoticeTax(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    update(clientId, { noticeTax: Number.isNaN(num as number) ? null : num });
  }
  function commitNoticeTax(clientId: number) { save(() => setVatNoticeTax(clientId, period, getRec(clientId).noticeTax)); }
  function toggleExcluded(clientId: number) {
    update(clientId, { excluded: !getRec(clientId).excluded });
    save(() => toggleVatExcluded(clientId, period));
  }
  function changeFee(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    update(clientId, { fee: Number.isNaN(num as number) ? null : num });
  }
  function commitFee(clientId: number) { save(() => setVatFee(clientId, period, getRec(clientId).fee)); }
  function changeMemo(clientId: number, value: string) { update(clientId, { memo: value }); }
  function commitMemo(clientId: number) { save(() => setVatMemo(clientId, period, getRec(clientId).memo ?? "")); }

  const qt = q.trim();
  const searched = clients.filter(c => {
    if (qt && !(c.name.includes(qt) || (c.ceoName ?? "").includes(qt))) return false;
    if (assignFilter.length > 0 && !assignFilter.includes(c.assignedUserName || "")) return false;
    return true;
  });
  const active = searched.filter(c => !getRec(c.id).excluded);
  const excluded = searched.filter(c => getRec(c.id).excluded);

  const stageCounts: Record<VatStage, number> = { collect: 0, writing: 0, approval: 0, confirm: 0, done: 0 };
  for (const c of active) stageCounts[getRec(c.id).stage]++;

  const shown = stageFilter ? active.filter(c => getRec(c.id).stage === stageFilter) : active;
  const feeSum = active.reduce((s, c) => s + (getRec(c.id).fee ?? 0), 0);

  const isPrelim = period.endsWith("예정"); // 1·2기 예정 기간
  const colCount = 1 + (showAssignedUser ? 1 : 0) + 4; // 거래처+[담당자]+체크리스트+메모+제외+진행

  function row(client: ClientRow, dim: boolean) {
    const r = getRec(client.id);
    const cur = STAGE_INDEX[r.stage];
    const meta = STAGES[cur];
    const isCorp = client.clientType === "corporate";
    // 예정 처리: report_notice 토글값 우선, 미설정 시에만 추정(개인=예정고지, 법인=예정신고)
    const rn = r.checklist["report_notice"];
    const isNotice = rn === undefined ? !isCorp : rn; // true=예정고지(확정 6개월) / false=예정신고(확정 3개월)
    const isPrelimNotice = isPrelim && isNotice; // 예정 기간 + 예정고지형 = 신고 불필요
    const isCorpCollect = r.stage === "collect" && isCorp;
    const keys = isCorpCollect ? [] : stageItemKeys(r.stage);
    const doneN = keys.filter(k => r.checklist[k]).length;
    const chip = client.taxationType ? (TAXATION_CHIP[client.taxationType] ?? "border-[#D1D6DB] text-[#6B7684] bg-[#F9FAFB]") : null;
    const chipLabel = client.taxationType === "간이(세금계산서발행)" ? "간이(세계발행)" : client.taxationType;
    // 작성중 체크 칩 (checklist 토글)
    const checkChip = (key: string, label: string, color: string, title?: string) => {
      const on = !!r.checklist[key];
      return (
        <button
          key={key}
          type="button"
          onClick={() => toggleCheck(client.id, key)}
          disabled={dim}
          title={title}
          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 whitespace-nowrap ${
            on ? "border-transparent text-white" : "border-[#E5E8EB] text-[#6B7684] bg-white/60 hover:border-[#B0B8C1]"
          }`}
          style={on ? { background: color } : undefined}
        >
          {on ? "✓ " : ""}{label}
        </button>
      );
    };
    return (
      <tr key={client.id} className={`align-top transition-colors ${dim ? "opacity-40" : "hover:bg-white/60"}`} style={dim ? undefined : { background: `${meta.tint}44` }}>
        {/* 거래처 */}
        <td className="sticky left-0 z-10 px-4 py-3 whitespace-nowrap bg-white/85 backdrop-blur-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${dim ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}>{client.name}</span>
            {chip && <span className={`inline-flex items-center border ${chip} rounded-md px-1.5 py-0.5 text-[11px]`}>{chipLabel}</span>}
            {client.bizNumber && <CopyBizBtn value={client.bizNumber} />}
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-0.5">{client.clientType === "corporate" ? "법인" : "개인"}{client.ceoName ? ` · ${client.ceoName}` : ""}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* 예정고지(6개월) / 예정신고(3개월) */}
            <div className="inline-flex rounded-md overflow-hidden border border-[#E5E8EB]">
              <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "report_notice", true)}
                title="예정고지 · 확정 6개월"
                className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${isNotice ? "bg-[#6D28D9] text-white" : "bg-white text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>6개월</button>
              <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "report_notice", false)}
                title="예정신고 · 확정 3개월"
                className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 border-l border-[#E5E8EB] ${!isNotice ? "bg-[#1B64DA] text-white" : "bg-white text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>3개월</button>
            </div>
            <button
              type="button"
              onClick={() => toggleCheck(client.id, "early_refund")}
              disabled={dim}
              title="조기환급 대상 (영세율·시설투자 등)"
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${
                r.checklist["early_refund"]
                  ? "bg-[#0EA5E9] text-white"
                  : "bg-[#F2F4F6] text-[#B0B8C1] hover:text-[#6B7684]"
              }`}
            >
              💧 조기환급{r.checklist["early_refund"] ? "" : "?"}
            </button>
          </div>
        </td>

        {/* 담당자 */}
        {showAssignedUser && (
          <td className="px-3 py-3 text-center text-xs text-[#4E5968] whitespace-nowrap">{client.assignedUserName || <span className="text-[#B0B8C1]">-</span>}</td>
        )}

        {/* 체크리스트 — 예정고지(개인 예정) / 신고 체크리스트 */}
        <td className="px-3 py-3">
          {isPrelimNotice ? (
            <div className="flex items-center gap-2 flex-wrap py-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D28D9] bg-[#F5E8FF] rounded-md px-2 py-1">📋 예정고지 · 신고 불필요</span>
              <span className="text-[11px] text-[#6B7684]">고지세액</span>
              <div className="flex items-center bg-white/80 rounded-lg border border-[#E5E8EB] px-2 h-7">
                <input
                  value={r.noticeTax == null ? "" : r.noticeTax.toLocaleString("ko-KR")}
                  onChange={(e) => changeNoticeTax(client.id, e.target.value)}
                  onBlur={() => commitNoticeTax(client.id)}
                  disabled={dim}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-[100px] bg-transparent text-[12px] text-right text-[#191F28] outline-none disabled:opacity-40"
                />
                <span className="text-[11px] text-[#8B95A1] ml-1">원</span>
              </div>
            </div>
          ) : (
          <>
          <div className="flex flex-row items-start gap-2">
            {/* 자료수집 열 */}
            <div className={`rounded-lg transition-colors shrink-0 p-1.5 ${r.stage === "collect" ? "ring-1 ring-[#FDE68A] bg-white/40" : ""}`}>
              <div className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: STAGES[0].color }}>
                자료수집{r.stage === "collect" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGES[0].color }} />}
              </div>
              {isCorp ? (
                <div className="flex flex-col items-start gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#6D28D9] bg-[#F5E8FF] rounded-md px-1.5 py-0.5">🏢 법인 · 자료수집 불필요</span>
                  {r.stage === "collect" ? (
                    <button
                      onClick={() => moveStage(client.id, 1)}
                      disabled={dim}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 shadow-sm whitespace-nowrap"
                      style={{ background: STAGES[1].color }}
                    >
                      작성중으로 →
                    </button>
                  ) : (
                    <span className="text-[10px] text-[#B0B8C1]">해당없음</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-row items-start gap-3">
                  {CHECKLIST.collect.map((grp, gi) => (
                    <div key={gi} className="flex flex-col items-start gap-1">
                      {grp.group && <span className="text-[9px] font-bold text-[#B45309] tracking-wide">{grp.group}</span>}
                      {grp.items.map((it) => checkChip(it.key, it.label, STAGES[0].color))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 구분선 */}
            <div className="w-px bg-[#E5E8EB] self-stretch shrink-0" />

            {/* 작성중 열 (매출·매입·세액공제·고정자산·예정고지) */}
            <div className={`rounded-lg transition-colors flex-1 min-w-0 p-1.5 ${r.stage === "writing" ? "ring-1 ring-[#BFDBFE] bg-white/40" : ""}`}>
              <div className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: STAGES[1].color }}>
                작성중{r.stage === "writing" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGES[1].color }} />}
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 items-start">
                {/* 매출 + 겸영·영세 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#6B7684] w-7 shrink-0">매출</span>
                  {CHECKLIST.writing[0].items.map((it) => checkChip(it.key, it.label, STAGES[1].color))}
                  <span className="text-[#D1D6DB] px-0.5 select-none">|</span>
                  {checkChip("sales_dual", "겸영", "#475569")}
                  {checkChip("sales_zero", "영세", "#475569")}
                </div>
                {/* 세액공제 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#0F766E] w-7 shrink-0">공제</span>
                  {checkChip("credit_etax", "전자(세)발행", "#0F766E", "전자세금계산서발행세액공제")}
                  {checkChip("credit_card", "신용카드발행", "#0F766E", "신용카드매출전표등발행세액공제")}
                  {checkChip("credit_deemed", "의제매입", "#0F766E", "의제매입세액공제")}
                </div>
                {/* 매입 + 고정자산매입 O/X */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#6B7684] w-7 shrink-0">매입</span>
                  {CHECKLIST.writing[1].items.map((it) => checkChip(it.key, it.label, STAGES[1].color))}
                  <span className="text-[#D1D6DB] px-0.5 select-none">|</span>
                  <span className="text-[11px] text-[#6B7684]">고정자산매입</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-[#E5E8EB]">
                    <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "fixed_asset", true)}
                      className={`px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${r.checklist["fixed_asset"] === true ? "bg-[#15803D] text-white" : "bg-white/60 text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>O</button>
                    <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "fixed_asset", false)}
                      className={`px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 border-l border-[#E5E8EB] ${r.checklist["fixed_asset"] === false ? "bg-[#94A3B8] text-white" : "bg-white/60 text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>X</button>
                  </div>
                </div>
                {/* 예정고지세액 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#6B7684] shrink-0">예정고지</span>
                  <div className="flex items-center bg-white/80 rounded-lg border border-[#E5E8EB] px-2 h-7">
                    <input
                      value={r.noticeTax == null ? "" : r.noticeTax.toLocaleString("ko-KR")}
                      onChange={(e) => changeNoticeTax(client.id, e.target.value)}
                      onBlur={() => commitNoticeTax(client.id)}
                      disabled={dim}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-[90px] bg-transparent text-[12px] text-right text-[#191F28] outline-none disabled:opacity-40"
                    />
                    <span className="text-[11px] text-[#8B95A1] ml-1">원</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 컨펌+보수 단계: 보수료 입력 */}
          {r.stage === "confirm" && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[12px] font-bold text-[#7C3AED]">보수료</span>
              <input
                value={r.fee == null ? "" : r.fee.toLocaleString("ko-KR")}
                onChange={(e) => changeFee(client.id, e.target.value)}
                onBlur={() => commitFee(client.id)}
                disabled={dim}
                inputMode="numeric"
                placeholder={activeTab === "bookkeeping" ? "0" : "입력"}
                className="w-[110px] bg-white/80 rounded-lg px-2 py-1.5 text-[13px] text-right text-[#191F28] outline-none focus:ring-2 focus:ring-purple-200 disabled:opacity-40"
              />
              <span className="text-[12px] text-[#8B95A1]">원</span>
            </div>
          )}
          </>
          )}
        </td>

        {/* 메모 */}
        <td className="px-3 py-3">
          <input
            value={r.memo ?? ""}
            onChange={(e) => changeMemo(client.id, e.target.value)}
            onBlur={() => commitMemo(client.id)}
            disabled={dim}
            placeholder="-"
            className="w-full min-w-[100px] bg-transparent rounded-lg px-2 py-1.5 text-[13px] text-[#191F28] outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-200 disabled:opacity-40"
          />
        </td>

        {/* 제외 */}
        <td className="px-3 py-3 text-center">
          <button onClick={() => toggleExcluded(client.id)} className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-colors ${dim ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]" : "glass-strong text-[#8B95A1] hover:text-[#4E5968]"}`}>
            {dim ? "포함" : "제외"}
          </button>
        </td>

        {/* 진행 단계 — 예정고지(개인 예정)는 단계 없음 / 그 외 스텝퍼 */}
        <td className="px-3 py-3 whitespace-nowrap">
          {isPrelimNotice ? (
            <div className="flex flex-col gap-1 items-end">
              <span className="text-[12px] font-bold text-[#6D28D9]">📋 예정고지</span>
              <span className="text-[10px] text-[#8B95A1]">신고 불필요 · 고지서 확인</span>
            </div>
          ) : (
          <div className="flex flex-col gap-2 items-end">
            {/* 가로 스텝퍼 (왼쪽 자료수집 → 오른쪽 신고완료) */}
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <span key={s.key} className="flex items-center">
                  {i > 0 && <span className="w-4 h-[2px]" style={{ background: i <= cur ? s.color : "#E5E8EB" }} />}
                  <span
                    className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${i === cur ? "ring-2 ring-offset-1" : ""}`}
                    title={s.label}
                    style={{ background: i <= cur ? s.color : "#E5E8EB", color: i <= cur ? "#fff" : "#B0B8C1", ...(i === cur ? ({ ["--tw-ring-color" as any]: `${s.color}66` }) : {}) }}
                  >
                    {i < cur ? "✓" : i + 1}
                  </span>
                </span>
              ))}
            </div>
            <span className="text-[12px] font-bold" style={{ color: meta.color }}>
              {cur + 1}. {meta.label}{keys.length > 0 ? <span className="text-[#8B95A1] font-medium"> {doneN}/{keys.length}</span> : null}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => moveStage(client.id, -1)} disabled={dim || cur === 0} className="px-2 py-1 rounded-lg text-[11px] font-bold glass-strong text-[#8B95A1] hover:text-[#4E5968] disabled:opacity-30">← 이전</button>
              {cur < STAGES.length - 1 ? (
                <button onClick={() => moveStage(client.id, 1)} disabled={dim} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 shadow-sm" style={{ background: STAGES[cur + 1].color }}>{STAGES[cur + 1].label} →</button>
              ) : (
                <span className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#15803D] bg-[#E7F7EE]">완료 ✓</span>
              )}
            </div>
          </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 5단계 칸반 카드 (왼→오) */}
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
                {showAssignedUser && (
                  <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">
                    <div className="relative inline-block" ref={assignFilterRef}>
                      <button
                        onClick={() => setAssignFilterOpen(o => !o)}
                        className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${assignFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                      >
                        담당자
                        {assignFilter.length > 0 && (
                          <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{assignFilter.length}</span>
                        )}
                        <span className="text-[#8B95A1] text-[10px]">▼</span>
                      </button>
                      {assignFilterOpen && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] rounded-[10px] shadow-lg z-30 p-2 min-w-[120px]">
                          {assignOptions.length === 0 ? (
                            <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                          ) : (
                            assignOptions.map(name => (
                              <label key={name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap font-normal">
                                <input
                                  type="checkbox"
                                  checked={assignFilter.includes(name)}
                                  onChange={() => setAssignFilter(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name])}
                                  className="accent-[#3182F6]"
                                />
                                {name}
                              </label>
                            ))
                          )}
                          {assignFilter.length > 0 && (
                            <button onClick={() => setAssignFilter([])} className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]">초기화</button>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                )}
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium min-w-[280px]">체크리스트</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[100px]">메모</th>
                <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">제외</th>
                <th className="text-right px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[180px]">진행 단계 →</th>
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
