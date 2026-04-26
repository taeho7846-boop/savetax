"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleIncomeTaxCheck, updateIncomeTaxField, setIncomeTaxMemo } from "@/app/actions/income-tax";
import { ComprehensiveTaxCalcModal } from "@/components/ComprehensiveTaxCalcModal";
import { PinIcon } from "@/components/icons";

type ITRecord = {
  bookkeepingDuty: string | null;
  filingType: string | null;
  noticeSent: boolean;
  linkPass: boolean;
  depreciation: boolean;
  interestExpense: boolean;
  insurance: boolean;
  donation: boolean;
  preSettlement: boolean;
  prevSales: string | null;
  prevIncome: string | null;
  prevTax: string | null;
  currSales: string | null;
  currIncome: string | null;
  currTax: string | null;
  bookkeepingCredit: boolean;
  startupReduction: boolean;
  smeReduction: boolean;
  investCredit: boolean;
  employmentCredit: boolean;
  depositReceived: boolean;
  filingDone: boolean;
  paymentSent: boolean;
  adjustmentFee: string | null;
  memo: string | null;
};

type Client = {
  id: number;
  name: string;
  clientType: string;
  ceoName?: string | null;
  residentNumber?: string | null;
  bizCategory?: string | null;
  aiStartupReduction?: string | null;
  aiSmeReduction?: string | null;
  assignedUserName?: string | null;
  incomeTaxRecords: ITRecord[];
};

function getRecord(client: Client): ITRecord {
  return client.incomeTaxRecords[0] ?? {
    bookkeepingDuty: null, filingType: null,
    noticeSent: false, linkPass: false, depreciation: false, interestExpense: false,
    insurance: false, donation: false, preSettlement: false,
    prevSales: null, prevIncome: null, prevTax: null,
    currSales: null, currIncome: null, currTax: null,
    bookkeepingCredit: false, startupReduction: false, smeReduction: false,
    investCredit: false, employmentCredit: false, depositReceived: false, filingDone: false, paymentSent: false,
    adjustmentFee: null, memo: null,
  };
}

function formatNumber(val: string | null): string {
  if (!val) return "";
  const num = parseInt(val);
  if (isNaN(num)) return val;
  return num.toLocaleString("ko-KR");
}

// 헤더 그룹 색상
const GROUP_COLORS: Record<string, string> = {
  기본: "bg-[#F9FAFB]",
  준비: "bg-[#F5F9FF]",
  가결산: "bg-[#FEFCE8]",
  전기: "bg-[#F5F9FF]",
  당기: "bg-emerald-50",
  감면: "bg-[#FFFBEB]",
  완료: "bg-[#F1FBF4]",
};

// 5단계 도출 (기존 boolean 필드로부터)
type Stage = "collect" | "writing" | "approval" | "confirm" | "done";
function getStage(r: ITRecord): Stage {
  if (r.filingDone) return "done";
  if (r.depositReceived) return "confirm";
  if (r.preSettlement) return "approval";
  if (r.currSales) return "writing";
  return "collect";
}
// 단계별로 표시할 컬럼 그룹
const STAGE_GROUPS: Record<Stage | "all", Set<string>> = {
  all:      new Set(["기본", "준비", "가결산", "전기", "당기", "AI판단", "감면", "완료", "조정료"]),
  collect:  new Set(["기본", "준비"]),
  writing:  new Set(["기본", "가결산", "전기", "당기"]),
  approval: new Set(["기본", "전기", "당기", "AI판단", "감면"]),
  confirm:  new Set(["기본", "당기", "완료", "조정료"]),
  done:     new Set(["기본", "당기", "완료", "조정료"]),
};

const STAGE_META: Record<Stage, { label: string; color: string; bgDot: string; activeBg: string; activeRing: string }> = {
  collect:  { label: "① 자료수집",     color: "text-[#92400E]", bgDot: "bg-[#92400E]", activeBg: "bg-[#92400E]/10", activeRing: "ring-[#92400E]/40" },
  writing:  { label: "② 작성중",       color: "text-[#3182F6]", bgDot: "bg-[#3182F6]", activeBg: "bg-[#3182F6]/10", activeRing: "ring-[#3182F6]/40" },
  approval: { label: "③ 결재(세무사)", color: "text-[#F59E0B]", bgDot: "bg-[#F59E0B]", activeBg: "bg-[#F59E0B]/10", activeRing: "ring-[#F59E0B]/40" },
  confirm:  { label: "④ 컨펌+보수",    color: "text-[#A855F7]", bgDot: "bg-[#A855F7]", activeBg: "bg-[#A855F7]/10", activeRing: "ring-[#A855F7]/40" },
  done:     { label: "⑤ 신고완료",     color: "text-[#10B981]", bgDot: "bg-[#10B981]", activeBg: "bg-[#10B981]/10", activeRing: "ring-[#10B981]/40" },
};

export function IncomeTaxTable({ clients, taxYear, showAssignedUser = false, activeTab = "bookkeeping" }: { clients: Client[]; taxYear: string; showAssignedUser?: boolean; activeTab?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [taxCalcModal, setTaxCalcModal] = useState<{
    clientId: number;
    clientName: string;
    currSales: string | null;
    currIncome: string | null;
    aiStartup: string | null;
    aiSme: string | null;
  } | null>(null);
  const [savedCalcIds, setSavedCalcIds] = useState<Set<number>>(new Set());

  // 저장된 세액계산 거래처 목록 조회
  useState(() => {
    fetch(`/api/income-tax/calc-setting?list=1&taxYear=${taxYear}`)
      .then(r => r.json())
      .then(data => {
        if (data.clientIds) setSavedCalcIds(new Set(data.clientIds));
      })
      .catch(() => {});
  });

  function handleYearChange(delta: number) {
    const y = parseInt(taxYear) + delta;
    router.push(`/income-tax?year=${y}&tab=${activeTab}`);
  }

  function handleTabChange(tab: string) {
    router.push(`/income-tax?year=${taxYear}&tab=${tab}`);
  }

  function handleToggle(clientId: number, field: string) {
    startTransition(async () => {
      await toggleIncomeTaxCheck(clientId, taxYear, field);
    });
  }

  function handleFieldBlur(clientId: number, field: string, value: string) {
    startTransition(async () => {
      await updateIncomeTaxField(clientId, taxYear, field, value);
    });
  }

  // 담당자 목록 추출
  const assignedUsers = [...new Set(clients.map(c => c.assignedUserName).filter(Boolean))] as string[];

  // 검색/담당자 필터 적용 (단계 필터 적용 전)
  let preStageClients = clients;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    preStageClients = preStageClients.filter(c => c.name.toLowerCase().includes(q));
  }
  if (userFilter) {
    preStageClients = preStageClients.filter(c => c.assignedUserName === userFilter);
  }

  // 단계별 카운트 (검색/담당자 필터 적용 후)
  const stageCounts: Record<Stage, number> = { collect: 0, writing: 0, approval: 0, confirm: 0, done: 0 };
  for (const c of preStageClients) stageCounts[getStage(getRecord(c))]++;

  // 단계 필터 적용
  const filteredClients = stageFilter
    ? preStageClients.filter(c => getStage(getRecord(c)) === stageFilter)
    : preStageClients;

  // 단계별로 표시할 컬럼 그룹
  const visibleGroups = STAGE_GROUPS[stageFilter ?? "all"];
  const showGroup = (g: string) => visibleGroups.has(g);

  // 전년 대비 변동률 (이상치 ±30% 검출용 - 결재 단계에서 활용)
  function calcDelta(prev: string | null, curr: string | null): { pct: number | null; isAnomaly: boolean } {
    if (!prev || !curr) return { pct: null, isAnomaly: false };
    const p = parseInt(prev), c = parseInt(curr);
    if (isNaN(p) || isNaN(c) || p === 0) return { pct: null, isAnomaly: false };
    const pct = Math.round(((c - p) / Math.abs(p)) * 100);
    return { pct, isAnomaly: Math.abs(pct) >= 30 };
  }

  // 거래처가 이상치인지 (③ 결재 단계용)
  function isAnomalyClient(c: Client): boolean {
    const r = getRecord(c);
    return calcDelta(r.prevSales, r.currSales).isAnomaly || calcDelta(r.prevTax, r.currTax).isAnomaly;
  }

  // 단계별 거래처 (사이드 패널 통계용)
  const stageClients: Record<Stage, Client[]> = { collect: [], writing: [], approval: [], confirm: [], done: [] };
  for (const c of preStageClients) stageClients[getStage(getRecord(c))].push(c);

  // 담당자별 카운트 helper
  function countByAssigned(clients: Client[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const c of clients) {
      const k = c.assignedUserName ?? "-";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return new Map([...m.entries()].sort((a, b) => b[1] - a[1]));
  }
  function sumOf(clients: Client[], field: "currTax" | "adjustmentFee"): number {
    return clients.reduce((s, c) => {
      const v = getRecord(c)[field];
      return s + (v ? parseInt(v) : 0);
    }, 0);
  }

  const doneCount = stageCounts.done;
  const total = preStageClients.length;
  const donePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">종합소득세 신고 시즌</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">종합소득세 · {taxYear}년 귀속</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 glass rounded-2xl px-1 h-10">
            <button
              onClick={() => handleYearChange(-1)}
              className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
            >
              ◀
            </button>
            <span className="text-[13px] font-bold text-[#191F28] min-w-[70px] text-center">
              {taxYear}년
            </span>
            <button
              onClick={() => handleYearChange(1)}
              className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* 시즌 진행 배너 */}
      <div className="glass rounded-2xl p-3 mb-3 bg-gradient-to-br from-[#FBBF24]/10 to-[#F59E0B]/5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[#92400E] font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-full">
              5월 시즌
            </span>
            <span className="text-[14px] font-bold text-[#191F28]">5월 31일 마감</span>
          </div>
          <div className="w-px h-6 bg-[#F59E0B]/30" />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11.5px] text-[#6B7684] font-bold">신고 진행</span>
              <span className="text-[12.5px] font-bold tabular-nums">
                <span className="text-[#10B981]">{doneCount}</span>
                <span className="text-[#6B7684]"> / {total}</span>
                <span className="text-[#10B981] ml-1">({donePct}%)</span>
              </span>
            </div>
            <div className="progress"><div className="progress-fill gradient-emerald" style={{ width: `${donePct}%` }} /></div>
          </div>
        </div>
      </div>

      {/* 5단계 칸반 카드 (클릭 → 해당 단계 거래처만 필터) */}
      <div className="glass rounded-2xl p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="grid grid-cols-[1fr_4fr] gap-3 flex-1">
            <div className="text-center text-[10.5px] font-bold text-[#92400E] uppercase tracking-wider">결산 단계</div>
            <div className="text-center text-[10.5px] font-bold text-[#3182F6] uppercase tracking-wider">신고서 작성 단계</div>
          </div>
          <button
            onClick={() => setStageFilter(null)}
            className={`ml-3 px-3 py-1 text-[11px] font-bold rounded-full transition flex items-center gap-1 ${
              stageFilter === null
                ? "bg-gradient-to-br from-[#191F28] to-[#333] text-white shadow-md"
                : "glass-strong text-[#6B7684] hover:text-[#191F28]"
            }`}
          >
            👁 전체
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {(["collect", "writing", "approval", "confirm", "done"] as Stage[]).map((s) => {
            const meta = STAGE_META[s];
            const count = stageCounts[s];
            const active = stageFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStageFilter(active ? null : s)}
                className={`rounded-xl px-3 py-2 transition flex items-center gap-2.5 text-left ${
                  active
                    ? `${meta.activeBg} ring-2 ${meta.activeRing} -translate-y-0.5 shadow-md`
                    : "bg-white/70 hover:bg-white hover:-translate-y-0.5"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${meta.bgDot} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-[10.5px] font-bold ${meta.color}`}>{meta.label}</div>
                  <div className={`text-[16px] font-bold leading-tight ${active ? meta.color : "text-[#191F28]"}`}>{count}</div>
                </div>
              </button>
            );
          })}
        </div>
        {stageFilter && (
          <div className="mt-2 pt-2 border-t border-white/40 text-[11px] text-[#6B7684] flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${STAGE_META[stageFilter].bgDot}`} />
            <span><strong className={STAGE_META[stageFilter].color}>{STAGE_META[stageFilter].label}</strong> 단계 거래처만 표시 중 — 전체 {total}건 중 {stageCounts[stageFilter]}건</span>
          </div>
        )}
      </div>

      {/* 컨트롤 카드: 기장/단건 탭 + 검색 + 담당자 필터 */}
      <div className="glass rounded-2xl p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex bg-white/60 rounded-xl p-0.5">
          <button
            onClick={() => handleTabChange("bookkeeping")}
            className={`px-4 py-1.5 text-[12.5px] font-bold rounded-lg transition-all ${
              activeTab === "bookkeeping"
                ? "bg-white text-[#3182F6] shadow-sm"
                : "text-[#6B7684] hover:text-[#191F28]"
            }`}
          >
            기장
          </button>
          <button
            onClick={() => handleTabChange("single")}
            className={`px-4 py-1.5 text-[12.5px] font-bold rounded-lg transition-all ${
              activeTab === "single"
                ? "bg-white text-[#3182F6] shadow-sm"
                : "text-[#6B7684] hover:text-[#191F28]"
            }`}
          >
            단건
          </button>
        </div>

        <div className="flex-1 bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9 min-w-[200px]">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24">
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="거래처 검색..."
            className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]"
          />
        </div>

        {showAssignedUser && assignedUsers.length > 1 && (
          <select
            value={userFilter ?? ""}
            onChange={e => setUserFilter(e.target.value || null)}
            className="bg-white/80 border-0 rounded-xl px-3 h-9 text-[12.5px] font-bold outline-none"
          >
            <option value="">전체 담당자</option>
            {assignedUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}
      </div>

      {/* 테이블 + (단계 선택시) 우측 사이드 패널 */}
      <div className={stageFilter ? "grid grid-cols-[minmax(0,1fr)_320px] gap-3 flex-1 min-h-0" : ""}>
      <div className="flex-1 overflow-auto glass rounded-2xl">
        <table className="text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            {/* 그룹 헤더 */}
            <tr>
              {showGroup("기본") && <th className={`px-3 py-1.5 ${GROUP_COLORS["기본"]} border-b border-[#E5E8EB]`} colSpan={showAssignedUser ? 6 : 5}>기본</th>}
              {showGroup("준비") && <th className={`px-3 py-1.5 ${GROUP_COLORS["준비"]} border-b border-[#A3CAFD]`} colSpan={6}>준비</th>}
              {showGroup("가결산") && <th className={`px-3 py-1.5 ${GROUP_COLORS["가결산"]} border-b border-[#FDE68A]`} colSpan={1}>가결산</th>}
              {showGroup("전기") && <th className={`px-3 py-1.5 ${GROUP_COLORS["전기"]} border-b border-[#A3CAFD]`} colSpan={3}>전기</th>}
              {showGroup("당기") && <th className={`px-3 py-1.5 ${GROUP_COLORS["당기"]} border-b border-emerald-200`} colSpan={3}>당기</th>}
              {showGroup("AI판단") && <th className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-200" colSpan={2}>AI판단</th>}
              {showGroup("감면") && <th className={`px-3 py-1.5 ${GROUP_COLORS["감면"]} border-b border-orange-200`} colSpan={5}>감면</th>}
              {showGroup("완료") && <th className={`px-3 py-1.5 ${GROUP_COLORS["완료"]} border-b border-[#BBF7D0]`} colSpan={3}>완료</th>}
              {showGroup("조정료") && <th className={`px-3 py-1.5 bg-rose-50 border-b border-rose-200`} colSpan={1}>조정료</th>}
            </tr>
            {/* 세부 헤더 */}
            <tr className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
              {showGroup("기본") && <>
                <th className="px-3 py-2 text-left text-[#333D4B] font-medium sticky left-0 bg-[#F9FAFB] z-20 min-w-[100px]">고객사명</th>
                <th className="px-2 py-2 text-left text-[#4E5968] font-medium min-w-[60px]">대표자</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium w-10">메모</th>
                {showAssignedUser && (
                  <th className="px-2 py-2 text-center text-[#4E5968] font-medium">담당자</th>
                )}
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기장의무</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">신고유형</th>
              </>}
              {showGroup("준비") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">안내문<br/>발송</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">링크<br/>패스</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">감가<br/>상각</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">이자<br/>비용</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">보험료</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기부금</th>
              </>}
              {showGroup("가결산") && <th className="px-2 py-2 text-center text-[#4E5968] font-medium">가결산</th>}
              {showGroup("전기") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">매출</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">종합<br/>소득</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">결정<br/>세액</th>
              </>}
              {showGroup("당기") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">매출</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">종합<br/>소득</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">결정<br/>세액</th>
              </>}
              {showGroup("AI판단") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium bg-indigo-50/50">창중감</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium bg-indigo-50/50">중특감</th>
              </>}
              {showGroup("감면") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기장<br/>공제</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">창중감</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">중특감</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">통합<br/>투자</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">고용<br/>증대</th>
              </>}
              {showGroup("완료") && <>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">입금</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">신고<br/>완료</th>
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">납부서<br/>발송</th>
              </>}
              {showGroup("조정료") && <th className="px-2 py-2 text-center text-[#4E5968] font-medium">조정료</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F6]">
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={50} className="text-center py-12 text-[#6B7684] text-sm">
                  {clients.length === 0 ? "거래처가 없습니다" : "검색 결과가 없습니다"}
                </td>
              </tr>
            ) : (
              filteredClients.map((client, idx) => {
                const r = getRecord(client);
                // 그룹핑: 같은 대표자(이름+주민번호)인지 확인
                const groupKey = (client.ceoName || "") + (client.residentNumber || "");
                const prevClient = idx > 0 ? filteredClients[idx - 1] : null;
                const prevGroupKey = prevClient ? (prevClient.ceoName || "") + (prevClient.residentNumber || "") : "";
                const isFirstInGroup = !prevClient || groupKey !== prevGroupKey || !groupKey;
                const nextClient = idx < filteredClients.length - 1 ? filteredClients[idx + 1] : null;
                const nextGroupKey = nextClient ? (nextClient.ceoName || "") + (nextClient.residentNumber || "") : "";
                const isLastInGroup = !nextClient || groupKey !== nextGroupKey || !groupKey;
                const hasGroup = groupKey && (
                  (!isFirstInGroup) ||
                  (nextClient && nextGroupKey === groupKey)
                );
                // 그룹 크기 계산 (첫 번째일 때만)
                let groupSize = 1;
                if (isFirstInGroup && groupKey) {
                  for (let gi = idx + 1; gi < filteredClients.length; gi++) {
                    const gk = (filteredClients[gi].ceoName || "") + (filteredClients[gi].residentNumber || "");
                    if (gk === groupKey) groupSize++;
                    else break;
                  }
                }
                const showCompletionCells = !hasGroup || isFirstInGroup;

                return (
                  <tr key={client.id} className={`transition-colors ${r.filingDone ? "bg-[#F1FBF4]/50" : "hover:bg-[#F5F9FF]/30"}`} style={hasGroup && !isLastInGroup ? { borderBottom: "1px dashed #d1d5db" } : { borderBottom: "2.5px solid #9ca3af" }}>
                    {showGroup("기본") && <>
                      {/* 고객사명 */}
                      <td className="px-3 py-2 text-[#191F28] font-medium sticky left-0 bg-white z-10 border-r border-[#F2F4F6]">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditClientId(client.id)} className="hover:underline cursor-pointer text-left">
                            {client.name}
                          </button>
                          {stageFilter === "approval" && isAnomalyClient(client) && (
                            <span title="전년 대비 ±30% 이상 변동" className="text-[10px] bg-[#DC2626]/15 text-[#DC2626] px-1 py-0.5 rounded font-bold">⚠</span>
                          )}
                          <button
                            onClick={() => setTaxCalcModal({
                              clientId: client.id,
                              clientName: client.name,
                              currSales: r.currSales,
                              currIncome: r.currIncome,
                              aiStartup: client.aiStartupReduction ?? null,
                              aiSme: client.aiSmeReduction ?? null,
                            })}
                            className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                              savedCalcIds.has(client.id)
                                ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]"
                                : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                            }`}
                            title="세액계산"
                          >
                            {savedCalcIds.has(client.id) ? "✓계산" : "계산"}
                          </button>
                        </div>
                      </td>
                      {/* 대표자 */}
                      <td className="px-2 py-2 text-left text-xs text-[#4E5968]">
                        {isFirstInGroup ? (client.ceoName ?? <span className="text-[#B0B8C1]">-</span>) : ""}
                      </td>
                      {/* 메모 */}
                      <td className="px-1 py-2 text-center">
                        {r.memo ? (
                          <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: r.memo! })}>
                            <PinIcon width={12} height={12} className="text-[#F59E0B]" />
                            <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#3182F6] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl">{r.memo}</div>
                          </span>
                        ) : (
                          <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-[#D1D6DB] hover:text-[#F59E0B] text-xs">+</button>
                        )}
                      </td>
                      {showAssignedUser && (
                        <td className="px-2 py-2 text-center text-xs text-[#4E5968]">
                          {client.assignedUserName ?? <span className="text-[#B0B8C1]">-</span>}
                        </td>
                      )}
                      {/* 기장의무 */}
                      <td className="px-1 py-1 text-center">
                        <SelectCell
                          value={r.bookkeepingDuty}
                          options={["간편장부", "복식부기", "성실신고"]}
                          onSave={(v) => handleFieldBlur(client.id, "bookkeepingDuty", v)}
                        />
                      </td>
                      {/* 신고유형 */}
                      <td className="px-1 py-1 text-center">
                        <SelectCell
                          value={r.filingType}
                          options={["자기조정", "외부조정", "간편장부", "추계-기준율", "추계-단순율", "성실신고"]}
                          onSave={(v) => handleFieldBlur(client.id, "filingType", v)}
                        />
                      </td>
                    </>}

                    {showGroup("준비") && <>
                      <CheckCell checked={r.noticeSent} onToggle={() => handleToggle(client.id, "noticeSent")} disabled={isPending} />
                      <CheckCell checked={r.linkPass} onToggle={() => handleToggle(client.id, "linkPass")} disabled={isPending} />
                      <CheckCell checked={r.depreciation} onToggle={() => handleToggle(client.id, "depreciation")} disabled={isPending} />
                      <CheckCell checked={r.interestExpense} onToggle={() => handleToggle(client.id, "interestExpense")} disabled={isPending} />
                      <CheckCell checked={r.insurance} onToggle={() => handleToggle(client.id, "insurance")} disabled={isPending} />
                      <CheckCell checked={r.donation} onToggle={() => handleToggle(client.id, "donation")} disabled={isPending} />
                    </>}

                    {showGroup("가결산") && <CheckCell checked={r.preSettlement} onToggle={() => handleToggle(client.id, "preSettlement")} disabled={isPending} />}

                    {showGroup("전기") && <>
                      <NumberCell value={r.prevSales} onSave={(v) => handleFieldBlur(client.id, "prevSales", v)} />
                      <NumberCell value={r.prevIncome} onSave={(v) => handleFieldBlur(client.id, "prevIncome", v)} colorType="income" />
                      <NumberCell value={r.prevTax} onSave={(v) => handleFieldBlur(client.id, "prevTax", v)} colorType="tax" />
                    </>}

                    {showGroup("당기") && <>
                      <NumberCell value={r.currSales} onSave={(v) => handleFieldBlur(client.id, "currSales", v)} />
                      <NumberCell value={r.currIncome} onSave={(v) => handleFieldBlur(client.id, "currIncome", v)} colorType="income" />
                      <NumberCell value={r.currTax} onSave={(v) => handleFieldBlur(client.id, "currTax", v)} colorType="tax" />
                    </>}

                    {showGroup("AI판단") && <>
                      <td className="px-2 py-2 text-center text-xs font-medium bg-indigo-50/30">
                        {client.aiStartupReduction === "O" ? <span className="text-[#16A865]">O</span> : client.aiStartupReduction === "X" ? <span className="text-[#E02E2E]">X</span> : <span className="text-[#B0B8C1]">-</span>}
                      </td>
                      <td className="px-2 py-2 text-center text-xs font-medium bg-indigo-50/30">
                        {client.aiSmeReduction === "O" ? <span className="text-[#16A865]">O</span> : client.aiSmeReduction === "X" ? <span className="text-[#E02E2E]">X</span> : <span className="text-[#B0B8C1]">-</span>}
                      </td>
                    </>}

                    {showGroup("감면") && <>
                      <CheckCell checked={r.bookkeepingCredit} onToggle={() => handleToggle(client.id, "bookkeepingCredit")} disabled={isPending} />
                      <CheckCell checked={r.startupReduction} onToggle={() => handleToggle(client.id, "startupReduction")} disabled={isPending} />
                      <CheckCell checked={r.smeReduction} onToggle={() => handleToggle(client.id, "smeReduction")} disabled={isPending} />
                      <CheckCell checked={r.investCredit} onToggle={() => handleToggle(client.id, "investCredit")} disabled={isPending} />
                      <CheckCell checked={r.employmentCredit} onToggle={() => handleToggle(client.id, "employmentCredit")} disabled={isPending} />
                    </>}

                    {showGroup("완료") && (showCompletionCells ? (
                      <>
                        <CheckCell checked={r.depositReceived} onToggle={() => handleToggle(client.id, "depositReceived")} disabled={isPending} />
                        <CheckCell checked={r.filingDone} onToggle={() => handleToggle(client.id, "filingDone")} disabled={isPending} />
                        <CheckCell checked={r.paymentSent} onToggle={() => handleToggle(client.id, "paymentSent")} disabled={isPending} />
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2" />
                      </>
                    ))}

                    {showGroup("조정료") && <NumberCell value={r.adjustmentFee} onSave={(v) => handleFieldBlur(client.id, "adjustmentFee", v)} />}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 우측 사이드 패널 (단계 선택시) */}
      {stageFilter === "collect" && (
        <aside className="space-y-3 overflow-y-auto">
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold text-[#92400E] mb-3">📋 자료수집 현황</div>
            <div className="text-[24px] font-bold leading-none">{stageClients.collect.length}<span className="text-[12px] text-[#6B7684]">건</span></div>
            <div className="text-[10.5px] text-[#6B7684] mt-1">자료 미수령 또는 수집 중</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">담당자별 미수령</div>
            <div className="space-y-2 text-[12px]">
              {[...countByAssigned(stageClients.collect).entries()].slice(0, 6).map(([name, n]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[#4E5968]">{name}</span>
                  <span className="font-bold tabular-nums">{n}건</span>
                </div>
              ))}
              {countByAssigned(stageClients.collect).size === 0 && <div className="text-[11px] text-[#8B95A1]">데이터 없음</div>}
            </div>
          </div>
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#3182F6]/10 to-transparent">
            <div className="text-[12px] font-bold text-[#3182F6] mb-2">💡 팁</div>
            <ul className="text-[11.5px] text-[#4E5968] space-y-1.5">
              <li>• 안내문/링크패스 체크해 자료 요청 진행</li>
              <li>• 전체 체크리스트 완료 → ② 작성중 단계로 이동</li>
            </ul>
          </div>
        </aside>
      )}

      {stageFilter === "writing" && (
        <aside className="space-y-3 overflow-y-auto">
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#3182F6]/8 to-transparent">
            <div className="text-[12px] font-bold text-[#3182F6] mb-2">✏️ 작성중</div>
            <div className="text-[24px] font-bold leading-none">{stageClients.writing.length}<span className="text-[12px] text-[#6B7684]">건</span></div>
            <div className="text-[10.5px] text-[#6B7684] mt-1">신고서 작성 진행 중</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">예상 세액 합계</div>
            <div className="text-[20px] font-bold tabular-nums leading-none">₩{sumOf(stageClients.writing, "currTax").toLocaleString("ko-KR")}</div>
            <div className="text-[10.5px] text-[#6B7684] mt-1">작성중 단계 거래처 합계</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">담당자별 작성중</div>
            <div className="space-y-2 text-[12px]">
              {[...countByAssigned(stageClients.writing).entries()].slice(0, 6).map(([name, n]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[#4E5968]">{name}</span>
                  <span className="font-bold tabular-nums">{n}건</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {stageFilter === "approval" && (() => {
        const anomalyClients = stageClients.approval.filter(isAnomalyClient);
        return (
          <aside className="space-y-3 overflow-y-auto">
            <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#DC2626]/8 to-transparent">
              <div className="text-[12px] font-bold text-[#DC2626] mb-2">⚠️ AI 검출 이상치</div>
              <div className="text-[11.5px] text-[#4E5968] mb-3">전년 대비 ±30% 이상 변동</div>
              <div className="space-y-1.5">
                {anomalyClients.length === 0 && <div className="text-[11.5px] text-[#8B95A1]">이상치 없음</div>}
                {anomalyClients.slice(0, 5).map(c => {
                  const r = getRecord(c);
                  const dS = calcDelta(r.prevSales, r.currSales);
                  const dT = calcDelta(r.prevTax, r.currTax);
                  return (
                    <div key={c.id} className="bg-white/70 rounded-xl p-2 text-[11.5px]">
                      <div className="font-bold">{c.name}</div>
                      <div className="text-[10.5px] text-[#DC2626]">
                        {dS.pct !== null && `매출 ${dS.pct > 0 ? "+" : ""}${dS.pct}%`}
                        {dS.pct !== null && dT.pct !== null && " · "}
                        {dT.pct !== null && `세액 ${dT.pct > 0 ? "+" : ""}${dT.pct}%`}
                      </div>
                    </div>
                  );
                })}
                {anomalyClients.length > 5 && <div className="text-[11px] text-[#6B7684] text-center pt-1">+ {anomalyClients.length - 5}건 더</div>}
              </div>
            </div>
            <div className="glass rounded-2xl p-4">
              <div className="text-[12px] font-bold mb-3">담당자별 결재 대기</div>
              <div className="space-y-2 text-[12px]">
                {[...countByAssigned(stageClients.approval).entries()].slice(0, 6).map(([name, n]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-[#4E5968]">{name}</span>
                    <span className="font-bold tabular-nums">{n}건</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-4">
              <div className="text-[12px] font-bold mb-2">📈 결재 진척</div>
              <div className="text-[20px] font-bold tabular-nums">{stageCounts.confirm + stageCounts.done}<span className="text-[12px] text-[#6B7684]"> / {stageCounts.approval + stageCounts.confirm + stageCounts.done}</span></div>
            </div>
          </aside>
        );
      })()}

      {stageFilter === "confirm" && (
        <aside className="space-y-3 overflow-y-auto">
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#10B981]/8 to-transparent">
            <div className="text-[12px] font-bold text-[#10B981] mb-2">💰 컨펌+보수 단계</div>
            <div className="text-[24px] font-bold leading-none">{stageClients.confirm.length}<span className="text-[12px] text-[#6B7684]">건</span></div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-2">조정료 합계 (컨펌 단계)</div>
            <div className="text-[18px] font-bold tabular-nums">₩{sumOf(stageClients.confirm, "adjustmentFee").toLocaleString("ko-KR")}</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">담당자별 컨펌 대기</div>
            <div className="space-y-2 text-[12px]">
              {[...countByAssigned(stageClients.confirm).entries()].slice(0, 6).map(([name, n]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[#4E5968]">{name}</span>
                  <span className="font-bold tabular-nums">{n}건</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {stageFilter === "done" && (
        <aside className="space-y-3 overflow-y-auto">
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#10B981]/8 to-transparent">
            <div className="text-[12px] font-bold text-[#10B981] mb-2">🎉 시즌 신고 완료</div>
            <div className="text-[28px] font-bold tabular-nums leading-none">{stageCounts.done}<span className="text-[12px] text-[#6B7684]"> / {total}</span></div>
            <div className="progress mt-2"><div className="progress-fill gradient-emerald" style={{ width: `${donePct}%` }} /></div>
            <div className="text-[10.5px] text-[#6B7684] mt-1">진행률 {donePct}%</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">💵 시즌 정산 합계</div>
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between"><span className="text-[#6B7684]">신고세액</span><span className="font-bold tabular-nums">{sumOf(stageClients.done, "currTax").toLocaleString("ko-KR")}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7684]">조정료</span><span className="font-bold tabular-nums">{sumOf(stageClients.done, "adjustmentFee").toLocaleString("ko-KR")}</span></div>
              <div className="border-t border-white/40 pt-2 flex justify-between">
                <span className="font-bold">정산 총액</span>
                <span className="font-bold text-[#10B981] tabular-nums">{(sumOf(stageClients.done, "currTax") + sumOf(stageClients.done, "adjustmentFee")).toLocaleString("ko-KR")}</span>
              </div>
            </div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">담당자별 완료</div>
            <div className="space-y-2 text-[12px]">
              {[...countByAssigned(stageClients.done).entries()].slice(0, 6).map(([name, n]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[#4E5968]">{name}</span>
                  <span className="font-bold tabular-nums">{n}건</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
      </div>

      {/* 메모 모달 */}
      {memoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMemoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">메모</h3>
                <p className="text-xs text-[#8B95A1] mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="메모를 입력하세요..."
              rows={4}
              className="w-full border border-[#E5E8EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#3182F6] resize-none mb-4"
              id="it-memo-textarea"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {memoModal.value && (
                <button onClick={() => { startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, "")); setMemoModal(null); }} className="text-sm text-[#E02E2E] hover:text-[#B91C1C] px-4 py-2 rounded-lg hover:bg-[#FEF2F2] transition-colors">삭제</button>
              )}
              <button onClick={() => setMemoModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6] transition-colors">취소</button>
              <button
                onClick={() => {
                  const val = (document.getElementById("it-memo-textarea") as HTMLTextAreaElement)?.value ?? "";
                  startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, val));
                  setMemoModal(null);
                }}
                disabled={isPending}
                className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
              >저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 세액계산 모달 */}
      {taxCalcModal && (
        <ComprehensiveTaxCalcModal
          onClose={() => setTaxCalcModal(null)}
          clientName={taxCalcModal.clientName}
          clientId={taxCalcModal.clientId}
          taxYear={taxYear}
          loadData={{
            currSales: taxCalcModal.currSales,
            currIncome: taxCalcModal.currIncome,
            aiStartup: taxCalcModal.aiStartup,
            aiSme: taxCalcModal.aiSme,
          }}
          onApply={(finalTax) => {
            handleFieldBlur(taxCalcModal.clientId, "currTax", String(finalTax));
            setTaxCalcModal(null);
          }}
          onSaved={() => {
            setSavedCalcIds(prev => new Set(prev).add(taxCalcModal.clientId));
          }}
        />
      )}

      {/* 고객사 수정 모달 */}
      {editClientId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditClientId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F2F4F6] shrink-0">
              <h3 className="text-sm font-bold text-[#191F28]">고객사 수정</h3>
              <button onClick={() => setEditClientId(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <iframe
              src={`/clients/${editClientId}/edit?modal=1`}
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </>
  );
}

function CheckCell({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <td className="px-2 py-2 text-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer"
      />
    </td>
  );
}

function NumberCell({ value, onSave, colorType }: { value: string | null; onSave: (v: string) => void; colorType?: "income" | "tax" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  const num = value ? parseInt(value) : null;
  const isNegative = num !== null && !isNaN(num) && num < 0;
  let textColor = "text-[#333D4B]";
  if (isNegative && colorType === "income") textColor = "text-[#E02E2E] font-medium";
  if (isNegative && colorType === "tax") textColor = "text-[#3182F6] font-medium";

  if (editing) {
    return (
      <td className="px-1 py-1 text-center">
        <input
          autoFocus
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } }}
          className="w-20 border border-blue-300 rounded px-1 py-0.5 text-xs text-right focus:outline-none"
        />
      </td>
    );
  }
  return (
    <td
      className={`px-2 py-2 text-right cursor-pointer hover:bg-[#F5F9FF] min-w-[70px] ${textColor}`}
      onClick={() => { setVal(value ?? ""); setEditing(true); }}
    >
      {formatNumber(value) || <span className="text-[#B0B8C1]">-</span>}
    </td>
  );
}

function SelectCell({ value, options, onSave }: { value: string | null; options: string[]; onSave: (v: string) => void }) {
  return (
    <td className="px-1 py-1 text-center">
      <select
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value)}
        className="border border-[#E5E8EB] rounded px-1 py-0.5 text-xs bg-white focus:outline-none w-20"
      >
        <option value="">-</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  );
}
