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
  driveFolderId?: string | null;
  hometaxId?: string | null;
  hometaxPw?: string | null;
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

export function IncomeTaxTable({
  clients, taxYear, showAssignedUser = false, activeTab = "bookkeeping",
  agentHometaxId = null, agentHometaxPw = null, certName = null, certPassword = null,
}: {
  clients: Client[]; taxYear: string; showAssignedUser?: boolean; activeTab?: string;
  agentHometaxId?: string | null; agentHometaxPw?: string | null;
  certName?: string | null; certPassword?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
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

  // ② 작성중 단계 진행률 도출 (4단계)
  function getWritingProgress(r: ITRecord): { step: number; nextLabel: string; statusLabel: string } {
    if (r.preSettlement) return { step: 4, nextLabel: "—", statusLabel: "최종 검산 완료" };
    if (r.currTax)       return { step: 3, nextLabel: "최종 검산", statusLabel: "최종 검산 대기" };
    if (r.currIncome)    return { step: 2, nextLabel: "공제 적용",  statusLabel: "공제 적용 중" };
    if (r.currSales)     return { step: 1, nextLabel: "소득금액 계산", statusLabel: "소득금액 계산 중" };
    return { step: 0, nextLabel: "기본정보 입력", statusLabel: "기본정보 입력 대기" };
  }

  // 신고유형/기장의무로 단순/기준/복식 도출
  function getFilingTypeBadge(r: ITRecord): { label: string; color: string } {
    const ft = r.filingType ?? "";
    const bd = r.bookkeepingDuty ?? "";
    if (ft.includes("단순") || bd === "간편장부") return { label: "단순", color: "bg-[#10B981]/15 text-[#10B981]" };
    if (ft.includes("기준")) return { label: "기준", color: "bg-[#3182F6]/15 text-[#3182F6]" };
    if (ft.includes("외부조정") || ft.includes("자기조정") || bd === "복식부기" || bd === "성실신고") return { label: "복식", color: "bg-[#A855F7]/15 text-[#A855F7]" };
    return { label: "-", color: "bg-[#F2F4F6] text-[#6B7684]" };
  }

  // 감면 뱃지 도출
  function getReductionBadges(r: ITRecord): { label: string; color: string }[] {
    const out: { label: string; color: string }[] = [];
    if (r.bookkeepingCredit) out.push({ label: "기장", color: "text-[#10B981]" });
    if (r.investCredit)      out.push({ label: "통합", color: "text-[#A855F7]" });
    if (r.employmentCredit)  out.push({ label: "고용", color: "text-[#F59E0B]" });
    if (r.startupReduction)  out.push({ label: "창중", color: "text-[#3182F6]" });
    if (r.smeReduction)      out.push({ label: "중특", color: "text-[#3182F6]" });
    return out;
  }

  // 작성중 거래처 유형별 카운트
  const writingClients = stageClients.writing;
  const writingByType = {
    total: writingClients.length,
    단순: writingClients.filter(c => getFilingTypeBadge(getRecord(c)).label === "단순").length,
    기준: writingClients.filter(c => getFilingTypeBadge(getRecord(c)).label === "기준").length,
    복식: writingClients.filter(c => getFilingTypeBadge(getRecord(c)).label === "복식").length,
  };

  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  function openClientDrive(client: Client) {
    // 로컬 PC에 "드라이브 기본 경로" 설정되어 있으면 파일탐색기, 아니면 웹 구글드라이브
    const basePath = typeof window !== "undefined" ? localStorage.getItem("savetax-drive-base-path") : null;
    if (basePath) {
      const sep = basePath.endsWith("\\") ? "" : "\\";
      const fullPath = `${basePath}${sep}${client.name}`;
      window.location.href = `savetax-app://folder?path=${encodeURIComponent(fullPath)}`;
      return;
    }
    if (client.driveFolderId) {
      window.open(`https://drive.google.com/drive/folders/${client.driveFolderId}`, "_blank");
    } else {
      alert("이 거래처에 드라이브 폴더가 연결되어 있지 않습니다. 거래처 수정에서 폴더를 연결하거나, 설정 → 로컬 PC에서 드라이브 기본 경로를 등록하세요.");
    }
  }

  function openClientHometax(client: Client) {
    // 거래처에 hometaxId/Pw 있으면 그걸로, 없으면 세무대리인 계정으로
    const id = client.hometaxId || agentHometaxId;
    const pw = client.hometaxPw || agentHometaxPw;
    if (!id || !pw) {
      alert("홈택스 계정이 등록되어 있지 않습니다. 설정에서 등록하세요.");
      return;
    }
    try {
      const json = JSON.stringify({ id, pw, certName: certName || "", certPw: certPassword || "" });
      const creds = btoa(unescape(encodeURIComponent(json)));
      window.open(
        `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
        "_blank"
      );
    } catch {
      alert("홈택스 로그인 실행 실패");
    }
  }

  function renderDeepView(client: Client, currentStep: number, stageBadgeLabel: string, stageBadgeColor: string) {
    const r = getRecord(client);
    const wp = getWritingProgress(r);
    const ft = getFilingTypeBadge(r);
    const dataCollect = [r.noticeSent, r.linkPass, r.depreciation, r.interestExpense, r.insurance, r.donation].filter(Boolean).length;
    const reduce = [r.bookkeepingCredit, r.startupReduction, r.smeReduction, r.investCredit, r.employmentCredit].filter(Boolean).length;
    return (
      <aside className="glass rounded-2xl p-4 flex flex-col overflow-y-auto">
        <div className="flex items-start justify-between mb-3 pb-3 border-b border-white/40">
          <div>
            <div className="text-[10px] text-[#3182F6] font-bold uppercase tracking-wider">선택됨</div>
            <div className="text-[18px] font-bold tracking-tight mt-0.5">{client.name}</div>
            {client.ceoName && <div className="text-[11px] text-[#6B7684]">{client.ceoName}{client.assignedUserName ? ` · ${client.assignedUserName} 담당` : ""}</div>}
            <div className="flex gap-1.5 mt-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ft.color}`}>{ft.label}경비율</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${stageBadgeColor}`}>{stageBadgeLabel}</span>
            </div>
          </div>
          <button onClick={() => setSelectedClientId(null)} className="w-7 h-7 rounded-lg hover:bg-white/60 flex items-center justify-center text-[#6B7684] text-[16px]">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white/70 rounded-xl p-2.5">
            <div className="text-[10px] text-[#6B7684] font-bold">매출 (당기)</div>
            <div className="text-[14px] font-bold tabular-nums">{formatNumber(r.currSales) || "-"}</div>
          </div>
          <div className="bg-white/70 rounded-xl p-2.5">
            <div className="text-[10px] text-[#6B7684] font-bold">예상 세액</div>
            <div className="text-[14px] font-bold tabular-nums text-[#3182F6]">{formatNumber(r.currTax) || "-"}</div>
          </div>
        </div>
        {currentStep === 4 && (() => {
          const dS = calcDelta(r.prevSales, r.currSales);
          const dT = calcDelta(r.prevTax, r.currTax);
          if (!dS.isAnomaly && !dT.isAnomaly) return null;
          return (
            <div className="rounded-xl p-2.5 mb-3 bg-[#DC2626]/8 border-l-2 border-[#DC2626]">
              <div className="text-[11px] font-bold text-[#DC2626] mb-1">⚠️ 이상치 검출</div>
              <div className="text-[10.5px] text-[#4E5968] space-y-0.5">
                {dS.pct !== null && dS.isAnomaly && <div>매출 전년대비 <strong className="text-[#DC2626]">{dS.pct > 0 ? "+" : ""}{dS.pct}%</strong></div>}
                {dT.pct !== null && dT.isAnomaly && <div>세액 전년대비 <strong className="text-[#DC2626]">{dT.pct > 0 ? "+" : ""}{dT.pct}%</strong></div>}
              </div>
            </div>
          );
        })()}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          <button onClick={() => openClientDrive(client)} className="bg-white hover:bg-[#3182F6] hover:text-white text-[#3182F6] border border-[#3182F6]/30 py-1.5 rounded-xl text-[11px] font-bold transition">📁 드라이브</button>
          <button onClick={() => openClientHometax(client)} className="bg-white hover:bg-[#3182F6] hover:text-white text-[#3182F6] border border-[#3182F6]/30 py-1.5 rounded-xl text-[11px] font-bold transition">🔐 홈택스</button>
          <button onClick={() => setEditClientId(client.id)} className="bg-[#3182F6] text-white py-1.5 rounded-xl text-[11px] font-bold shadow-md shadow-[#3182F6]/20">{currentStep === 4 ? "결재" : "신고서 작성"}</button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          <CheckGroup title="1. 자료 수집" done={dataCollect} total={6} highlight={currentStep === 1}
            items={[
              { label: "안내문",   checked: r.noticeSent,      onToggle: () => handleToggle(client.id, "noticeSent") },
              { label: "링크패스", checked: r.linkPass,        onToggle: () => handleToggle(client.id, "linkPass") },
              { label: "감가상각", checked: r.depreciation,    onToggle: () => handleToggle(client.id, "depreciation") },
              { label: "이자비용", checked: r.interestExpense, onToggle: () => handleToggle(client.id, "interestExpense") },
              { label: "보험료",   checked: r.insurance,       onToggle: () => handleToggle(client.id, "insurance") },
              { label: "기부금",   checked: r.donation,        onToggle: () => handleToggle(client.id, "donation") },
            ]} />
          <CheckGroup title="2. 공제/감면" done={reduce} total={5}
            items={[
              { label: "기장공제", checked: r.bookkeepingCredit, onToggle: () => handleToggle(client.id, "bookkeepingCredit") },
              { label: "창업감면", checked: r.startupReduction,  onToggle: () => handleToggle(client.id, "startupReduction") },
              { label: "중기감면", checked: r.smeReduction,      onToggle: () => handleToggle(client.id, "smeReduction") },
              { label: "통합투자", checked: r.investCredit,      onToggle: () => handleToggle(client.id, "investCredit") },
              { label: "고용증대", checked: r.employmentCredit,  onToggle: () => handleToggle(client.id, "employmentCredit") },
            ]} />
          <CheckGroup title="3. 신고서 작성" done={wp.step} total={4} highlight={currentStep === 2}
            items={[
              { label: "기본정보",   checked: !!r.currSales },
              { label: "소득금액",   checked: !!r.currIncome },
              { label: "공제 적용",  checked: !!r.currTax },
              { label: "최종 검산",  checked: r.preSettlement, onToggle: () => handleToggle(client.id, "preSettlement") },
            ]} />
          <StageRow num={4} title="결재 (세무사)" done={r.depositReceived} highlight={currentStep === 4} />
          <StageRow num={5} title="컨펌 + 보수수취" done={r.depositReceived} />
          <StageRow num={6} title="신고 완료" done={r.filingDone} />
        </div>
      </aside>
    );
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
      <div className={stageFilter ? "grid grid-cols-[minmax(0,1fr)_360px] gap-3 flex-1 min-h-0" : ""}>
      {stageFilter === "writing" ? (
        // ② 작성중 전용 레이아웃
        <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-2.5 bg-[#3182F6]/8 border-b border-white/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3182F6] animate-pulse" />
              <span className="text-[13px] font-bold text-[#3182F6]">② 작성중 — {writingByType.total}건</span>
              <span className="text-[11px] text-[#6B7684]">신고서 작성에 필요한 컬럼만 표시</span>
            </div>
            <div className="flex gap-1.5 text-[11px]">
              <span className="px-2.5 py-1 bg-[#3182F6] text-white rounded-full font-bold">전체 {writingByType.total}</span>
              <span className="px-2.5 py-1 bg-white/70 rounded-full font-bold text-[#6B7684]">단순 {writingByType.단순}</span>
              <span className="px-2.5 py-1 bg-white/70 rounded-full font-bold text-[#6B7684]">기준 {writingByType.기준}</span>
              <span className="px-2.5 py-1 bg-white/70 rounded-full font-bold text-[#6B7684]">복식 {writingByType.복식}</span>
            </div>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-[12px] tabular-nums">
              <thead className="bg-white/60 sticky top-0 z-10">
                <tr className="text-[10.5px] uppercase tracking-wider text-[#6B7684] border-b border-white/40">
                  <th className="px-3 py-2.5 text-left sticky left-0 bg-white/80 z-20 min-w-[160px]">고객사</th>
                  <th className="px-2 py-2.5">유형</th>
                  {showAssignedUser && <th className="px-2 py-2.5">담당</th>}
                  <th className="px-3 py-2.5 text-left min-w-[140px]">진행률</th>
                  <th className="px-3 py-2.5 text-right">전기 매출</th>
                  <th className="px-3 py-2.5 text-right bg-[#10B981]/10">당기 매출</th>
                  <th className="px-2 py-2.5 text-center">↕</th>
                  <th className="px-3 py-2.5 text-right bg-[#10B981]/10">당기 소득</th>
                  <th className="px-3 py-2.5 text-right bg-[#10B981]/10">예상 세액</th>
                  <th className="px-2 py-2.5 text-center">감면</th>
                  <th className="px-2 py-2.5 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40">
                {writingClients.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-[#6B7684] text-sm">작성중 거래처가 없습니다</td></tr>
                ) : writingClients.map(client => {
                  const r = getRecord(client);
                  const wp = getWritingProgress(r);
                  const ft = getFilingTypeBadge(r);
                  const dS = calcDelta(r.prevSales, r.currSales);
                  const reductions = getReductionBadges(r);
                  const isSel = selectedClientId === client.id;
                  return (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`cursor-pointer transition ${isSel ? "" : "hover:bg-[#F5F9FF]/40"}`}
                      style={isSel ? { background: "rgba(49,130,246,0.10)" } : undefined}
                    >
                      <td className={`px-3 py-2.5 font-bold sticky left-0 z-10 ${isSel ? "" : "bg-white/70"}`} style={isSel ? { background: "rgba(49,130,246,0.10)" } : undefined}>
                        {client.name}
                        {client.ceoName && <div className="text-[10.5px] text-[#6B7684] font-normal">{client.ceoName}</div>}
                      </td>
                      <td className="px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={r.filingType ?? ""}
                          onChange={(e) => handleFieldBlur(client.id, "filingType", e.target.value)}
                          className="border border-[#E5E8EB] rounded px-1 py-0.5 text-[11px] bg-white focus:outline-none w-[88px]"
                        >
                          <option value="">-</option>
                          {["자기조정", "외부조정", "간편장부", "추계-기준율", "추계-단순율", "성실신고"].map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                      {showAssignedUser && <td className="px-2 py-2.5 text-center text-[#4E5968]">{client.assignedUserName ?? "-"}</td>}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 progress" style={{ height: "5px" }}>
                            <div className="progress-fill gradient-blue" style={{ width: `${(wp.step / 4) * 100}%` }} />
                          </div>
                          <span className="text-[10.5px] font-bold text-[#3182F6] min-w-[24px]">{wp.step}/4</span>
                        </div>
                        <div className="text-[9.5px] text-[#6B7684] mt-0.5">{wp.statusLabel}</div>
                      </td>
                      <EditableNumberCell value={r.prevSales} onSave={(v) => handleFieldBlur(client.id, "prevSales", v)} className="text-[#6B7684]" />
                      <EditableNumberCell value={r.currSales} onSave={(v) => handleFieldBlur(client.id, "currSales", v)} className="font-bold" />
                      <td className="px-2 py-2.5 text-center text-[10.5px] font-bold">
                        {dS.pct !== null ? (
                          <span className={dS.pct >= 0 ? "text-[#10B981]" : "text-[#DC2626]"}>{dS.pct > 0 ? "+" : ""}{dS.pct}%</span>
                        ) : <span className="text-[#B0B8C1]">-</span>}
                      </td>
                      <EditableNumberCell value={r.currIncome} onSave={(v) => handleFieldBlur(client.id, "currIncome", v)} className="font-bold" />
                      <EditableNumberCell value={r.currTax} onSave={(v) => handleFieldBlur(client.id, "currTax", v)} className="font-bold text-[#3182F6]" />
                      <td className="px-2 py-2.5 text-center">
                        {reductions.length > 0 ? (
                          <div className="flex justify-center gap-0.5 flex-wrap">
                            {reductions.map(b => <span key={b.label} className={`text-[10px] font-bold ${b.color}`}>{b.label}</span>)}
                          </div>
                        ) : <span className="text-[#B0B8C1] text-[10.5px]">-</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditClientId(client.id); }}
                          className="text-[10.5px] bg-[#3182F6] text-white px-2.5 py-1 rounded-lg font-bold whitespace-nowrap hover:bg-[#1B64DA]"
                        >
                          계속
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-white/40 flex items-center justify-between text-[11.5px] text-[#6B7684] border-t border-white/40">
            <div>{writingClients.length}건 표시</div>
            <div>💡 행 클릭 → 우측에 체크리스트 deep view</div>
          </div>
        </div>
      ) : stageFilter === "collect" ? (
        // ① 자료수집 전용 레이아웃 (amber/brown 톤)
        (() => {
          const list = stageClients.collect;
          const docFields: { key: string; label: string; get: (r: ITRecord) => boolean }[] = [
            { key: "noticeSent",      label: "안내문",   get: (r) => r.noticeSent },
            { key: "linkPass",        label: "링크패스", get: (r) => r.linkPass },
            { key: "depreciation",    label: "감가상각", get: (r) => r.depreciation },
            { key: "interestExpense", label: "이자비용", get: (r) => r.interestExpense },
            { key: "insurance",       label: "보험료",   get: (r) => r.insurance },
            { key: "donation",        label: "기부금",   get: (r) => r.donation },
          ];
          const totalDocs = list.length * docFields.length;
          const gotDocs = list.reduce((s, c) => s + docFields.filter(f => f.get(getRecord(c))).length, 0);
          const avgPct = totalDocs === 0 ? 0 : Math.round((gotDocs / totalDocs) * 100);
          return (
            <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-2.5 bg-gradient-to-r from-[#FBBF24]/15 via-[#F59E0B]/10 to-transparent border-b border-white/40 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#92400E] animate-pulse" />
                  <span className="text-[13px] font-bold text-[#92400E]">① 자료수집 — {list.length}건</span>
                  <span className="text-[11px] text-[#6B7684]">6항목 자료 수령 진행</span>
                </div>
                <div className="flex gap-1.5 text-[11px]">
                  <span className="px-2.5 py-1 bg-[#92400E] text-white rounded-full font-bold">전체 {list.length}</span>
                  <span className="px-2.5 py-1 bg-white/70 rounded-full font-bold text-[#92400E]">평균 수령률 {avgPct}%</span>
                </div>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-[12px]">
                  <thead className="bg-white/60 sticky top-0 z-10">
                    <tr className="text-[10.5px] uppercase tracking-wider text-[#6B7684] border-b border-white/40">
                      <th className="px-3 py-2.5 text-left sticky left-0 bg-white/80 z-20 min-w-[160px]">고객사</th>
                      <th className="px-2 py-2.5">유형</th>
                      {showAssignedUser && <th className="px-2 py-2.5">담당</th>}
                      <th className="px-3 py-2.5 text-left min-w-[130px]">진행</th>
                      {docFields.map(f => <th key={f.key} className="px-2 py-2.5 text-center">{f.label}</th>)}
                      <th className="px-2 py-2.5 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {list.length === 0 ? (
                      <tr><td colSpan={11 + (showAssignedUser ? 1 : 0)} className="text-center py-12 text-[#6B7684] text-sm">자료수집 거래처가 없습니다</td></tr>
                    ) : list.map(client => {
                      const r = getRecord(client);
                      const ft = getFilingTypeBadge(r);
                      const done = docFields.filter(f => f.get(r)).length;
                      return (
                        <tr key={client.id} className="transition hover:bg-[#FEFAF0]/60">
                          <td className="px-3 py-2.5 font-bold sticky left-0 z-10 bg-white/70">
                            {client.name}
                            {client.ceoName && <div className="text-[10.5px] text-[#6B7684] font-normal">{client.ceoName}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ft.color}`}>{ft.label}</span>
                          </td>
                          {showAssignedUser && <td className="px-2 py-2.5 text-center text-[#4E5968]">{client.assignedUserName ?? "-"}</td>}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 progress" style={{ height: "5px" }}>
                                <div className="progress-fill" style={{ width: `${(done / docFields.length) * 100}%`, background: "linear-gradient(90deg,#FBBF24,#92400E)" }} />
                              </div>
                              <span className="text-[10.5px] font-bold text-[#92400E] min-w-[24px]">{done}/{docFields.length}</span>
                            </div>
                          </td>
                          {docFields.map(f => {
                            const checked = f.get(r);
                            return (
                              <td key={f.key} className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggle(client.id, f.key)}
                                  disabled={isPending}
                                  title={f.label}
                                  className={`w-5 h-5 rounded-md inline-flex items-center justify-center text-[11px] transition ${
                                    checked
                                      ? "bg-[#92400E] text-white shadow-sm shadow-[#92400E]/30"
                                      : "bg-white/70 border border-[#E5E8EB] text-transparent hover:border-[#92400E]/50 hover:bg-[#FBBF24]/10"
                                  }`}
                                >✓</button>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2.5 text-center">
                            <button onClick={(e) => { e.stopPropagation(); setEditClientId(client.id); }}
                              className="text-[10.5px] bg-[#92400E] text-white px-2.5 py-1 rounded-lg font-bold whitespace-nowrap hover:bg-[#7C2D12]">
                              상세
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 bg-white/40 flex items-center justify-between text-[11.5px] text-[#6B7684] border-t border-white/40">
                <div>{list.length}건 표시</div>
                <div>💡 칸 클릭 → 즉시 토글 · 행 클릭 → 우측 deep view</div>
              </div>
            </div>
          );
        })()
      ) : stageFilter === "approval" ? (
        // ③ 결재 전용 레이아웃 (amber/orange 톤, 이상치 강조)
        (() => {
          const list = stageClients.approval;
          const anomalyCount = list.filter(isAnomalyClient).length;
          return (
            <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
              <div className="px-4 py-2.5 bg-gradient-to-r from-[#F59E0B]/15 via-[#F59E0B]/8 to-transparent border-b border-white/40 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                  <span className="text-[13px] font-bold text-[#F59E0B]">③ 결재 (세무사) — {list.length}건</span>
                  <span className="text-[11px] text-[#6B7684]">전기 대비 검토 + 감면 확인</span>
                </div>
                <div className="flex gap-1.5 text-[11px]">
                  <span className="px-2.5 py-1 bg-[#F59E0B] text-white rounded-full font-bold">전체 {list.length}</span>
                  {anomalyCount > 0 && <span className="px-2.5 py-1 bg-[#DC2626] text-white rounded-full font-bold">⚠ 이상치 {anomalyCount}</span>}
                </div>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-[12px] tabular-nums">
                  <thead className="bg-white/60 sticky top-0 z-10">
                    <tr className="text-[10.5px] uppercase tracking-wider text-[#6B7684] border-b border-white/40">
                      <th className="px-3 py-2.5 text-left sticky left-0 bg-white/80 z-20 min-w-[170px]">고객사</th>
                      <th className="px-2 py-2.5">유형</th>
                      {showAssignedUser && <th className="px-2 py-2.5">담당</th>}
                      <th className="px-3 py-2.5 text-right">전기 매출</th>
                      <th className="px-3 py-2.5 text-right bg-[#F59E0B]/10">당기 매출</th>
                      <th className="px-2 py-2.5 text-center">↕</th>
                      <th className="px-3 py-2.5 text-right">전기 세액</th>
                      <th className="px-3 py-2.5 text-right bg-[#F59E0B]/10">당기 세액</th>
                      <th className="px-2 py-2.5 text-center">↕</th>
                      <th className="px-2 py-2.5 text-center">AI 창중</th>
                      <th className="px-2 py-2.5 text-center">AI 중특</th>
                      <th className="px-2 py-2.5 text-center">감면</th>
                      <th className="px-2 py-2.5 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {list.length === 0 ? (
                      <tr><td colSpan={13 + (showAssignedUser ? 1 : 0)} className="text-center py-12 text-[#6B7684] text-sm">결재 대기 거래처가 없습니다</td></tr>
                    ) : list.map(client => {
                      const r = getRecord(client);
                      const ft = getFilingTypeBadge(r);
                      const dS = calcDelta(r.prevSales, r.currSales);
                      const dT = calcDelta(r.prevTax, r.currTax);
                      const reductions = getReductionBadges(r);
                      const isAnom = isAnomalyClient(client);
                      const isSel = selectedClientId === client.id;
                      const selBg = "rgba(245,158,11,0.12)";
                      return (
                        <tr key={client.id} onClick={() => setSelectedClientId(client.id)}
                          className={`cursor-pointer transition ${isSel ? "" : isAnom ? "hover:bg-[#FEF2F2]/60" : "hover:bg-[#FFFBEB]/60"}`}
                          style={isSel ? { background: selBg, borderLeft: "3px solid #F59E0B" } : isAnom ? { borderLeft: "3px solid #DC2626" } : undefined}>
                          <td className={`px-3 py-2.5 font-bold sticky left-0 z-10 ${isSel ? "" : "bg-white/70"}`} style={isSel ? { background: selBg } : undefined}>
                            <div className="flex items-center gap-1.5">
                              <span>{client.name}</span>
                              {isAnom && <span title="전년대비 ±30% 변동" className="text-[10px] bg-[#DC2626]/15 text-[#DC2626] px-1 py-0.5 rounded font-bold">⚠</span>}
                            </div>
                            {client.ceoName && <div className="text-[10.5px] text-[#6B7684] font-normal">{client.ceoName}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ft.color}`}>{ft.label}</span>
                          </td>
                          {showAssignedUser && <td className="px-2 py-2.5 text-center text-[#4E5968]">{client.assignedUserName ?? "-"}</td>}
                          <td className="px-3 py-2.5 text-right text-[#6B7684]">{formatNumber(r.prevSales) || "-"}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{formatNumber(r.currSales) || "-"}</td>
                          <td className="px-2 py-2.5 text-center text-[10.5px] font-bold">
                            {dS.pct !== null ? (
                              <span className={dS.isAnomaly ? "text-[#DC2626] bg-[#DC2626]/10 px-1.5 py-0.5 rounded" : dS.pct >= 0 ? "text-[#10B981]" : "text-[#F59E0B]"}>{dS.pct > 0 ? "+" : ""}{dS.pct}%</span>
                            ) : <span className="text-[#B0B8C1]">-</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-[#6B7684]">{formatNumber(r.prevTax) || "-"}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-[#3182F6]">{formatNumber(r.currTax) || "-"}</td>
                          <td className="px-2 py-2.5 text-center text-[10.5px] font-bold">
                            {dT.pct !== null ? (
                              <span className={dT.isAnomaly ? "text-[#DC2626] bg-[#DC2626]/10 px-1.5 py-0.5 rounded" : dT.pct >= 0 ? "text-[#10B981]" : "text-[#F59E0B]"}>{dT.pct > 0 ? "+" : ""}{dT.pct}%</span>
                            ) : <span className="text-[#B0B8C1]">-</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center text-[11px] font-bold">
                            {client.aiStartupReduction === "O" ? <span className="text-[#10B981]">O</span> : client.aiStartupReduction === "X" ? <span className="text-[#DC2626]">X</span> : <span className="text-[#B0B8C1]">-</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center text-[11px] font-bold">
                            {client.aiSmeReduction === "O" ? <span className="text-[#10B981]">O</span> : client.aiSmeReduction === "X" ? <span className="text-[#DC2626]">X</span> : <span className="text-[#B0B8C1]">-</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {reductions.length > 0 ? (
                              <div className="flex justify-center gap-0.5 flex-wrap">
                                {reductions.map(b => <span key={b.label} className={`text-[10px] font-bold ${b.color}`}>{b.label}</span>)}
                              </div>
                            ) : <span className="text-[#B0B8C1] text-[10.5px]">-</span>}
                          </td>
                          <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleToggle(client.id, "depositReceived")}
                              disabled={isPending}
                              className={`text-[10.5px] px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition ${
                                r.depositReceived
                                  ? "bg-[#10B981] text-white shadow-sm shadow-[#10B981]/30"
                                  : "bg-[#F59E0B] text-white hover:bg-[#D97706]"
                              }`}
                            >
                              {r.depositReceived ? "✓ 결재" : "결재"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 bg-white/40 flex items-center justify-between text-[11.5px] text-[#6B7684] border-t border-white/40">
                <div>{list.length}건 표시 · ⚠ 이상치 {anomalyCount}건</div>
                <div>💡 결재 클릭 → 컨펌 단계로 이동</div>
              </div>
            </div>
          );
        })()
      ) : (
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
                  <tr
                    key={client.id}
                    className={`transition-colors ${r.filingDone ? "bg-[#F1FBF4]/50" : "hover:bg-[#F5F9FF]/30"}`}
                    style={hasGroup && !isLastInGroup ? { borderBottom: "1px dashed #d1d5db" } : { borderBottom: "2.5px solid #9ca3af" }}
                  >
                    {showGroup("기본") && <>
                      {/* 고객사명 */}
                      <td className="px-3 py-2 text-[#191F28] font-medium sticky left-0 bg-white z-10 border-r border-[#F2F4F6]">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditClientId(client.id); }} className="hover:underline cursor-pointer text-left">
                            {client.name}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setTaxCalcModal({
                              clientId: client.id,
                              clientName: client.name,
                              currSales: r.currSales,
                              currIncome: r.currIncome,
                              aiStartup: client.aiStartupReduction ?? null,
                              aiSme: client.aiSmeReduction ?? null,
                            }); }}
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
      )}

      {/* 우측 사이드 패널 (단계 선택시) */}
      {stageFilter === "collect" && (
        <aside className="space-y-3 overflow-y-auto">
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#FBBF24]/15 to-transparent">
            <div className="text-[12px] font-bold text-[#92400E] mb-2">📋 자료수집</div>
            <div className="text-[24px] font-bold leading-none">{stageClients.collect.length}<span className="text-[12px] text-[#6B7684]">건</span></div>
            <div className="text-[10.5px] text-[#6B7684] mt-1">자료 미수령 또는 수집 중</div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[12px] font-bold mb-3">담당자별 미수령</div>
            <div className="space-y-2 text-[12px]">
              {[...countByAssigned(stageClients.collect).entries()].slice(0, 6).map(([name, n]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-[#4E5968]">{name}</span>
                  <span className="font-bold tabular-nums text-[#92400E]">{n}건</span>
                </div>
              ))}
              {countByAssigned(stageClients.collect).size === 0 && <div className="text-[11px] text-[#8B95A1]">데이터 없음</div>}
            </div>
          </div>
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#3182F6]/8 to-transparent">
            <div className="text-[12px] font-bold text-[#3182F6] mb-2">💡 팁</div>
            <ul className="text-[11.5px] text-[#4E5968] space-y-1.5">
              <li>• 6항목 모두 체크 → ② 작성중 단계로 자동 이동</li>
              <li>• 표 안의 ✓ 칸 클릭으로 즉시 토글 가능</li>
            </ul>
          </div>
        </aside>
      )}

      {stageFilter === "writing" && (
        selectedClient
          ? renderDeepView(selectedClient, 2, "② 작성중", "bg-[#3182F6]/15 text-[#3182F6]")
          : (
            <aside className="space-y-3 overflow-y-auto">
              <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#3182F6]/8 to-transparent">
                <div className="text-[12px] font-bold text-[#3182F6] mb-2">✏️ 작성중</div>
                <div className="text-[24px] font-bold leading-none">{stageClients.writing.length}<span className="text-[12px] text-[#6B7684]">건</span></div>
                <div className="text-[10.5px] text-[#6B7684] mt-1">신고서 작성 진행 중</div>
              </div>
              <div className="glass rounded-2xl p-4">
                <div className="text-[12px] font-bold mb-3">예상 세액 합계</div>
                <div className="text-[20px] font-bold tabular-nums leading-none">₩{sumOf(stageClients.writing, "currTax").toLocaleString("ko-KR")}</div>
              </div>
              <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#3182F6]/5 to-transparent text-center">
                <div className="text-[11.5px] text-[#6B7684]">⬅ 좌측 행을 클릭하면<br/>그 거래처 deep view가 표시됩니다</div>
              </div>
            </aside>
          )
      )}

      {stageFilter === "approval" && selectedClient
        ? renderDeepView(selectedClient, 4, "③ 결재(세무사)", "bg-[#F59E0B]/15 text-[#F59E0B]")
        : null}

      {stageFilter === "approval" && !selectedClient && (() => {
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
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#A855F7]/12 to-transparent">
            <div className="text-[12px] font-bold text-[#A855F7] mb-2">💰 컨펌+보수 단계</div>
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
          <div className="glass rounded-2xl p-4 bg-gradient-to-br from-[#10B981]/12 to-transparent">
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

function CheckGroup({ title, done, total, items, highlight }: {
  title: string;
  done: number;
  total: number;
  items: { label: string; checked: boolean; onToggle?: () => void }[];
  highlight?: boolean;
}) {
  const isDone = done >= total;
  const bg = highlight ? "bg-[#3182F6]/10 border-[#3182F6] ring-1 ring-[#3182F6]/20" : isDone ? "bg-[#10B981]/8 border-[#10B981]" : "bg-white/60 border-[#E5E8EB]";
  const titleColor = highlight ? "text-[#3182F6]" : isDone ? "" : "text-[#6B7684]";
  const badgeBg = highlight ? "bg-[#3182F6] text-white animate-pulse" : isDone ? "bg-[#10B981] text-white" : "bg-white border border-[#E5E8EB] text-[#8B95A1]";
  return (
    <div className={`rounded-xl p-2.5 border-l-2 ${bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 rounded font-bold ${badgeBg}`}>{isDone ? "✓" : highlight ? "●" : "○"}</span>
          <span className={`text-[12px] font-bold ${titleColor}`}>{title}</span>
        </div>
        <span className={`text-[10px] font-bold ${highlight ? "text-[#3182F6]" : isDone ? "text-[#10B981]" : "text-[#8B95A1]"}`}>{done}/{total}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 ml-1 text-[11px]">
        {items.map(it => (
          <button
            key={it.label}
            type="button"
            onClick={it.onToggle}
            disabled={!it.onToggle}
            className={`flex items-center gap-1.5 text-left rounded px-1 py-0.5 ${it.onToggle ? "hover:bg-white/60 cursor-pointer" : ""} ${it.checked ? "" : "text-[#8B95A1]"}`}
          >
            <span className={`inline-block w-3 h-3 rounded-sm ${it.checked ? "bg-[#10B981]" : "bg-white border border-[#D1D6DB]"}`} />
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StageRow({ num, title, done, highlight }: { num: number; title: string; done: boolean; highlight?: boolean }) {
  const bg = highlight
    ? "bg-[#F59E0B]/10 border-[#F59E0B] ring-1 ring-[#F59E0B]/30"
    : done ? "bg-[#10B981]/8 border-[#10B981]" : "bg-white/60 border-[#E5E8EB]";
  const badge = highlight
    ? "bg-[#F59E0B] text-white animate-pulse"
    : done ? "bg-[#10B981] text-white" : "bg-white border border-[#E5E8EB] text-[#8B95A1]";
  const titleColor = highlight ? "text-[#F59E0B]" : done ? "" : "text-[#6B7684]";
  const status = highlight ? "검토중" : done ? "완료" : "대기";
  const statusColor = highlight ? "text-[#F59E0B] font-bold" : done ? "text-[#10B981] font-bold" : "text-[#8B95A1]";
  return (
    <div className={`rounded-xl p-2.5 border-l-2 ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 rounded font-bold ${badge}`}>{highlight ? "●" : done ? "✓" : num}</span>
          <span className={`text-[12px] font-bold ${titleColor}`}>{title}</span>
        </div>
        <span className={`text-[10px] ${statusColor}`}>{status}</span>
      </div>
    </div>
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

function EditableNumberCell({ value, onSave, className = "" }: { value: string | null; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  if (editing) {
    return (
      <td className="px-1 py-1 text-right" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } if (e.key === "Escape") { setEditing(false); } }}
          className="w-24 border border-blue-300 rounded px-1 py-0.5 text-[12px] text-right focus:outline-none"
        />
      </td>
    );
  }
  return (
    <td
      className={`px-3 py-2.5 text-right cursor-pointer hover:bg-[#F5F9FF] ${className}`}
      onClick={(e) => { e.stopPropagation(); setVal(value ?? ""); setEditing(true); }}
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
