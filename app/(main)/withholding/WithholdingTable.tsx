"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWithholdingTask, markWithholdingDone, setLaborOverride, setWithholdingMemo } from "@/app/actions/withholding";
import { PinIcon } from "@/components/icons";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";
// 프로세스 단계도 withholdingRecords 테이블을 사용

const LABOR_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400", text: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  "사업소득": { border: "border-blue-400", text: "text-[#3182F6]", bg: "bg-[#F5F9FF]" },
  "일용직": { border: "border-green-500", text: "text-[#15803D]", bg: "bg-[#F1FBF4]" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; description: string; short: string }> = {
  A: { label: "A", color: "text-[#B91C1C]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", description: "매월 변동",            short: "매월 변동" },
  B: { label: "B", color: "text-[#1B64DA]", bg: "bg-[#F5F9FF]", border: "border-[#A3CAFD]", description: "매월 동일, 매월납",    short: "동일·매월납" },
  C: { label: "C", color: "text-[#15803D]", bg: "bg-[#F1FBF4]", border: "border-[#BBF7D0]", description: "매월 동일, 6개월납",   short: "동일·6개월납" },
  D: { label: "D", color: "text-[#4E5968]", bg: "bg-[#F9FAFB]", border: "border-[#E5E8EB]", description: "1인사업자 (원천세 없음)", short: "1인사업자" },
};

// 프로세스 단계 (공통)
const ALL_PROCESS_STEPS = ["자료요청", "자료수취", "급여명세서전달", "원천세신고", "납부서전달"];

function getStepsByType(type: string, month: number, halfYearTax: boolean = false): string[] {
  // 6개월납(반기) 원천세 신고·납부월: 6월(상반기), 12월(하반기)
  const isTaxMonth = month === 6 || month === 12;
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
      // 6개월납(반기) — 6·12월 신고 시 납부서가 나오므로 납부서전달 포함
      return isTaxMonth
        ? ["급여명세서전달", "원천세신고", "납부서전달"]
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
  withholdingNote: string | null;
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
    if (month === 6 || month === 12) {
      // 6개월납은 6,12월만 신고
    }
  }

  // 간이지급명세서(근로)는 반기 제출 — 6월(상반기)·12월(하반기)에 원천세와 함께 제출
  if (has근로 && (month === 6 || month === 12)) tasks.push({ key: "간이지급명세서_근로", label: "간이지급명세서(근로)" });
  if (has사업) tasks.push({ key: "간이지급명세서_사업", label: "간이지급명세서(사업)" });
  if (has일용) tasks.push({ key: "근로내용확인신고서", label: "근로내용확인신고서" });
  if (has근로 && month === 2) tasks.push({ key: "지급명세서_근로", label: "지급명세서(근로)" });
  if (has사업 && month === 2) tasks.push({ key: "지급명세서_사업", label: "지급명세서(사업)" });
  if (has일용) tasks.push({ key: "지급명세서_일용", label: "지급명세서(일용)" });

  return tasks;
}

const STATEMENT_LABELS: Record<string, string> = {
  "간이지급명세서_근로": "간이지급명세서(근로)",
  "간이지급명세서_사업": "간이지급명세서(사업)",
  "지급명세서_근로": "지급명세서(근로)",
  "지급명세서_사업": "지급명세서(사업)",
  "지급명세서_일용": "지급명세서(일용)",
};

function getAllExtraColumns() {
  return [
    { key: "간이지급명세서_근로", label: "간이지급명세서\n(근로)" },
    { key: "간이지급명세서_사업", label: "간이지급명세서\n(사업)" },
    { key: "지급명세서_근로", label: "지급명세서\n(근로)" },
    { key: "지급명세서_사업", label: "지급명세서\n(사업)" },
    { key: "지급명세서_일용", label: "지급명세서\n(일용)" },
    { key: "근로내용확인신고서", label: "근로내용\n확인신고서" },
  ];
}

export function WithholdingTable({ clients, yearMonth, showAssignedUser = false, wehagoCompanyId = "", wehagoTaxNum = "" }: { clients: Client[]; yearMonth: string; showAssignedUser?: boolean; wehagoCompanyId?: string; wehagoTaxNum?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedClientTab, setSelectedClientTab] = useState<"withholding" | undefined>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["D"]));
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    hasFiling?: boolean;
    hasReceipt?: boolean;
    excelCount: number;
    clientCount: number;
    verifiedCount?: number;
    checkedNotInExcel: { clientId: number; name: string; bizNumber: string; type: string }[];
    notCheckedButInExcel: { clientId: number; name: string; bizNumber: string; type: string }[];
    specialFilings?: { name: string; bizNumber: string; taxYearMonth: string; filingType: string; clientId: number | null; clientName: string | null; pageYearMonth: string | null; checked: boolean }[];
    statementVerified?: { total: number; byKind: Record<string, number> };
    statementUnmatched?: { name: string; bizNumber: string; kind: string }[];
    allMatch: boolean;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [manualChecked, setManualChecked] = useState<Set<string>>(new Set());
  const [docGenerating, setDocGenerating] = useState<string | null>(null); // "clientId-docType"

  // 드라이브의 위하고 엑셀 → PDF 생성 다운로드 (급여명세서 / 사업소득지급대장)
  async function generateDoc(clientId: number, docType: "ledger" | "payslip") {
    const key = `${clientId}-${docType}`;
    if (docGenerating) return;
    setDocGenerating(key);
    try {
      const res = await fetch("/api/withholding/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, yearMonth, docType }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.message || "PDF 생성에 실패했습니다");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename\*=UTF-8''(.+)/);
      const fileName = m ? decodeURIComponent(m[1]) : "문서.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDocGenerating(null);
    }
  }

  // 검증 결과 모달에서 수기 체크 (해당 월의 원천세신고를 완료 처리)
  function handleManualCheck(clientId: number, ym: string) {
    const key = `${clientId}|${ym}`;
    setManualChecked(prev => new Set(prev).add(key));
    startTransition(() => markWithholdingDone(clientId, ym, "원천세신고"));
  }
  const [payslipLoading, setPayslipLoading] = useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleVerify(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setVerifyLoading(true);
    try {
      const fd = new FormData();
      for (const file of Array.from(files)) fd.append("file", file);
      fd.append("yearMonth", yearMonth);
      const res = await fetch("/api/withholding-verify", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "검증 중 오류가 발생했습니다.");
      } else {
        setManualChecked(new Set());
        setVerifyResult(data);
        router.refresh(); // 자동 검증 체크 반영
      }
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

  // 신고 단계 + 필수 제출서류까지 전부 체크됐는지 (신고없음 처리 포함)
  function isClientFullyDone(c: Client): boolean {
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    if (doneMap.has("신고없음")) return true;
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    const override = c.withholdingLaborOverrides?.[0];
    const baseLaborTypes = c.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
    const laborList = override?.laborTypes
      ? override.laborTypes.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자")
      : baseLaborTypes;
    const extras = getRequiredTasks(laborList, c.halfYearTax, month);
    if (steps.length === 0 && extras.length === 0) return false;
    return steps.every(s => doneMap.has(s)) && extras.every(t => doneMap.has(t.key));
  }
  // 그룹 내 정렬: 덜 체크된 거래처 위, 완료 거래처 아래 (같은 상태끼리는 기존 이름순 유지)
  const sortIncompleteFirst = (arr: Client[]) =>
    [...arr].sort((a, b) => Number(isClientFullyDone(a)) - Number(isClientFullyDone(b)));

  // ABCD 그룹핑
  const groups: { type: string; label: string; config: typeof TYPE_CONFIG["A"] | null; clients: Client[] }[] = [];

  // 미지정
  const unassigned = filtered.filter(c => !c.withholdingType);
  if (unassigned.length > 0) {
    groups.push({ type: "", label: "미지정", config: null, clients: sortIncompleteFirst(unassigned) });
  }

  for (const type of ["A", "B", "C", "D"]) {
    if (groupFilter && groupFilter !== type) continue; // 그룹 필터 적용
    const typeClients = filtered.filter(c => c.withholdingType === type);
    if (typeClients.length > 0) {
      groups.push({ type, label: `${type} — ${TYPE_CONFIG[type].description}`, config: TYPE_CONFIG[type], clients: sortIncompleteFirst(typeClients) });
    }
  }

  // ABCD 그룹별 진행률 계산 — 검색과 무관하게 전체 기준 (검색 시 상단이 흔들리지 않도록)
  type GroupProgress = { type: string; description: string; total: number; done: number; pct: number };
  const groupProgress: GroupProgress[] = ["A", "B", "C", "D"].map(type => {
    const typeClients = clients.filter(c => c.withholdingType === type);
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

  // 전체 진행률 — 검색과 무관하게 전체 기준
  const allClients = clients;
  const totalProcess = allClients.reduce((sum, c) => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    return sum + steps.length;
  }, 0);
  const doneProcess = allClients.reduce((sum, c) => {
    const steps = getStepsByType(c.withholdingType || "", month, c.halfYearTax);
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    return sum + steps.filter(s => doneMap.has(s)).length;
  }, 0);

  // 원천세 신고 진행률 (ABC 그룹만, 신고없음 제외) — 검색과 무관하게 전체 기준
  const abcClients = clients.filter(c => ["A", "B", "C"].includes(c.withholdingType || ""));
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
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple onChange={handleVerify} className="hidden" />
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

      {/* ABCD 그룹별 진행률 카드 (클릭 → 그 그룹만 필터) */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[10.5px] text-[#6B7684]">카드 클릭 → 해당 그룹만 표시</div>
        <button
          onClick={() => setGroupFilter(null)}
          className={`px-3 py-1 text-[10.5px] font-bold rounded-full transition ${
            groupFilter === null
              ? "bg-gradient-to-br from-[#191F28] to-[#333] text-white shadow-md"
              : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          👁 전체
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        {groupProgress.map(g => {
          const cfg = TYPE_CONFIG[g.type];
          const active = groupFilter === g.type;
          if (g.type === "D") {
            return (
              <button
                key={g.type}
                onClick={() => setGroupFilter(active ? null : g.type)}
                className={`glass rounded-2xl p-3 border-l-4 border-[#D1D6DB] text-left transition hover:-translate-y-0.5 ${active ? "opacity-100 ring-2 ring-[#4E5968]/40 shadow-md" : "opacity-70 hover:opacity-100"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-6 h-6 rounded-lg ${cfg.bg} ${cfg.color} font-bold text-[12px] flex items-center justify-center`}>D</span>
                    <span className="text-[12px] font-bold">{cfg.short}</span>
                  </div>
                  <span className="text-[10.5px] text-[#6B7684]">스킵</span>
                </div>
                <div className="text-[20px] font-bold leading-none text-[#6B7684]">{g.total}</div>
                <div className="text-[10.5px] text-[#6B7684] mt-1.5">원천세 없음</div>
              </button>
            );
          }
          const stepCount = g.type === "A" ? "5단계" : g.type === "B" ? "3단계" : "1~2단계";
          const borderColor = g.type === "A" ? "border-[#DC2626]" : g.type === "B" ? "border-[#3182F6]" : "border-[#15803D]";
          const ringColor = g.type === "A" ? "ring-[#DC2626]/40" : g.type === "B" ? "ring-[#3182F6]/40" : "ring-[#15803D]/40";
          const fillColor = g.type === "A" ? "#B91C1C" : g.type === "B" ? "linear-gradient(135deg,#6FA8FF,#3182F6)" : "linear-gradient(135deg,#6EE7B7,#10B981)";
          return (
            <button
              key={g.type}
              onClick={() => setGroupFilter(active ? null : g.type)}
              className={`glass rounded-2xl p-3 border-l-4 ${borderColor} text-left transition hover:-translate-y-0.5 ${active ? `ring-2 ${ringColor} shadow-md -translate-y-0.5` : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-6 h-6 rounded-lg ${cfg.bg} ${cfg.color} font-bold text-[12px] flex items-center justify-center`}>{g.type}</span>
                  <span className="text-[12px] font-bold">{cfg.short}</span>
                </div>
                <span className="text-[10.5px] text-[#6B7684]">{stepCount}</span>
              </div>
              <div className="text-[20px] font-bold leading-none">{g.done}<span className="text-[12px] text-[#6B7684]"> / {g.total}</span></div>
              <div className="progress mt-1.5" style={{ height: "4px" }}>
                <div className="progress-fill" style={{ width: `${g.pct}%`, background: fillColor }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* 통합 테이블 */}
      <div className="glass rounded-2xl">
        <table className="w-full text-[12.5px]">
          <thead className="bg-white/60 backdrop-blur sticky top-0 z-10">
            <tr className="border-b border-white/40">
              <th className="px-2 py-2.5 w-9"></th>
              <th className="text-left px-4 py-2.5 text-[10.5px] font-bold text-[#333D4B] uppercase tracking-wider whitespace-nowrap">고객사명</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">특이사항·메모</th>
              {showAssignedUser && <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">담당</th>}
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">신고없음</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#15803D] uppercase tracking-wider whitespace-nowrap">검증</th>
              <th className="text-center px-3 py-2.5 text-[10.5px] font-bold text-[#333D4B] uppercase tracking-wider whitespace-nowrap">인건비</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">6개월납</th>
              {ALL_PROCESS_STEPS.map(step => (
                <th key={step} className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="text-[10.5px] font-bold text-[#4E5968] uppercase tracking-wider">{step}</span>
                </th>
              ))}
              {extraColumns.length > 0 && <th className="w-[1px] px-0 bg-white/40"></th>}
              {extraColumns.map(col => (
                <th key={col.key} className="text-center px-2 py-2.5">
                  <span className="text-[10px] font-medium text-[#8B95A1] uppercase tracking-wide leading-tight block whitespace-pre-line">{col.label}</span>
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
              const totalCols = 8 + (showAssignedUser ? 1 : 0) + ALL_PROCESS_STEPS.length + (extraColumns.length > 0 ? 1 : 0) + extraColumns.length;
              return (
                <React.Fragment key={group.type || "unassigned"}>
                  {/* 그룹 헤더 행 */}
                  <tr
                    className={`${cfg ? cfg.bg + "/60" : "bg-[#F2F4F6]/60"} cursor-pointer select-none transition-colors hover:brightness-95`}
                    onClick={() => setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      const key = group.type || "unassigned";
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })}
                  >
                    <td colSpan={totalCols} className="px-4 py-2 border-t border-b border-white/50">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#8B95A1] w-3 transition-transform">{collapsedGroups.has(group.type || "unassigned") ? "▶" : "▼"}</span>
                        {cfg && (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold ${cfg.bg} ${cfg.color} shadow-sm`}>
                            {group.type}
                          </span>
                        )}
                        <span className={`text-[12px] font-bold ${cfg ? cfg.color : "text-[#6B7684]"}`}>{group.label}</span>
                        <span className="text-[10.5px] text-[#8B95A1] bg-white/70 rounded-full px-2 py-0.5 font-medium">{group.clients.length}건</span>
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
                    // 검증칸: 신고없음이거나, 반기납인데 신고 검증 월(6·12월)이 아니면 비활성화
                    const verifyDisabled = isSkipped || (client.halfYearTax && month !== 6 && month !== 12);

                    return (
                      <tr key={client.id} className={`border-b border-white/40 transition-colors ${checkedIds.has(client.id) ? "bg-[#E8F3FF]/70" : allStepsDone ? "bg-[#F1FBF4]/50" : "hover:bg-[#E8F3FF]/70"}`}>
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
                            <button
                              onClick={() => { setSelectedClientTab(undefined); setSelectedClientId(client.id); }}
                              className="hover:text-[#3182F6] hover:underline cursor-pointer text-left truncate"
                              title="거래처 정보 수정"
                            >
                              {client.name}
                            </button>
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
                                      onClick={() => { window.open(`${baseUrl}/SWSA0101?${params}`, "_blank"); window.open(`${baseUrl}/SWTA0101?${params}`, "_blank"); }}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap shrink-0"
                                      title="위하고 급여자료입력 + 원천징수이행상황신고서"
                                    >
                                      급여
                                    </button>
                                  )}
                                  {laborList.includes("사업소득") && (
                                    <button
                                      onClick={() => { window.open(`${baseUrl}/SWBU0102?${params}`, "_blank"); window.open(`${baseUrl}/SWTA0101?${params}`, "_blank"); }}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] hover:bg-[#FEF3C7] border border-[#FDE68A] whitespace-nowrap shrink-0"
                                      title="위하고 사업소득자료입력 + 원천징수이행상황신고서"
                                    >
                                      사업
                                    </button>
                                  )}
                                  {laborList.includes("일용직") && (
                                    <button
                                      onClick={() => { window.open(`${baseUrl}/TWSA0107?${params}`, "_blank"); window.open(`${baseUrl}/SWTA0101?${params}`, "_blank"); }}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200 whitespace-nowrap shrink-0"
                                      title="위하고 일용직급여자료입력 + 원천징수이행상황신고서"
                                    >
                                      일용
                                    </button>
                                  )}
                                  {/* 위하고 바로가기(급여/사업/일용) ↔ 작업 버튼(위멤버스/명세서/대장) 구분선 */}
                                  {(laborList.includes("근로소득") || laborList.includes("사업소득") || laborList.includes("일용직")) && (
                                    <span className="mx-1 w-px h-3 bg-[#D1D6DB] shrink-0" />
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
                                  {laborList.includes("근로소득") && (
                                    <button
                                      onClick={() => generateDoc(client.id, "payslip")}
                                      disabled={docGenerating !== null}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 whitespace-nowrap shrink-0 disabled:opacity-40"
                                      title="급여명세서 PDF 생성 (위멤버스로 받은 엑셀 기반)"
                                    >
                                      {docGenerating === `${client.id}-payslip` ? "생성중..." : "명세서"}
                                    </button>
                                  )}
                                  {laborList.includes("사업소득") && (
                                    <button
                                      onClick={() => generateDoc(client.id, "ledger")}
                                      disabled={docGenerating !== null}
                                      className="ml-0.5 text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 whitespace-nowrap shrink-0 disabled:opacity-40"
                                      title="사업소득지급대장 PDF 생성 (위멤버스로 받은 엑셀 기반)"
                                    >
                                      {docGenerating === `${client.id}-ledger` ? "생성중..." : "대장"}
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* 고정 특이사항 — hover로 노출, 클릭 시 거래처수정모달 원천세 탭 */}
                            {client.withholdingNote && (
                              <span
                                className="relative group cursor-pointer"
                                onClick={() => { setSelectedClientTab("withholding"); setSelectedClientId(client.id); }}
                                title=""
                              >
                                <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[9px] font-bold leading-none">!</span>
                                <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#191F28] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl text-left">
                                  <div className="text-[10px] text-[#FCA5A5] font-bold mb-1">특이사항 (고정)</div>
                                  {client.withholdingNote}
                                </div>
                              </span>
                            )}
                            {/* 이번달 메모 */}
                            {monthMemo ? (
                              <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: monthMemo })}>
                                <PinIcon width={12} height={12} className="text-[#F59E0B]" />
                                <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#3182F6] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl text-left">
                                  <div className="text-[10px] text-[#BFDBFE] font-bold mb-1">이번달 메모</div>
                                  {monthMemo}
                                </div>
                              </span>
                            ) : (
                              <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-[#D1D6DB] hover:text-[#F59E0B] text-xs">+</button>
                            )}
                          </div>
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
                        {/* 검증 (홈택스 신고내역 크로스체크 확인 표시) */}
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!verifyDisabled && doneMap.has("검증")}
                            onChange={() => handleToggle(client.id, "검증")}
                            disabled={isPending || verifyDisabled}
                            className={`accent-[#15803D] w-3.5 h-3.5 ${verifyDisabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}`}
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
                        {extraColumns.map(col => {
                          const cellVerified = doneMap.has(`${col.key}_검증`);
                          return (
                            <td key={col.key} className="px-1 py-2 text-center">
                              {isSkipped || client.withholdingType === "D" ? (
                                <span className="text-[#D1D6DB] text-[10px]">-</span>
                              ) : requiredExtraKeys.has(col.key) ? (
                                <input
                                  type="checkbox"
                                  checked={doneMap.has(col.key)}
                                  onChange={() => handleToggle(client.id, col.key)}
                                  disabled={isPending}
                                  title={cellVerified ? "홈택스 제출 확인됨" : undefined}
                                  className={`w-3.5 h-3.5 cursor-pointer ${cellVerified ? "accent-[#15803D] ring-2 ring-[#34D399] ring-offset-1 rounded-[3px]" : "accent-[#3182F6]"}`}
                                />
                              ) : cellVerified ? (
                                <span title="홈택스 제출 확인됨 (인건비 설정에 해당 소득 없음)" className="text-[#15803D] text-[11px] font-bold">✓</span>
                              ) : (
                                <span className="text-[#D1D6DB] text-[10px]">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 이번달 메모 모달 */}
      {memoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMemoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">이번달 메모</h3>
                <p className="text-xs text-[#8B95A1] mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="이번달에만 적용되는 메모를 입력하세요..."
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
      {selectedClientId && (
        <ClientEditModal
          clientId={selectedClientId}
          initialTab={selectedClientTab}
          onClose={() => { setSelectedClientId(null); setSelectedClientTab(undefined); router.refresh(); }}
        />
      )}

      {verifyResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVerifyResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#191F28]">원천세 신고 검증 결과</h3>
              <button onClick={() => setVerifyResult(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>

            {verifyResult.hasFiling !== false && (
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-[#F9FAFB] rounded-lg p-3 text-center">
                <div className="text-xs text-[#6B7684]">엑셀 신고건수</div>
                <div className="text-lg font-bold text-[#191F28]">{verifyResult.excelCount}</div>
              </div>
              <div className="flex-1 bg-[#F9FAFB] rounded-lg p-3 text-center">
                <div className="text-xs text-[#6B7684]">시스템 대상</div>
                <div className="text-lg font-bold text-[#191F28]">{verifyResult.clientCount}</div>
              </div>
              <div className="flex-1 bg-[#F1FBF4] rounded-lg p-3 text-center">
                <div className="text-xs text-[#15803D]">검증 체크</div>
                <div className="text-lg font-bold text-[#15803D]">{verifyResult.verifiedCount ?? 0}</div>
              </div>
            </div>
            )}

            {verifyResult.hasFiling === false ? null : verifyResult.allMatch ? (
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
                      {verifyResult.notCheckedButInExcel.map((c, i) => {
                        const isDone = manualChecked.has(`${c.clientId}|${yearMonth}`);
                        return (
                          <div key={i} className="px-3 py-2 flex items-center justify-between">
                            <span className="text-sm text-[#191F28]">{c.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#8B95A1]">{c.bizNumber}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">{c.type}</span>
                              <button
                                onClick={() => handleManualCheck(c.clientId, yearMonth)}
                                disabled={isDone}
                                className={`text-xs px-2 py-1 rounded-md transition-colors ${isDone ? "bg-[#F1FBF4] text-[#15803D] cursor-default" : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"}`}
                              >{isDone ? "체크됨 ✓" : "체크"}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(verifyResult.specialFilings?.length ?? 0) > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-[#6B21A8] mb-2">
                  수정신고·기한후신고 안내 ({verifyResult.specialFilings!.length}건) — 크로스체크에서 제외됨
                </div>
                <div className="bg-[#FAF5FF] border border-[#E9D5FF] rounded-lg divide-y divide-purple-100">
                  {verifyResult.specialFilings!.map((s, i) => {
                    const isDone = s.checked || (s.clientId && s.pageYearMonth ? manualChecked.has(`${s.clientId}|${s.pageYearMonth}`) : false);
                    return (
                      <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm text-[#191F28] truncate">{s.clientName || s.name}</div>
                          <div className="text-xs text-[#8B95A1]">{s.bizNumber} · 과세연월 {s.taxYearMonth}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F3E8FF] text-[#6B21A8]">{s.filingType}</span>
                          {s.clientId && s.pageYearMonth ? (
                            <button
                              onClick={() => handleManualCheck(s.clientId!, s.pageYearMonth!)}
                              disabled={!!isDone}
                              className={`text-xs px-2 py-1 rounded-md transition-colors ${isDone ? "bg-[#F1FBF4] text-[#15803D] cursor-default" : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"}`}
                            >{isDone ? "체크됨 ✓" : `${s.pageYearMonth}에 체크`}</button>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F9FAFB] text-[#8B95A1]">미등록 거래처</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {verifyResult.hasReceipt && (
              <div className="mt-4">
                <div className="text-sm font-medium text-[#15803D] mb-2">
                  간이·지급명세서 검증 표시 ({verifyResult.statementVerified?.total ?? 0}건)
                </div>
                <div className="bg-[#F1FBF4] border border-[#BBF7D0] rounded-lg p-3 space-y-1">
                  {Object.entries(verifyResult.statementVerified?.byKind ?? {}).map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-[#191F28]">{STATEMENT_LABELS[key] ?? key}</span>
                      <span className="font-bold text-[#15803D]">{count}건</span>
                    </div>
                  ))}
                  {(verifyResult.statementVerified?.total ?? 0) === 0 && (
                    <div className="text-sm text-[#8B95A1]">매칭된 제출 건이 없습니다</div>
                  )}
                  <div className="text-xs text-[#6B7684] pt-1">확인된 칸은 표에서 초록 테두리로 강조됩니다</div>
                </div>
                {(verifyResult.statementUnmatched?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-[#8B95A1] mb-1">미등록 거래처 ({verifyResult.statementUnmatched!.length}건)</div>
                    <div className="bg-[#F9FAFB] border border-[#E5E8EB] rounded-lg divide-y divide-gray-100">
                      {verifyResult.statementUnmatched!.map((u, i) => (
                        <div key={i} className="px-3 py-1.5 flex items-center justify-between text-xs">
                          <span className="text-[#4E5968]">{u.name}</span>
                          <span className="text-[#8B95A1]">{u.bizNumber} · {u.kind}</span>
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
