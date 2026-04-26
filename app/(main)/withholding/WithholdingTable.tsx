"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWithholdingTask, setLaborOverride, setWithholdingMemo } from "@/app/actions/withholding";
import { PinIcon } from "@/components/icons";
// 프로세스 단계도 withholdingRecords 테이블을 사용

const LABOR_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400", text: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  "사업소득": { border: "border-blue-400", text: "text-[#3182F6]", bg: "bg-[#F5F9FF]" },
  "일용직": { border: "border-green-500", text: "text-[#15803D]", bg: "bg-[#F1FBF4]" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
  A: { label: "A", color: "text-[#B91C1C]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", description: "매월 변동" },
  B: { label: "B", color: "text-[#1B64DA]", bg: "bg-[#F5F9FF]", border: "border-[#A3CAFD]", description: "매월 동일, 납부서 필요" },
  C: { label: "C", color: "text-[#15803D]", bg: "bg-[#F1FBF4]", border: "border-[#BBF7D0]", description: "매월 동일, 납부서 불필요" },
  D: { label: "D", color: "text-[#4E5968]", bg: "bg-[#F9FAFB]", border: "border-[#E5E8EB]", description: "1인사업자 (원천세 없음)" },
};

// 프로세스 단계 (공통)
const ALL_PROCESS_STEPS = ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];

function getStepsByType(type: string, month: number, halfYearTax: boolean = false): string[] {
  const isTaxMonth = month === 1 || month === 7;
  switch (type) {
    case "A":
      return halfYearTax && !isTaxMonth
        ? ["자료요청", "자료수취", "급여명세서전달"]
        : ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];
    case "B":
      return halfYearTax && !isTaxMonth
        ? ["급여명세서전달"]
        : ["급여명세서전달", "원천세신고", "납부서전달"];
    case "C":
      return isTaxMonth
        ? ["급여명세서전달", "원천세신고"]
        : ["급여명세서전달"];
    case "D": return [];
    default:
      return halfYearTax && !isTaxMonth
        ? ["자료요청", "자료수취", "급여명세서전달"]
        : ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];
  }
}

const STEP_ICONS: Record<string, string> = {
  급여확인요청: "📋", 급여명세서전달: "📄", 원천세신고: "🏛️", 납부서전달: "💳", 최초안내발송: "📮",
};

type WHRecord = { taskType: string; done: boolean };
type Client = {
  id: number;
  name: string;
  laborTypes: string | null;
  halfYearTax: boolean;
  accountingProgram: string;
  withholdingType: string | null;
  wehagoCno: string | null;
  wehagoCdCom: string | null;
  wehagoColors: string | null; // JSON: {"2025":"#92B81E","2026":"#D0BA00"}
  assignedUser?: { name: string } | null;
  withholdingRecords: WHRecord[];
  withholdingLaborOverrides: { laborTypes: string | null; memo: string | null }[];
};

function getRequiredTasks(laborTypes: string[], halfYearTax: boolean, month: number) {
  const tasks: { key: string; label: string }[] = [];
  const has근로 = laborTypes.includes("근로소득");
  const has사업 = laborTypes.includes("사업소득");
  const has일용 = laborTypes.includes("일용직");

  if (halfYearTax) {
    if (month === 1 || month === 7) {
      // 6개월납은 1,7월만 신고
    }
  }

  if (has근로 && (month === 1 || month === 7)) tasks.push({ key: "간이지급명세서_근로", label: "간이지급명세서(근로)" });
  if (has사업) tasks.push({ key: "간이지급명세서_사업", label: "간이지급명세서(사업)" });
  if (has일용) tasks.push({ key: "근로내용확인신고서", label: "근로내용확인신고서" });
  if (has근로 && month === 2) tasks.push({ key: "지급명세서_근로", label: "지급명세서(근로)" });
  if (has사업 && month === 2) tasks.push({ key: "지급명세서_사업", label: "지급명세서(사업)" });
  if (has일용) tasks.push({ key: "지급명세서_일용", label: "지급명세서(일용)" });

  return tasks;
}

function getAllExtraColumns() {
  return [
    { key: "간이지급명세서_근로", label: "간이지급명세서\n(근로)" },
    { key: "간이지급명세서_사업", label: "간이지급명세서\n(사업)" },
    { key: "근로내용확인신고서", label: "근로내용\n확인신고서" },
    { key: "지급명세서_근로", label: "지급명세서\n(근로)" },
    { key: "지급명세서_사업", label: "지급명세서\n(사업)" },
    { key: "지급명세서_일용", label: "지급명세서\n(일용)" },
  ];
}

export function WithholdingTable({ clients, yearMonth, showAssignedUser = false, wehagoCompanyId = "", wehagoTaxNum = "" }: { clients: Client[]; yearMonth: string; showAssignedUser?: boolean; wehagoCompanyId?: string; wehagoTaxNum?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["D"]));
  const [verifyResult, setVerifyResult] = useState<{
    excelCount: number;
    clientCount: number;
    checkedNotInExcel: { name: string; bizNumber: string; type: string }[];
    notCheckedButInExcel: { name: string; bizNumber: string; type: string }[];
    allMatch: boolean;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [payslipLoading, setPayslipLoading] = useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleVerify(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("yearMonth", yearMonth);
      const res = await fetch("/api/withholding-verify", { method: "POST", body: fd });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      alert("검증 중 오류가 발생했습니다.");
    }
    setVerifyLoading(false);
    e.target.value = "";
  }
  const month = parseInt(yearMonth.split("-")[1]);
  const extraColumns = getAllExtraColumns();

  // 마지막 선택 월 localStorage에 저장
  React.useEffect(() => {
    localStorage.setItem("withholding_ym", yearMonth);
  }, [yearMonth]);

  function handleMonthChange(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/withholding?ym=${ym}`);
  }

  function handleSetMonth(targetMonth: number) {
    const [y] = yearMonth.split("-").map(Number);
    const ym = `${y}-${String(targetMonth).padStart(2, "0")}`;
    router.push(`/withholding?ym=${ym}`);
  }

  function handleToggle(clientId: number, taskType: string) {
    startTransition(async () => { await toggleWithholdingTask(clientId, yearMonth, taskType); });
  }

  function handleProcessToggle(clientId: number, step: string) {
    startTransition(async () => { await toggleWithholdingTask(clientId, yearMonth, step); });
  }

  const filtered = search ? clients.filter((c) => c.name.includes(search)) : clients;

  // ABCD 그룹핑
  const groups: { type: string; label: string; config: typeof TYPE_CONFIG["A"] | null; clients: Client[] }[] = [];

  // 미지정
  const unassigned = filtered.filter(c => !c.withholdingType);
  if (unassigned.length > 0) {
    groups.push({ type: "", label: "미지정", config: null, clients: unassigned });
  }

  for (const type of ["A", "B", "C", "D"]) {
    const typeClients = filtered.filter(c => c.withholdingType === type);
    if (typeClients.length > 0) {
      groups.push({ type, label: `${type} — ${TYPE_CONFIG[type].description}`, config: TYPE_CONFIG[type], clients: typeClients });
    }
  }

  // ABCD 그룹별 진행률 계산
  type GroupProgress = { type: string; description: string; total: number; done: number; pct: number };
  const groupProgress: GroupProgress[] = ["A", "B", "C", "D"].map(type => {
    const typeClients = filtered.filter(c => c.withholdingType === type);
    if (type === "D") {
      return { type, description: TYPE_CONFIG[type].description, total: typeClients.length, done: 0, pct: 0 };
    }
    let total = 0, done = 0;
    for (const c of typeClients) {
      const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
      const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
      total += steps.length;
      done += steps.filter(s => doneMap.has(s)).length;
    }
    return {
      type,
      description: TYPE_CONFIG[type].description,
      total: typeClients.length,
      done: typeClients.length > 0 ? typeClients.filter(c => {
        const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
        const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
        return steps.length > 0 && steps.every(s => doneMap.has(s));
      }).length : 0,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  // 전체 진행률
  const allClients = filtered;
  const totalProcess = allClients.reduce((sum, c) => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    return sum + steps.length;
  }, 0);
  const doneProcess = allClients.reduce((sum, c) => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    return sum + steps.filter(s => doneMap.has(s)).length;
  }, 0);

  // 원천세 신고 진행률 (ABC 그룹만, 신고없음 제외)
  const abcClients = filtered.filter(c => ["A", "B", "C"].includes(c.withholdingType || ""));
  const taxFilingTotal = abcClients.filter(c => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    return steps.includes("원천세신고") && !doneMap.has("신고없음");
  }).length;
  const taxFilingDone = abcClients.filter(c => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    return steps.includes("원천세신고") && !doneMap.has("신고없음") && doneMap.has("원천세신고");
  }).length;

  const [year, mon] = yearMonth.split("-");

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">월별 원천징수</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">원천세 · {year}년 {parseInt(mon)}월</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9 glass">
            <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="고객사 검색..."
              autoComplete="off"
              className="bg-transparent outline-none text-[12.5px] w-44"
            />
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleVerify} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={verifyLoading}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            {verifyLoading ? "검증중..." : "신고 검증"}
          </button>
          {checkedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-sm text-[#3182F6] font-medium bg-[#F5F9FF] px-3 py-1 rounded-lg">
                {checkedIds.size}개 선택
              </div>
              <button
                onClick={async () => {
                  const selectedClients = filtered.filter(c => checkedIds.has(c.id));
                  if (!selectedClients.length) return;
                  if (!confirm(`${selectedClients.length}개 거래처 위멤버스 일괄 처리를 시작할까요?`)) return;

                  const monthPadded = String(month).padStart(2, "0");
                  const baseUrl = `https://smarta.wehago.com/#/smarta/humanresource`;

                  for (let idx = 0; idx < selectedClients.length; idx++) {
                    const cl = selectedClients[idx];
                    const override = cl.withholdingLaborOverrides?.[0];
                    const baseLaborTypes = cl.laborTypes?.split(",").map((t: string) => t.trim()).filter((t: string) => t && t !== "1인사업자") ?? [];
                    const laborList = override?.laborTypes
                      ? override.laborTypes.split(",").map((t: string) => t.trim()).filter((t: string) => t && t !== "1인사업자")
                      : baseLaborTypes;

                    if (!cl.wehagoCno || !cl.wehagoCdCom) continue;
                    const incomeTypes: string[] = [];
                    if (laborList.includes("근로소득")) incomeTypes.push("salary");
                    if (laborList.includes("사업소득")) incomeTypes.push("business");
                    if (laborList.includes("일용직")) incomeTypes.push("daily");
                    if (!incomeTypes.length) continue;

                    const wehagoColor = (() => { try { const c = JSON.parse(cl.wehagoColors || "{}"); return c[String(year)] || "#D0BA00"; } catch { return "#D0BA00"; } })();
                    const params = `sao&cno=${cl.wehagoCno}&cd_com=${cl.wehagoCdCom}&gisu=${month}&yminsa=${year}&searchData=${year}0101${year}1231&color=${wehagoColor}&companyName=${encodeURIComponent(cl.name)}&companyID=${wehagoCompanyId}&taxNum=${wehagoTaxNum}&yn_private=1&wehagoT`;

                    console.log(`[${idx + 1}/${selectedClients.length}] ${cl.name} 처리 시작 (${incomeTypes.map(t => t === "salary" ? "근로" : t === "business" ? "사업" : "일용").join("+")})`);

                    async function waitForFile(type: string): Promise<boolean> {
                      for (let i = 0; i < 90; i++) {
                        const res = await fetch("/api/automation/check-file", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ clientName: cl.name, year: String(year), month: monthPadded, type }),
                        });
                        const data = await res.json();
                        if (data.exists) return true;
                        await new Promise(r => setTimeout(r, 2000));
                      }
                      return false;
                    }

                    // 근로소득 다운로드
                    if (incomeTypes.includes("salary")) {
                      const tab = window.open(`${baseUrl}/SWSA0101?${params}&autoPayslip=${month}`, "_blank");
                      await waitForFile("salary");
                      if (tab) tab.close();
                    }
                    // 사업소득 다운로드
                    if (incomeTypes.includes("business")) {
                      const tab = window.open(`${baseUrl}/SWBU0103?${params}&autoBusinessIncome=${month}`, "_blank");
                      await waitForFile("business");
                      if (tab) tab.close();
                    }
                    // 일용직 다운로드
                    if (incomeTypes.includes("daily")) {
                      const tab = window.open(`${baseUrl}/TWSA0107?${params}&autoDailyWorker=${month}`, "_blank");
                      await waitForFile("daily");
                      if (tab) tab.close();
                    }

                    // 위멤버스 업로드
                    try {
                      const res = await fetch("/api/automation/wemembers-process", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clientName: cl.name, year: String(year), month: monthPadded, incomeTypes }),
                      });
                      const result = await res.json();
                      if (result.success) {
                        // 성공하면 체크 해제
                        setCheckedIds(prev => { const n = new Set(prev); n.delete(cl.id); return n; });
                      }
                    } catch {}
                  }

                  alert(`${selectedClients.length}개 거래처 위멤버스 일괄 처리 완료!`);
                  setCheckedIds(new Set());
                }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#3182F6] text-white hover:bg-[#1B64DA]"
              >
                일괄 위멤버스
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-1.5">
              <span className="text-xs text-[#6B7684]">원천세 신고</span>
              <span className="text-sm font-bold text-[#191F28]">{taxFilingDone}</span>
              <span className="text-xs text-[#8B95A1]">/</span>
              <span className="text-sm font-medium text-[#4E5968]">{taxFilingTotal}</span>
              {taxFilingTotal > 0 && (
                <div className="w-16 h-1.5 bg-[#F2F4F6] rounded-full overflow-hidden ml-1">
                  <div className="h-full bg-[#3182F6] rounded-full transition-all" style={{ width: `${Math.round(taxFilingDone / taxFilingTotal * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="text-xs text-[#8B95A1]">
              프로세스 {doneProcess}/{totalProcess}
            </div>
          </div>
          <div className="flex items-center gap-1 glass rounded-xl px-1 h-9">
            <button onClick={() => handleMonthChange(-1)} className="w-7 h-7 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</button>
            <span className="text-[12.5px] font-bold text-[#191F28] min-w-[90px] text-center">{year}년 {parseInt(mon)}월</span>
            <button onClick={() => handleMonthChange(1)} className="w-7 h-7 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</button>
          </div>
        </div>
      </div>

      {/* 12개월 그리드 */}
      <div className="glass rounded-2xl p-3 mb-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-[12px] font-bold text-[#191F28]">{year}년</div>
          <div className="text-[10.5px] text-[#6B7684]">월 클릭 → 해당 월로 이동</div>
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
            const isCurrent = m === month;
            return (
              <button
                key={m}
                onClick={() => handleSetMonth(m)}
                className={`rounded-lg p-2 text-center transition ${
                  isCurrent
                    ? "bg-[#3182F6] text-white ring-2 ring-[#3182F6]/40 shadow-lg shadow-[#3182F6]/20"
                    : "bg-white/60 hover:bg-white text-[#4E5968]"
                }`}
              >
                <div className="text-[11px] font-bold">{m}월</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ABCD 그룹별 진행률 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        {groupProgress.map(g => {
          const cfg = TYPE_CONFIG[g.type];
          if (g.type === "D") {
            return (
              <div key={g.type} className="glass rounded-2xl p-3 border-l-4 border-[#D1D6DB] opacity-70">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-6 h-6 rounded-lg ${cfg.bg} ${cfg.color} font-bold text-[12px] flex items-center justify-center`}>D</span>
                    <span className="text-[12px] font-bold">1인사업자</span>
                  </div>
                  <span className="text-[10.5px] text-[#6B7684]">스킵</span>
                </div>
                <div className="text-[20px] font-bold leading-none text-[#6B7684]">{g.total}</div>
                <div className="text-[10.5px] text-[#6B7684] mt-1.5">원천세 없음</div>
              </div>
            );
          }
          const stepCount = g.type === "A" ? "5단계" : g.type === "B" ? "3단계" : "1~2단계";
          const borderColor = g.type === "A" ? "border-[#DC2626]" : g.type === "B" ? "border-[#3182F6]" : "border-[#15803D]";
          const fillColor = g.type === "A" ? "#B91C1C" : g.type === "B" ? "linear-gradient(135deg,#6FA8FF,#3182F6)" : "linear-gradient(135deg,#6EE7B7,#10B981)";
          return (
            <div key={g.type} className={`glass rounded-2xl p-3 border-l-4 ${borderColor}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-6 h-6 rounded-lg ${cfg.bg} ${cfg.color} font-bold text-[12px] flex items-center justify-center`}>{g.type}</span>
                  <span className="text-[12px] font-bold">{g.description.split(",")[0]}</span>
                </div>
                <span className="text-[10.5px] text-[#6B7684]">{stepCount}</span>
              </div>
              <div className="text-[20px] font-bold leading-none">{g.done}<span className="text-[12px] text-[#6B7684]"> / {g.total}</span></div>
              <div className="progress mt-1.5" style={{ height: "4px" }}>
                <div className="progress-fill" style={{ width: `${g.pct}%`, background: fillColor }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 통합 테이블 */}
      <div className="flex-1 overflow-y-auto glass rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] border-b border-[#E5E8EB] sticky top-0 z-10">
            <tr>
              <th className="px-2 py-3 w-9"></th>
              <th className="text-left px-4 py-3 text-[#333D4B] font-bold text-xs whitespace-nowrap">고객사명</th>
              <th className="text-center px-2 py-3 text-[#6B7684] font-medium text-xs w-10">메모</th>
              {showAssignedUser && <th className="text-center px-2 py-3 text-[#6B7684] font-medium text-xs whitespace-nowrap">담당자</th>}
              <th className="text-center px-2 py-3 text-[#6B7684] font-medium text-xs whitespace-nowrap">신고없음</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-bold text-xs whitespace-nowrap">인건비</th>
              <th className="text-center px-2 py-3 text-[#6B7684] font-medium text-xs whitespace-nowrap">6개월납</th>
              {ALL_PROCESS_STEPS.map(step => (
                <th key={step} className="text-center px-3 py-3 whitespace-nowrap">
                  <span className="text-[11px] font-bold text-[#4E5968]">{step}</span>
                </th>
              ))}
              {extraColumns.length > 0 && <th className="w-[1px] px-0 bg-[#E5E8EB]"></th>}
              {extraColumns.map(col => (
                <th key={col.key} className="text-center px-2 py-3">
                  <span className="text-[10px] font-medium text-[#8B95A1] leading-tight block whitespace-pre-line">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={99} className="text-center py-12 text-[#8B95A1]">해당하는 거래처가 없습니다</td></tr>
            )}
            {groups.map((group) => {
              const cfg = group.config;
              const totalCols = 7 + (showAssignedUser ? 1 : 0) + ALL_PROCESS_STEPS.length + (extraColumns.length > 0 ? 1 : 0) + extraColumns.length;
              return (
                <React.Fragment key={group.type || "unassigned"}>
                  {/* 그룹 헤더 행 */}
                  <tr
                    className={`${cfg ? cfg.bg : "bg-[#F2F4F6]"} cursor-pointer select-none`}
                    onClick={() => setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      const key = group.type || "unassigned";
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })}
                  >
                    <td colSpan={totalCols} className="px-4 py-2 border-t border-b border-[#E5E8EB]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#8B95A1] w-3">{collapsedGroups.has(group.type || "unassigned") ? "▶" : "▼"}</span>
                        {cfg && (
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${cfg.border} ${cfg.color}`}>
                            {group.type}
                          </span>
                        )}
                        <span className={`text-xs font-bold ${cfg ? cfg.color : "text-[#6B7684]"}`}>{group.label}</span>
                        <span className="text-[10px] text-[#8B95A1]">{group.clients.length}개</span>
                      </div>
                    </td>
                  </tr>
                  {/* 거래처 행 */}
                  {!collapsedGroups.has(group.type || "unassigned") && group.clients.map((client) => {
                    const override = client.withholdingLaborOverrides?.[0];
                    const baseLaborTypes = client.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
                    const laborList = override?.laborTypes
                      ? override.laborTypes.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자")
                      : baseLaborTypes;
                    const monthMemo = override?.memo || "";
                    const doneMap = new Map(client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
                    const isSkipped = doneMap.has("신고없음");
                    const steps = new Set(getStepsByType(client.withholdingType || "", month, client.halfYearTax));
                    const allStepsDone = isSkipped || (steps.size > 0 && [...steps].every(s => doneMap.has(s)));
                    const hasOverride = override?.laborTypes != null && override.laborTypes !== "";
                    const requiredExtra = getRequiredTasks(laborList, client.halfYearTax, month);
                    const requiredExtraKeys = new Set(requiredExtra.map(t => t.key));

                    return (
                      <tr key={client.id} className={`border-b border-[#F2F4F6] transition-colors ${checkedIds.has(client.id) ? "bg-[#E8F3FF]" : allStepsDone ? "bg-[#F1FBF4]/40" : "hover:bg-[#F5F9FF]/30"}`}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={checkedIds.has(client.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentIdx = filtered.findIndex(c => c.id === client.id);
                              if (e.shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
                                const start = Math.min(lastCheckedIdx, currentIdx);
                                const end = Math.max(lastCheckedIdx, currentIdx);
                                setCheckedIds(prev => { const n = new Set(prev); for (let i = start; i <= end; i++) n.add(filtered[i].id); return n; });
                              } else {
                                setCheckedIds(prev => { const n = new Set(prev); if (n.has(client.id)) n.delete(client.id); else n.add(client.id); return n; });
                              }
                              setLastCheckedIdx(currentIdx);
                            }}
                            onChange={() => {}}
                            className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2 text-[#191F28] font-medium">
                          <div className="flex items-center gap-1 truncate">
                            {client.name}
                            {client.accountingProgram?.split(",").map(p => p.trim()).map(p => (
                              p === "위하고" ? <img key={p} src="/wehago.svg" alt="위하고" className="w-3.5 h-3.5 rounded shrink-0" /> :
                              p === "세무사랑" ? <img key={p} src="/semusarang.svg" alt="세무사랑" className="w-3.5 h-3.5 rounded shrink-0" /> : null
                            ))}
                            {client.wehagoCno && client.wehagoCdCom && (() => {
                              const wehagoColor = (() => { try { const c = JSON.parse(client.wehagoColors || "{}"); return c[String(year)] || "#D0BA00"; } catch { return "#D0BA00"; } })();
                              const baseUrl = `https://smarta.wehago.com/#/smarta/humanresource`;
                              const params = `sao&cno=${client.wehagoCno}&cd_com=${client.wehagoCdCom}&gisu=${month}&yminsa=${year}&searchData=${year}0101${year}1231&color=${wehagoColor}&companyName=${encodeURIComponent(client.name)}&companyID=${wehagoCompanyId}&taxNum=${wehagoTaxNum}&yn_private=1&wehagoT`;
                              return (
                                <>
                                  {laborList.includes("근로소득") && (
                                    <button
                                      onClick={() => window.open(`${baseUrl}/SWSA0101?${params}`, "_blank")}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap shrink-0"
                                      title="위하고 급여자료입력"
                                    >
                                      급여
                                    </button>
                                  )}
                                  {laborList.includes("사업소득") && (
                                    <button
                                      onClick={() => window.open(`${baseUrl}/SWBU0102?${params}`, "_blank")}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] hover:bg-[#FEF3C7] border border-[#FDE68A] whitespace-nowrap shrink-0"
                                      title="위하고 사업소득자료입력"
                                    >
                                      사업
                                    </button>
                                  )}
                                  {laborList.includes("일용직") && (
                                    <button
                                      onClick={() => window.open(`${baseUrl}/TWSA0107?${params}`, "_blank")}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 whitespace-nowrap shrink-0"
                                      title="위하고 일용직급여자료입력"
                                    >
                                      일용
                                    </button>
                                  )}
                                  {(laborList.includes("근로소득") || laborList.includes("사업소득") || laborList.includes("일용직")) && (
                                    <button
                                      onClick={async () => {
                                        const incomeTypes: string[] = [];
                                        if (laborList.includes("근로소득")) incomeTypes.push("salary");
                                        if (laborList.includes("사업소득")) incomeTypes.push("business");
                                        if (laborList.includes("일용직")) incomeTypes.push("daily");
                                        const monthPadded = String(month).padStart(2, "0");

                                        // 파일 존재 체크 함수
                                        async function waitForFile(type: string): Promise<boolean> {
                                          for (let i = 0; i < 90; i++) {
                                            const res = await fetch("/api/automation/check-file", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ clientName: client.name, year: String(year), month: monthPadded, type }),
                                            });
                                            const data = await res.json();
                                            if (data.exists) return true;
                                            await new Promise(r => setTimeout(r, 2000));
                                          }
                                          return false;
                                        }

                                        // 1단계: 근로소득 다운로드
                                        if (incomeTypes.includes("salary")) {
                                          const tab = window.open(`${baseUrl}/SWSA0101?${params}&autoPayslip=${month}`, "_blank");
                                          const found = await waitForFile("salary");
                                          if (tab) tab.close();
                                          if (!found) { alert("근로소득 다운로드 시간 초과"); return; }
                                        }

                                        // 2단계: 사업소득 다운로드
                                        if (incomeTypes.includes("business")) {
                                          const tab = window.open(`${baseUrl}/SWBU0103?${params}&autoBusinessIncome=${month}`, "_blank");
                                          const found = await waitForFile("business");
                                          if (tab) tab.close();
                                          if (!found) { alert("사업소득 다운로드 시간 초과"); return; }
                                        }

                                        // 3단계: 일용직 다운로드
                                        if (incomeTypes.includes("daily")) {
                                          const tab = window.open(`${baseUrl}/TWSA0107?${params}&autoDailyWorker=${month}`, "_blank");
                                          const found = await waitForFile("daily");
                                          if (tab) tab.close();
                                          if (!found) { alert("일용직 다운로드 시간 초과"); return; }
                                        }

                                        // 4단계: 위멤버스 업로드
                                        try {
                                          const res = await fetch("/api/automation/wemembers-process", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              clientName: client.name,
                                              year: String(year),
                                              month: monthPadded,
                                              incomeTypes,
                                            }),
                                          });
                                          const result = await res.json();
                                          alert(result.message || (result.success ? "위멤버스 업로드 완료!" : "업로드 실패"));
                                        } catch (err) {
                                          alert("위멤버스 업로드 실패: " + String(err));
                                        }
                                      }}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#F5F9FF] text-[#3182F6] hover:bg-[#E8F3FF] border border-[#A3CAFD] whitespace-nowrap shrink-0"
                                      title="위멤버스 다운로드+업로드"
                                    >
                                      위멤버스
                                    </button>
                                  )}
                                  {doneMap.has("위멤버스완료") && (
                                    <span className="ml-0.5 text-[9px] text-[#16A865] font-bold">✓</span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-center">
                          {monthMemo ? (
                            <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: monthMemo })}>
                              <PinIcon width={12} height={12} className="text-[#F59E0B]" />
                              <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#3182F6] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl">{monthMemo}</div>
                            </span>
                          ) : (
                            <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-[#D1D6DB] hover:text-[#F59E0B] text-xs">+</button>
                          )}
                        </td>
                        {showAssignedUser && (
                          <td className="px-1 py-2 text-center text-[10px] text-[#6B7684] truncate">{client.assignedUser?.name ?? "-"}</td>
                        )}
                        {/* 신고없음 */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSkipped}
                            onChange={() => handleToggle(client.id, "신고없음")}
                            disabled={isPending}
                            className="accent-gray-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        {/* 인건비 (3개 소득 전부 표시, 클릭으로 해당 월 토글) */}
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5 flex-wrap">
                            {(["근로소득", "사업소득", "일용직"] as const).map(t => {
                              const s = LABOR_STYLES[t];
                              const isActive = laborList.includes(t);
                              const isBase = baseLaborTypes.includes(t);
                              return (
                                <button
                                  key={t}
                                  onClick={() => {
                                    let newList: string[];
                                    if (isActive) {
                                      newList = laborList.filter(x => x !== t);
                                    } else {
                                      newList = [...laborList, t];
                                    }
                                    const isSame = newList.sort().join(",") === [...baseLaborTypes].sort().join(",");
                                    startTransition(() => setLaborOverride(client.id, yearMonth, isSame ? "" : newList.join(",")));
                                  }}
                                  disabled={isPending}
                                  className={`border rounded px-1 py-0.5 text-[9px] font-medium transition-all ${
                                    isActive
                                      ? `${s.border} ${s.text} ${s.bg}`
                                      : "border-dashed border-[#D1D6DB] text-[#B0B8C1] bg-white"
                                  } ${!isBase && isActive ? "ring-1 ring-offset-1 ring-blue-400" : ""} hover:opacity-80 cursor-pointer`}
                                  title={isActive ? `${t} 이번달 제외` : `${t} 이번달 추가`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                            {hasOverride && <span className="text-[9px] text-[#3182F6]" title="이번달 인건비가 기본값과 다릅니다">✎</span>}
                          </div>
                        </td>
                        {/* 6개월납 */}
                        <td className="px-2 py-2 text-center">
                          {client.halfYearTax ? (
                            <span className="bg-[#FFFBEB] text-[#B45309] border border-orange-300 rounded px-1.5 py-0.5 text-[9px] font-medium">6개월</span>
                          ) : (
                            <span className="text-[#D1D6DB] text-[10px]">-</span>
                          )}
                        </td>
                        {/* 프로세스 단계 */}
                        {ALL_PROCESS_STEPS.map(step => (
                          <td key={step} className="px-2 py-2 text-center">
                            {isSkipped ? (
                              <span className="text-[#D1D6DB] text-[10px]">-</span>
                            ) : steps.has(step) ? (
                              <div className="flex justify-center">
                                <button
                                  onClick={() => handleProcessToggle(client.id, step)}
                                  disabled={isPending}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all text-[10px] font-bold ${
                                    doneMap.has(step)
                                      ? `${cfg?.bg || "bg-[#F2F4F6]"} ${cfg?.border || "border-[#D1D6DB]"} ${cfg?.color || "text-[#4E5968]"}`
                                      : "border-[#E5E8EB] text-[#B0B8C1] hover:border-[#8B95A1]"
                                  }`}
                                  title={step}
                                >
                                  {doneMap.has(step) ? "✓" : ""}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[#D1D6DB] text-[10px]">-</span>
                            )}
                          </td>
                        ))}
                        {/* 구분선 */}
                        {extraColumns.length > 0 && <td className="w-[1px] px-0 bg-[#F2F4F6]"></td>}
                        {/* 추가 체크리스트 */}
                        {extraColumns.map(col => (
                          <td key={col.key} className="px-1 py-2 text-center">
                            {isSkipped || client.withholdingType === "D" ? (
                              <span className="text-[#D1D6DB] text-[10px]">-</span>
                            ) : requiredExtraKeys.has(col.key) ? (
                              <input
                                type="checkbox"
                                checked={doneMap.has(col.key)}
                                onChange={() => handleToggle(client.id, col.key)}
                                disabled={isPending}
                                className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer"
                              />
                            ) : (
                              <span className="text-[#D1D6DB] text-[10px]">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 특이사항 모달 */}
      {memoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMemoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">이번달 특이사항</h3>
                <p className="text-xs text-[#8B95A1] mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="이번달 특이사항을 입력하세요..."
              rows={4}
              className="w-full border border-[#E5E8EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#3182F6] resize-none mb-4"
              id="memo-textarea"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {memoModal.value && (
                <button onClick={() => { startTransition(() => setWithholdingMemo(memoModal.clientId, yearMonth, "")); setMemoModal(null); }} className="text-sm text-[#E02E2E] hover:text-[#B91C1C] px-4 py-2 rounded-lg hover:bg-[#FEF2F2] transition-colors">삭제</button>
              )}
              <button onClick={() => setMemoModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6] transition-colors">취소</button>
              <button
                onClick={() => {
                  const val = (document.getElementById("memo-textarea") as HTMLTextAreaElement)?.value ?? "";
                  startTransition(() => setWithholdingMemo(memoModal.clientId, yearMonth, val));
                  setMemoModal(null);
                }}
                disabled={isPending}
                className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
              >저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 검증 결과 모달 */}
      {verifyResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVerifyResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#191F28]">원천세 신고 검증 결과</h3>
              <button onClick={() => setVerifyResult(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-[#F9FAFB] rounded-lg p-3 text-center">
                <div className="text-xs text-[#6B7684]">엑셀 신고건수</div>
                <div className="text-lg font-bold text-[#191F28]">{verifyResult.excelCount}</div>
              </div>
              <div className="flex-1 bg-[#F9FAFB] rounded-lg p-3 text-center">
                <div className="text-xs text-[#6B7684]">시스템 대상</div>
                <div className="text-lg font-bold text-[#191F28]">{verifyResult.clientCount}</div>
              </div>
            </div>

            {verifyResult.allMatch ? (
              <div className="bg-[#F1FBF4] border border-[#BBF7D0] rounded-lg p-4 text-center">
                <span className="text-[#15803D] font-medium">모두 일치합니다</span>
              </div>
            ) : (
              <div className="space-y-4">
                {verifyResult.checkedNotInExcel.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-[#DC2626] mb-2">
                      체크했는데 신고 안 됨 ({verifyResult.checkedNotInExcel.length}건)
                    </div>
                    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg divide-y divide-red-100">
                      {verifyResult.checkedNotInExcel.map((c, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between">
                          <span className="text-sm text-[#191F28]">{c.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#8B95A1]">{c.bizNumber}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#DC2626]">{c.type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {verifyResult.notCheckedButInExcel.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-[#D97706] mb-2">
                      체크 안 했는데 신고 됨 ({verifyResult.notCheckedButInExcel.length}건)
                    </div>
                    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg divide-y divide-amber-100">
                      {verifyResult.notCheckedButInExcel.map((c, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between">
                          <span className="text-sm text-[#191F28]">{c.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#8B95A1]">{c.bizNumber}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">{c.type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
