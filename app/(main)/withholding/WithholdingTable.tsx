"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition, useRef, useEffect } from "react";
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
  skipDailyWorkReport: boolean;
  driveFolderId: string | null;
  wehagoCno: string | null;
  wehagoCdCom: string | null;
  wehagoColors: string | null; // JSON: {"2025":"#92B81E","2026":"#D0BA00"}
  assignedUser?: { name: string } | null;
  withholdingRecords: WHRecord[];
  withholdingLaborOverrides: { laborTypes: string | null; memo: string | null }[];
  // 위하고 마감상태·제출 결과 (원천세 자동신고) — kind: income(원천세) | local(지방소득세)
  withholdingFilings?: WHFiling[];
};
type WHFiling = {
  kind: string; closed: boolean; amount: number | null; reportType: string | null; attribYm: string | null;
  status: string; receiptNo: string | null; fileName?: string | null; checkedAt: string | Date;
};

function getRequiredTasks(laborTypes: string[], halfYearTax: boolean, month: number, skipDailyWorkReport: boolean = false) {
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
  // 근로내용확인신고서 미제출 거래처(거래처수정모달 원천세 탭에서 설정)는 체크칸을 만들지 않음
  if (has일용 && !skipDailyWorkReport) tasks.push({ key: "근로내용확인신고서", label: "근로내용확인신고서" });
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

  // 위멤버스 자동화 진행상황 모달
  type WmStep = { key: string; label: string; status: "wait" | "run" | "done" | "error" | "skip" };
  const wmSkipRef = useRef(false); // [이 단계 건너뛰기] 버튼

  // 담당자 헤더 필터
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [userFilterOpen, setUserFilterOpen] = useState(false);
  const userFilterRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (userFilterRef.current && !userFilterRef.current.contains(e.target as Node)) {
        setUserFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const userOptions = [...new Set(clients.map(c => c.assignedUser?.name).filter(Boolean))] as string[];
  const [wmProgress, setWmProgress] = useState<{
    clientName: string;
    steps: WmStep[];
    message: string;
    finished: boolean;
    error: boolean;
    batch?: { current: number; total: number };
  } | null>(null);

  function wmSetStep(key: string, status: WmStep["status"], message?: string) {
    setWmProgress(prev =>
      prev
        ? {
            ...prev,
            steps: prev.steps.map(s => (s.key === key ? { ...s, status } : s)),
            ...(message !== undefined ? { message } : {}),
          }
        : prev
    );
  }

  const WEHAGO_BASE = "https://smarta.wehago.com/#/smarta/humanresource";

  function buildWehagoParams(cl: Client) {
    const wehagoColor = (() => { try { const c = JSON.parse(cl.wehagoColors || "{}"); return c[String(year)] || "#D0BA00"; } catch { return "#D0BA00"; } })();
    return `sao&cno=${cl.wehagoCno}&cd_com=${cl.wehagoCdCom}&gisu=${month}&yminsa=${year}&searchData=${year}0101${year}1231&color=${wehagoColor}&companyName=${encodeURIComponent(cl.name)}&companyID=${wehagoCompanyId}&taxNum=${wehagoTaxNum}&yn_private=1&wehagoT`;
  }

  // 거래처 1곳 풀 파이프라인 (다운로드 → 위멤버스 업로드 → 명세서/대장 생성·드라이브 저장)
  async function wmRunOne(
    clientId: number,
    clientName: string,
    laborList: string[],
    params: string,
    batch?: { current: number; total: number }
  ): Promise<{ ok: boolean; msg: string }> {
    const incomeTypes: string[] = [];
    if (laborList.includes("근로소득")) incomeTypes.push("salary");
    if (laborList.includes("사업소득")) incomeTypes.push("business");
    if (laborList.includes("일용직")) incomeTypes.push("daily");
    if (incomeTypes.length === 0) return { ok: false, msg: "인건비 유형 없음" };
    const monthPadded = String(month).padStart(2, "0");

    const TYPE_LABEL: Record<string, string> = { salary: "근로소득 급여자료", business: "사업소득 자료", daily: "일용직 급여자료" };
    const DOWN_URL: Record<string, string> = {
      salary: `${WEHAGO_BASE}/SWSA0101?${params}&autoPayslip=${month}`,
      business: `${WEHAGO_BASE}/SWBU0103?${params}&autoBusinessIncome=${month}`,
      daily: `${WEHAGO_BASE}/TWSA0107?${params}&autoDailyWorker=${month}`,
    };

    // 파이프라인 마지막: 문서 생성 (드라이브 저장만, 브라우저 다운로드 없음)
    const docSteps: { key: string; docType: "payslip" | "ledger"; label: string }[] = [];
    if (laborList.includes("근로소득")) docSteps.push({ key: "doc-payslip", docType: "payslip", label: "급여명세서 생성·드라이브 저장" });
    if (laborList.includes("사업소득")) docSteps.push({ key: "doc-ledger", docType: "ledger", label: "사업소득지급대장 생성·드라이브 저장" });

    const steps: WmStep[] = [
      ...incomeTypes.map(t => ({ key: t, label: `${TYPE_LABEL[t]} 다운로드`, status: "wait" as const })),
      { key: "upload", label: "위멤버스 업로드", status: "wait" as const },
      ...docSteps.map(d => ({ key: d.key, label: d.label, status: "wait" as const })),
    ];
    setWmProgress(prev => ({ clientName, steps, message: "시작하는 중...", finished: false, error: false, batch }));

    async function waitForFile(type: string): Promise<boolean | "usercancel"> {
      for (let i = 0; i < 90; i++) {
        if (wmSkipRef.current) return "usercancel";
        const res = await fetch("/api/automation/check-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientName, year: String(year), month: monthPadded, type }),
        });
        const data = await res.json();
        if (data.exists) return true;
        wmSetStep(type, "run", `위하고에서 자료를 내려받는 중... (${(i + 1) * 2}초 — 자료 없는 달이면 건너뛰기를 누르세요)`);
        await new Promise(r => setTimeout(r, 2000));
      }
      return false;
    }

    // 자료가 없는 소득유형은 건너뛰고 나머지로 계속 진행 (예: 근로소득 없는 달 → 사업소득만)
    const collected: string[] = [];
    for (const type of incomeTypes) {
      wmSkipRef.current = false;
      wmSetStep(type, "run", `${TYPE_LABEL[type]}를 위하고에서 내려받는 중...`);
      const tab = window.open(DOWN_URL[type], "_blank");
      const found = await waitForFile(type);
      if (tab) tab.close();
      if (found === true) {
        wmSetStep(type, "done");
        collected.push(type);
      } else {
        wmSetStep(type, "skip", found === "usercancel"
          ? `${TYPE_LABEL[type]} 건너뜀 (사용자 선택)`
          : `${TYPE_LABEL[type]} 건너뜀 (시간 초과 — 자료 없는 달로 처리)`);
      }
    }
    wmSkipRef.current = false;
    if (collected.length === 0) {
      return { ok: false, msg: "내려받은 자료가 없습니다 (위하고 로그인 상태 확인)" };
    }
    // 건너뛴 유형의 문서 생성 단계도 스킵 표시
    for (const d of [...docSteps]) {
      const need = d.docType === "payslip" ? "salary" : "business";
      if (!collected.includes(need)) {
        wmSetStep(d.key, "skip", undefined);
        docSteps.splice(docSteps.indexOf(d), 1);
      }
    }

    wmSetStep("upload", "run", "서버가 위멤버스에 자동 업로드하는 중... (1~2분 소요)");
    try {
      const res = await fetch("/api/automation/wemembers-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, year: String(year), month: monthPadded, incomeTypes: collected }),
      });
      const result = await res.json();
      if (!result.success) {
        wmSetStep("upload", "error");
        return { ok: false, msg: result.message || "업로드 실패" };
      }
      wmSetStep("upload", "done");
    } catch (err) {
      wmSetStep("upload", "error");
      return { ok: false, msg: "업로드 실패: " + String(err) };
    }

    // 문서 생성 (실패해도 파이프라인 전체는 성공으로 처리, 경고만 남김)
    const docWarns: string[] = [];
    for (const d of docSteps) {
      wmSetStep(d.key, "run", `${d.label} 중...`);
      try {
        const res = await fetch("/api/withholding/generate-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, yearMonth, docType: d.docType }),
        });
        if (res.ok) {
          const saved = res.headers.get("X-Drive-Saved");
          if (saved === "0") docWarns.push(`${d.label}: 드라이브 폴더 미연결로 저장 생략`);
          wmSetStep(d.key, "done");
        } else {
          const data = await res.json().catch(() => null);
          docWarns.push(`${d.label} 실패: ${data?.message || res.status}`);
          wmSetStep(d.key, "error");
        }
      } catch (err) {
        docWarns.push(`${d.label} 실패: ${String(err)}`);
        wmSetStep(d.key, "error");
      }
    }

    return { ok: true, msg: docWarns.length > 0 ? `완료 (경고: ${docWarns.join(" / ")})` : "완료" };
  }

  // 위하고 연동 수집 (신규 거래처의 급여/사업/일용 버튼 생성)
  const [collectJob, setCollectJob] = useState<{
    total: number; current: number; currentName: string;
    results: { name: string; status: string; msg?: string }[];
    done: boolean; fatal?: string | null;
  } | null>(null);
  const collectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startCollect(clientId?: number, clientName?: string) {
    const msg = clientId
      ? `'${clientName}' 위하고 연동정보를 수집합니다. (약 30초)\n\n시작할까요?`
      : `위하고 연동정보가 없는 ABC그룹 거래처를 일괄 수집합니다.\n(위하고에 로그인해서 자동 조회 — 몇 분 걸릴 수 있어요)\n\n시작할까요?`;
    if (!confirm(msg)) return;
    const res = await fetch("/api/wehago/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientId ? { clientId } : {}),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.message || "수집 시작 실패"); return; }
    setCollectJob({ total: data.total, current: 0, currentName: "시작 중...", results: [], done: false });
    collectPollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/wehago/collect");
        if (!r.ok) return;
        const j = await r.json();
        setCollectJob(j);
        if (j.done) {
          if (collectPollRef.current) clearInterval(collectPollRef.current);
          collectPollRef.current = null;
          router.refresh();
        }
      } catch {}
    }, 2500);
  }

  function closeCollectModal() {
    if (collectPollRef.current) { clearInterval(collectPollRef.current); collectPollRef.current = null; }
    setCollectJob(null);
    router.refresh();
  }

  // ===== 원천세 자동신고: 위하고 마감상태 조회 =====
  // 위하고 전자신고 화면(원천세 SWER0101 / 지방소득세 SWER0109)을 새 탭으로 열면 크롬 확장이
  // 지급기간을 이번 달로 맞춰 전체 수임처를 조회하고 결과를 서버에 반영한 뒤 탭을 닫는다.
  // 여기서는 두 종류의 조회 시각이 모두 갱신될 때까지 폴링하다가 새로고침.
  type CloseProgress = { state: string; done: number; total: number; closed: number; message: string } | null;
  // 상단 고정 헤더 높이 (표 머리글의 sticky top 계산용)
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeaderH, setStickyHeaderH] = useState(0);
  React.useEffect(() => {
    const el = stickyHeaderRef.current;
    if (!el) return;
    const update = () => setStickyHeaderH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [closeCheck, setCloseCheck] = useState<{ startedAt: number; income: boolean; local: boolean; error?: string; progress?: Record<string, CloseProgress> } | null>(null);
  const closeCheckPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filingOf = (c: Client, kind: "income" | "local") => c.withholdingFilings?.find(f => f.kind === kind) || null;
  const filingStats = (() => {
    const linked = clients.filter(c => c.wehagoCno && ["A", "B", "C"].includes(c.withholdingType || ""));
    const income = linked.filter(c => filingOf(c, "income")?.closed).length;
    const local = linked.filter(c => filingOf(c, "local")?.closed).length;
    const incomeOnly = linked.filter(c => filingOf(c, "income")?.closed && !filingOf(c, "local")?.closed).length;
    let latest: Date | null = null;
    for (const c of clients) for (const f of c.withholdingFilings || []) { const d = new Date(f.checkedAt); if (!latest || d > latest) latest = d; }
    return { linkedCount: linked.length, income, local, incomeOnly, latest };
  })();
  // 확장 프로그램 다리: content-savetax-app.js 가 window.postMessage 로 응답 (없으면 null)
  function extCall<T = { ok: boolean; error?: string }>(type: string, payload?: Record<string, unknown>, timeoutMs = 4000): Promise<T | null> {
    return new Promise((resolve) => {
      if (typeof window === "undefined") { resolve(null); return; }
      const id = `app${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const onMsg = (ev: MessageEvent) => {
        const d = ev.data;
        if (!d || d.source !== "savetax-ext" || d.id !== id) return;
        window.removeEventListener("message", onMsg); clearTimeout(t);
        resolve(d as T);
      };
      const t = setTimeout(() => { window.removeEventListener("message", onMsg); resolve(null); }, timeoutMs);
      window.addEventListener("message", onMsg);
      window.postMessage({ source: "savetax-app", id, type, payload: payload || {} }, "*");
    });
  }
  function efileUrls(extra: string): string[] | null {
    const template = clients.find(c => c.wehagoCno && c.wehagoCdCom);
    if (!template || !wehagoCompanyId) return null;
    const params = buildWehagoParams(template) + extra;
    const base = "https://smarta.wehago.com/#/smarta/humanresource";
    return [`${base}/SWER0101?${params}`, `${base}/SWER0109?${params}`];
  }
  // 위하고 창 열기: 확장이 있으면 최소화된 별도 창(화면에 안 뜸), 없으면 새 탭
  async function openEfileWindows(urls: string[]): Promise<{ ok: boolean; hidden: boolean; error?: string }> {
    const res = await extCall("open-hidden", { urls });
    if (res?.ok) return { ok: true, hidden: true };
    const w1 = window.open(urls[0], "_blank");
    if (!w1) return { ok: false, hidden: false, error: "팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요." };
    urls.slice(1).forEach((u, i) => setTimeout(() => window.open(u, "_blank"), 1500 * (i + 1)));
    return { ok: true, hidden: false };
  }
  async function startCloseCheck(silent = false) {
    if (closeCheck && !closeCheck.error && !(closeCheck.income && closeCheck.local)) return;
    const urls = efileUrls(`&stCloseCheck=${year}${String(month).padStart(2, "0")}`);
    if (!urls) { if (!silent) alert("위하고 연동된 거래처가 없거나 설정에 위하고 아이디가 없습니다"); return; }
    const startedAt = Date.now();
    setCloseCheck({ startedAt, income: false, local: false });
    const opened = await openEfileWindows(urls);
    if (!opened.ok) { setCloseCheck({ startedAt, income: false, local: false, error: opened.error }); return; }
    if (closeCheckPollRef.current) clearInterval(closeCheckPollRef.current);
    closeCheckPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/withholding/filing/close-check?ym=${yearMonth}`);
        if (!r.ok) return;
        const j = await r.json();
        const income = !!j.income?.checkedAt && new Date(j.income.checkedAt).getTime() > startedAt - 5000;
        const local = !!j.local?.checkedAt && new Date(j.local.checkedAt).getTime() > startedAt - 5000;
        setCloseCheck(prev => prev ? { ...prev, income, local, progress: { income: j.income?.progress ?? null, local: j.local?.progress ?? null } } : prev);
        if (income && local) {
          if (closeCheckPollRef.current) clearInterval(closeCheckPollRef.current);
          closeCheckPollRef.current = null;
          router.refresh();
          setTimeout(() => setCloseCheck(null), 4000);
        } else if (Date.now() - startedAt > 4 * 60 * 1000) {
          if (closeCheckPollRef.current) clearInterval(closeCheckPollRef.current);
          closeCheckPollRef.current = null;
          setCloseCheck(prev => prev ? { ...prev, error: opened.hidden ? "4분 안에 끝나지 않았습니다. 위하고 로그인 상태를 확인하고 다시 눌러주세요." : "4분 안에 끝나지 않았습니다. 위하고 탭의 안내문을 확인하세요." } : prev);
          router.refresh();
        }
      } catch {}
    }, 2000);
  }
  // 자동 조회: 확장이 설치돼 있고, 최근 2개월 페이지이며, 마지막 조회가 30분 넘었으면 조용히 갱신
  React.useEffect(() => {
    const now = new Date();
    const monthsAgo = (now.getFullYear() - Number(year)) * 12 + (now.getMonth() + 1 - month);
    if (monthsAgo < 0 || monthsAgo > 2) return;
    if (filingStats.latest && Date.now() - filingStats.latest.getTime() < 30 * 60 * 1000) return;
    const guardKey = `savetax-closecheck-${yearMonth}`;
    const last = Number(sessionStorage.getItem(guardKey) || 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    const t = setTimeout(async () => {
      const ping = await extCall("ping", {}, 1500);
      if (!ping?.ok) return; // 확장 없으면 자동 실행 안 함
      sessionStorage.setItem(guardKey, String(Date.now()));
      startCloseCheck(true);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth]);

  // ===== 원천세 자동신고 2단계: 체크한 거래처 전자신고 파일 제작 (위하고) =====
  type EfileJobView = {
    jobId: string; kinds: string[]; targets: { clientId: number; name: string; cno: string }[];
    progress: Record<string, { state: string; message?: string; fileId?: number; fileName?: string; produced?: string[]; skipped?: string[] }>;
    done: boolean; skippedAtStart?: { name: string; reason: string }[]; error?: string;
  };
  const [efileJob, setEfileJob] = useState<EfileJobView | null>(null);
  const efilePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 이어서 진행: 파일 제작이 끝나면 홈택스·위택스 업로드·검증까지 자동으로 이어 간다 (제출은 검증 결과를 보고 [제출]을 눌러야 함). 선택은 브라우저에 기억
  const [chainVerify, setChainVerify] = useState(false);
  useEffect(() => { try { setChainVerify(localStorage.getItem("savetax-efile-chain") === "1"); } catch {} }, []);
  function toggleChainVerify(on: boolean) {
    setChainVerify(on);
    try { localStorage.setItem("savetax-efile-chain", on ? "1" : "0"); } catch {}
  }
  async function startProduce() {
    if (efileJob && !efileJob.done && !efileJob.error) return;
    const ids = [...checkedIds];
    if (ids.length === 0) return;
    const chain = chainVerify; // 이번 실행에서 검증까지 이어갈지 (시작 시점의 선택으로 고정)
    if (chain && !(await ensureExtConnected())) return;
    if (!confirm(chain
      ? `체크한 ${ids.length}개 거래처의 전자신고 파일(원천세·지방소득세)을 위하고에서 제작하고, 이어서 홈택스·위택스에 올려 검증까지 진행합니다.\n마감된 거래처만 포함됩니다. 제출은 검증 결과를 확인하고 [제출]을 눌러야 됩니다.\n\n시작할까요?`
      : `체크한 ${ids.length}개 거래처의 전자신고 파일(원천세·지방소득세)을 위하고에서 제작합니다.\n마감된 거래처만 포함되며, 홈택스·위택스 제출은 아직 하지 않습니다.\n\n시작할까요?`)) return;
    const res = await fetch("/api/withholding/filing/job", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth, clientIds: ids }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const skippedMsg = data?.skipped?.length ? `\n\n${data.skipped.map((s: { name: string; reason: string }) => `· ${s.name}: ${s.reason}`).join("\n")}` : "";
      alert((data?.error || "작업 생성 실패") + skippedMsg);
      return;
    }
    const urls = efileUrls(`&stProduce=${data.jobId}`);
    if (!urls) { alert("위하고 연동된 거래처가 없거나 설정에 위하고 아이디가 없습니다"); return; }
    setEfileJob({ jobId: data.jobId, kinds: data.kinds, targets: data.targets, progress: {}, done: false, skippedAtStart: data.skipped });
    // 위하고 파일 제작 시 뜨는 '폴더 선택' 창(네이티브)을 로컬 도우미(savetax-app 프로토콜, scripts/launcher)가 대신 확인하고
    // 파일을 C:\savetax-efile\ 로 복사하도록 먼저 실행해 둔다 (도우미 미설치 PC는 창이 그대로 떠서 사람이 확인해야 함)
    try { window.location.href = `savetax-app://efile-dialog?count=${data.kinds.length}&timeout=240`; } catch {}
    await new Promise(r => setTimeout(r, 800));
    const opened = await openEfileWindows(urls);
    if (!opened.ok) { setEfileJob(prev => prev ? { ...prev, error: opened.error } : prev); return; }
    const startedAt = Date.now();
    if (efilePollRef.current) clearInterval(efilePollRef.current);
    efilePollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/withholding/filing/job?id=${data.jobId}`);
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          // 작업 정보를 못 받는 상태(서버 재시작으로 작업이 사라짐 등)가 이어지면 '진행 중'에 멈춰 있지 않고 알려 준다
          const gone = r.status === 404;
          if (gone || Date.now() - startedAt > 6 * 60 * 1000) {
            if (efilePollRef.current) clearInterval(efilePollRef.current);
            efilePollRef.current = null;
            setEfileJob(prev => prev ? { ...prev, error: gone
              ? "서버가 재시작되어 진행 상황을 더 받을 수 없습니다. 제작된 파일은 C:\\savetax-efile 폴더에 있습니다 — 잠시 후 다시 제작해 주세요."
              : "6분 안에 끝나지 않았습니다. 위하고 로그인 상태를 확인해주세요." } : prev);
            router.refresh();
          }
          return;
        }
        setEfileJob(prev => prev ? { ...prev, progress: j.progress, done: j.done } : prev);
        if (j.done || Date.now() - startedAt > 6 * 60 * 1000) {
          if (efilePollRef.current) clearInterval(efilePollRef.current);
          efilePollRef.current = null;
          if (!j.done) setEfileJob(prev => prev ? { ...prev, error: "6분 안에 끝나지 않았습니다. 위하고 로그인 상태를 확인해주세요." } : prev);
          router.refresh();
          if (j.done && chain) {
            // 이어서 진행: 원천세·지방소득세가 모두 제작 완료일 때만 검증 단계로 (하나라도 실패했으면 멈추고 제작 창을 그대로 둔다)
            const prog = j.progress as Record<string, { state: string; fileId?: number }>;
            const kindsAll = data.kinds as string[];
            const kindsDone = kindsAll.filter(k => prog[k]?.state === "done" && prog[k]?.fileId);
            if (kindsDone.length === kindsAll.length) {
              const fileIds: Record<string, number> = {};
              for (const k of kindsDone) fileIds[k] = prog[k].fileId as number;
              setEfileJob(null);
              startSubmit({ fileIds });
            } else {
              setEfileJob(prev => prev ? { ...prev, error: "제작에 실패한 항목이 있어 검증 단계로 넘어가지 않았습니다. 원인을 확인한 뒤 다시 실행해 주세요." } : prev);
            }
          }
        }
      } catch {}
    }, 2500);
  }
  function closeEfileModal() {
    if (efilePollRef.current) { clearInterval(efilePollRef.current); efilePollRef.current = null; }
    setEfileJob(null);
    router.refresh();
  }

  // ===== 원천세 자동신고 3·4단계: 제작된 파일을 홈택스(원천세)·위택스(지방소득세)에서 검증 → 사람 확인 → 제출 =====
  // 확장이 홈택스/위택스 탭에서 파일 업로드·검증까지만 하고 멈춘다. 여기서 [제출]을 눌러야 실제 제출 버튼을 누른다.
  type SubmitFileView = { fileId: number; fileName: string; names: string[]; expectCount: number; expectAmount: number | null; alreadySubmitted: string[] };
  type SubmitVerify = {
    fileName?: string; target?: number | null; formatErr?: number | null; contentErr?: number | null;
    normal?: number | null; taxTotal?: number | null; rows?: string[]; notes?: string[];
  };
  type SubmitProgress = { state: string; message?: string; confirmed?: boolean; receipts?: string[]; verify?: SubmitVerify };
  type SubmitJobView = {
    jobId: string; kinds: string[]; files: Record<string, SubmitFileView>; progress: Record<string, SubmitProgress>;
    done: boolean; skipped?: { kind: string; reason: string }[]; error?: string;
  };
  const [submitJob, setSubmitJob] = useState<SubmitJobView | null>(null);
  const [submitBusy, setSubmitBusy] = useState<string | null>(null);
  const submitPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitKindLabel = (k: string) => (k === "income" ? "원천세 · 홈택스" : "지방소득세 · 위택스");
  // 확장 프로그램과 이 페이지가 연결돼 있는지 확인 (확장을 새로고침하면 이미 열려 있던 페이지와의 연결이 끊긴다)
  async function ensureExtConnected(): Promise<string | null> {
    const ping = await extCall<{ ok: boolean; version?: string }>("ping", undefined, 2500);
    if (ping?.ok) return ping.version || "?";
    // 페이지가 열릴 때 확장이 남긴 표시가 있는데 응답이 없으면 = 확장이 새로고침되어 연결이 끊긴 경우
    const hadExt = typeof document !== "undefined" && !!document.documentElement.dataset.savetaxExt;
    if (hadExt) {
      if (confirm("확장 프로그램을 새로고침한 뒤라 이 페이지와 연결이 끊겨 있습니다.\n페이지를 새로고침하면 다시 연결됩니다.\n\n지금 새로고침할까요? (새로고침 후 다시 눌러 주세요)")) window.location.reload();
    } else {
      alert("크롬 확장 프로그램이 연결되어 있지 않습니다.\n· chrome://extensions 에서 SaveTax 확장이 켜져 있는지, 오류 표시가 없는지 확인해 주세요.\n· 확장을 방금 설치·새로고침했다면 이 페이지를 새로고침(F5)해 주세요.");
    }
    return null;
  }
  async function startSubmit(opts?: { fileIds?: Record<string, number> }) {
    if (submitJob && !submitJob.done && !submitJob.error) return;
    const extVersion = await ensureExtConnected();
    if (!extVersion) return;
    const res = await fetch("/api/withholding/filing/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth, fileIds: opts?.fileIds }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const why = data?.skipped?.length ? `\n\n${data.skipped.map((s: { reason: string }) => `· ${s.reason}`).join("\n")}` : "";
      alert((data?.error || "작업 생성 실패") + why);
      return;
    }
    setSubmitJob({ jobId: data.jobId, kinds: data.kinds, files: data.files, progress: {}, done: false, skipped: data.skipped });
    const opened = await extCall("efile-submit-open", { jobId: data.jobId, kinds: data.kinds }, 15000);
    if (!opened?.ok) {
      setSubmitJob(prev => prev ? { ...prev, error: `확장 프로그램이 홈택스·위택스 탭을 열지 못했습니다 (${opened?.error || "응답 없음"}). 확장을 새로고침해 버전 4.50 이상인지 확인해 주세요. 현재 ${extVersion}` } : prev);
      return;
    }
    const startedAt = Date.now();
    if (submitPollRef.current) clearInterval(submitPollRef.current);
    submitPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/withholding/filing/submit?id=${data.jobId}`);
        const j = await r.json().catch(() => null);
        const stop = (error?: string) => {
          if (submitPollRef.current) clearInterval(submitPollRef.current);
          submitPollRef.current = null;
          if (error) setSubmitJob(prev => prev ? { ...prev, error } : prev);
          router.refresh();
        };
        if (!r.ok || !j?.ok) {
          if (r.status === 404) stop("서버에서 작업 정보를 찾을 수 없습니다. 홈택스·위택스 탭에서 진행 상태를 직접 확인해 주세요.");
          return;
        }
        setSubmitJob(prev => prev ? { ...prev, progress: j.progress, done: j.done } : prev);
        if (j.done) stop();
        else if (Date.now() - startedAt > 60 * 60 * 1000) stop("1시간 안에 끝나지 않아 진행 표시를 멈췄습니다. 홈택스·위택스 탭에서 상태를 확인해 주세요.");
      } catch {}
    }, 2000);
  }
  // [제출] / [취소] — 검증 결과를 본 사람이 누른다
  async function decideSubmit(kind: string, action: "confirm" | "cancel") {
    if (!submitJob) return;
    const f = submitJob.files[kind];
    const v = submitJob.progress[kind]?.verify;
    if (action === "confirm") {
      const site = kind === "income" ? "홈택스" : "위택스";
      const warn: string[] = [];
      if (v?.normal != null && f && v.normal !== f.expectCount) warn.push(`⚠ 검증된 건수(${v.normal})가 제작한 거래처 수(${f.expectCount})와 다릅니다`);
      if (v?.taxTotal != null && f?.expectAmount != null && v.taxTotal !== f.expectAmount) warn.push(`⚠ 세액 합계(${v.taxTotal.toLocaleString()}원)가 위하고 금액(${f.expectAmount.toLocaleString()}원)과 다릅니다`);
      if (f?.alreadySubmitted?.length) warn.push(`⚠ 이미 접수 처리된 거래처 포함: ${f.alreadySubmitted.join(", ")}`);
      const msg = `${site}에 ${submitKindLabel(kind).split(" · ")[0]} ${v?.normal ?? f?.expectCount ?? ""}건을 실제로 제출합니다.\n제출한 뒤에는 되돌릴 수 없습니다 (고치려면 수정신고).\n${warn.length ? "\n" + warn.join("\n") + "\n" : ""}\n제출할까요?`;
      if (!confirm(msg)) return;
    }
    setSubmitBusy(kind);
    try {
      const r = await fetch("/api/withholding/filing/submit", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: submitJob.jobId, kind, [action]: true }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) alert(j?.error || "처리하지 못했습니다");
    } finally { setSubmitBusy(null); }
  }
  async function closeSubmitModal() {
    if (!submitJob) return;
    const states = submitJob.kinds.map(k => submitJob.progress[k]?.state || "wait");
    if (!submitJob.error && states.includes("submitting")) { alert("제출이 진행 중입니다. 끝난 뒤에 닫아 주세요."); return; }
    const pending = submitJob.kinds.filter(k => ["wait", "running", "verified"].includes(submitJob.progress[k]?.state || "wait"));
    if (pending.length && !submitJob.error) {
      if (!confirm("아직 제출하지 않은 항목이 있습니다. 닫으면 그 항목은 취소됩니다 (제출되지 않음).\n\n닫을까요?")) return;
    }
    for (const k of pending) {
      await fetch("/api/withholding/filing/submit", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: submitJob.jobId, kind: k, cancel: true }),
      }).catch(() => null);
    }
    if (submitPollRef.current) { clearInterval(submitPollRef.current); submitPollRef.current = null; }
    setSubmitJob(null);
    router.refresh();
  }

  // 거래처 드라이브의 1. 원천세/해당월 폴더 열기
  // 로컬 기준경로(savetax-drive-base-path) 설정 시 → 윈도우 탐색기(savetax-app://), 아니면 웹 드라이브
  const [folderOpening, setFolderOpening] = useState<number | null>(null);
  async function openTaxMonthFolder(clientId: number, clientName: string) {
    const monthLabel = `${year}년 ${String(month).padStart(2, "0")}월`;
    const basePath = typeof window !== "undefined" ? localStorage.getItem("savetax-drive-base-path") : null;
    if (basePath) {
      const sep = basePath.endsWith("\\") ? "" : "\\";
      const fullPath = `${basePath}${sep}${clientName}\\1. 원천세\\${monthLabel}`;
      window.location.href = `savetax-app://folder?path=${encodeURIComponent(fullPath)}`;
      return;
    }
    if (folderOpening) return;
    setFolderOpening(clientId);
    try {
      const res = await fetch("/api/withholding/tax-month-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, yearMonth }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.open(data.url, "_blank");
      else alert(data.message || "폴더를 열 수 없습니다");
    } finally {
      setFolderOpening(null);
    }
  }

  // 단일 실행
  async function runWemembersSingle(clientId: number, clientName: string, laborList: string[], params: string) {
    if (wmProgress && !wmProgress.finished) return;
    const r = await wmRunOne(clientId, clientName, laborList, params);
    setWmProgress(prev =>
      prev
        ? {
            ...prev,
            finished: true,
            error: !r.ok,
            message: !r.ok ? r.msg : r.msg === "완료" ? "위멤버스 업로드 + 문서 생성까지 완료! 🎉" : `완료! ${r.msg}`,
          }
        : prev
    );
    if (r.ok) router.refresh();
  }

  // 일괄 실행 (체크된 거래처 순차 처리)
  async function runWemembersBatch() {
    if (wmProgress && !wmProgress.finished) return;
    const targets = filtered
      .filter(c => checkedIds.has(c.id) && c.wehagoCno && c.wehagoCdCom)
      .map(c => {
        const override = c.withholdingLaborOverrides?.[0];
        const base = c.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
        const laborList = override?.laborTypes
          ? override.laborTypes.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자")
          : base;
        return { id: c.id, name: c.name, laborList, params: buildWehagoParams(c) };
      })
      .filter(t => t.laborList.length > 0);

    if (targets.length === 0) { alert("처리 가능한 거래처가 없습니다 (위하고 연동·인건비 유형 확인)"); return; }
    if (!confirm(`${targets.length}개 거래처 위멤버스 일괄 처리를 시작할까요?`)) return;

    const fails: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const r = await wmRunOne(t.id, t.name, t.laborList, t.params, { current: i + 1, total: targets.length });
      if (!r.ok) fails.push(`${t.name} — ${r.msg}`);
    }
    setWmProgress(prev =>
      prev
        ? {
            ...prev,
            finished: true,
            error: fails.length > 0,
            message: fails.length > 0
              ? `완료 ${targets.length - fails.length}건 / 실패 ${fails.length}건\n${fails.join("\n")}`
              : `${targets.length}개 거래처 모두 완료! 🎉`,
          }
        : prev
    );
    setCheckedIds(new Set());
    router.refresh();
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

  let filtered = search ? clients.filter((c) => c.name.includes(search)) : clients;
  if (userFilter.length > 0) {
    filtered = filtered.filter((c) => userFilter.includes(c.assignedUser?.name || ""));
  }

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
    const extras = getRequiredTasks(laborList, c.halfYearTax, month, c.skipDailyWorkReport);
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
      {/* 헤더 — 스크롤해도 상단에 고정 (아래쪽 거래처 체크 후 바로 버튼을 누를 수 있게). 표 머리글은 이 높이만큼 아래에 고정 */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-30 -mx-6 px-6 pt-4 pb-1 mb-2 bg-[#F9FAFB]/85 backdrop-blur-md">
      <div className="flex items-end justify-between mb-2 gap-4 flex-wrap">
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
          {(() => {
            const missingCount = clients.filter(c => !c.wehagoCno && ["A", "B", "C"].includes(c.withholdingType || "") && c.accountingProgram?.includes("위하고")).length;
            return (
              <button
                onClick={() => startCollect()}
                disabled={missingCount === 0 || (!!collectJob && !collectJob.done)}
                title="신규 거래처의 위하고 연동정보를 수집해서 급여/사업/일용 버튼을 생성합니다"
                className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB] disabled:opacity-40 flex items-center gap-1.5"
              >
                연동 수집
                {missingCount > 0 && (
                  <span className="bg-[#F59E0B] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{missingCount}</span>
                )}
              </button>
            );
          })()}
          {/* 원천세 자동신고 1단계: 위하고 마감상태 조회 */}
          <button
            onClick={() => startCloseCheck(false)}
            disabled={!!closeCheck && !closeCheck.error && !(closeCheck.income && closeCheck.local)}
            title="위하고 전자신고 화면을 열어 이번 달 마감된 거래처와 세액(원천세·지방소득세)을 읽어옵니다"
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#A3CAFD] text-[#1B64DA] bg-[#F5F9FF] hover:bg-[#E8F3FF] disabled:opacity-50 flex items-center gap-1.5"
          >
            {closeCheck && !closeCheck.error && !(closeCheck.income && closeCheck.local) ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#1B64DA]/30 border-t-[#1B64DA] animate-spin" />
                마감 조회 중
              </>
            ) : (
              <>
                마감상태 조회
                {filingStats.latest && (
                  <span className="text-[10px] text-[#6B7684] font-normal">
                    원천 {filingStats.income} · 지방 {filingStats.local}
                    {filingStats.incomeOnly > 0 && <span className="text-[#D97706] font-bold"> · 지방미마감 {filingStats.incomeOnly}</span>}
                  </span>
                )}
              </>
            )}
          </button>
          {closeCheck?.error && (
            <span className="text-[11px] text-[#DC2626]">{closeCheck.error}</span>
          )}
          {/* 원천세 자동신고 3·4단계: 제작된 파일을 홈택스·위택스에서 검증하고 제출 */}
          <button
            onClick={() => startSubmit()}
            disabled={!!submitJob && !submitJob.done && !submitJob.error}
            title="이번 달에 제작한 전자신고 파일을 홈택스(원천세)·위택스(지방소득세)에 올려 검증합니다. 검증 결과를 확인한 뒤 [제출]을 눌러야 제출됩니다"
            className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#86EFAC] text-[#15803D] bg-[#F1FBF4] hover:bg-[#DCFCE7] disabled:opacity-50"
          >
            검증 · 제출
          </button>
          {checkedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-sm text-[#3182F6] font-medium bg-[#F5F9FF] px-3 py-1 rounded-lg">
                {checkedIds.size}개 선택
              </div>
              <button
                onClick={runWemembersBatch}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#3182F6] text-white hover:bg-[#1B64DA]"
              >
                일괄 위멤버스
              </button>
              <button
                onClick={startProduce}
                disabled={!!efileJob && !efileJob.done && !efileJob.error}
                title="체크한 거래처의 원천세·지방소득세 전자신고 파일을 위하고에서 제작합니다 (마감된 거래처만)"
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-[#15803D] text-white hover:bg-[#166534] disabled:opacity-50"
              >
                {chainVerify ? "자동신고 · 제작 → 검증" : "자동신고 · 파일 제작"}
              </button>
              <label
                className="flex items-center gap-1.5 text-[11.5px] text-[#4E5968] cursor-pointer select-none"
                title="켜면 파일 제작이 끝난 뒤 홈택스·위택스에 올려 검증까지 이어서 합니다. 제출은 검증 결과를 확인하고 [제출]을 눌러야 됩니다"
              >
                <input type="checkbox" checked={chainVerify} onChange={e => toggleChainVerify(e.target.checked)} className="w-3.5 h-3.5 accent-[#15803D]" />
                검증까지 이어서
              </label>
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
      </div>

      {/* 원천세 자동신고: 마감상태 조회 진행 패널 */}
      {closeCheck && !closeCheck.error && !(closeCheck.income && closeCheck.local) && (
        <div className="glass rounded-2xl px-4 py-3 mb-3 flex items-center gap-4 flex-wrap">
          <div className="text-[12px] font-bold text-[#191F28] flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#1B64DA]/30 border-t-[#1B64DA] animate-spin" />
            위하고 마감상태 조회 중
            <span className="text-[10.5px] text-[#8B95A1] font-normal">창은 뒤에서 돌아갑니다 · 보통 1~2분</span>
          </div>
          {(["income", "local"] as const).map(k => {
            const p = closeCheck.progress?.[k] || null;
            const finished = k === "income" ? closeCheck.income : closeCheck.local;
            const pct = finished ? 100 : p && p.total > 0 ? Math.min(99, Math.round(p.done / p.total * 100)) : 0;
            const msg = finished ? `완료 · 마감 ${p?.closed ?? ""}곳` : p?.message || "창 여는 중…";
            return (
              <div key={k} className="flex items-center gap-2 min-w-[260px] flex-1">
                <span className={`text-[11px] font-bold w-14 shrink-0 ${k === "income" ? "text-[#1B64DA]" : "text-[#B45309]"}`}>{k === "income" ? "원천세" : "지방소득세"}</span>
                <div className="flex-1 h-2 bg-[#F2F4F6] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${finished ? "bg-[#15803D]" : k === "income" ? "bg-[#3182F6]" : "bg-[#F59E0B]"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-[10.5px] whitespace-nowrap ${finished ? "text-[#15803D] font-semibold" : "text-[#6B7684]"}`}>
                  {p && p.total > 0 && !finished ? `${p.done}/${p.total} · ` : ""}{msg}
                </span>
              </div>
            );
          })}
        </div>
      )}

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
          <thead className="bg-white/60 backdrop-blur sticky z-10" style={{ top: stickyHeaderH }}>
            <tr className="border-b border-white/40">
              <th className="px-2 py-2.5 w-9"></th>
              <th className="text-left px-4 py-2.5 text-[10.5px] font-bold text-[#333D4B] uppercase tracking-wider whitespace-nowrap">고객사명</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">특이사항·메모</th>
              {showAssignedUser && (
                <th className="text-center px-2 py-2.5 whitespace-nowrap">
                  <div className="relative inline-block" ref={userFilterRef}>
                    <button
                      onClick={() => setUserFilterOpen(o => !o)}
                      className={`flex items-center gap-1 mx-auto text-[10.5px] uppercase tracking-wider hover:text-[#191F28] ${userFilter.length > 0 ? "text-[#191F28] font-bold" : "text-[#6B7684] font-medium"}`}
                    >
                      담당
                      {userFilter.length > 0 && (
                        <span className="bg-[#3182F6] text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">{userFilter.length}</span>
                      )}
                      <span className="text-[#8B95A1] text-[9px]">▼</span>
                    </button>
                    {userFilterOpen && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#E5E8EB] rounded-[10px] shadow-lg z-20 p-2 min-w-[110px] max-h-60 overflow-y-auto normal-case">
                        {userOptions.length === 0 ? (
                          <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                        ) : (
                          userOptions.map(name => (
                            <label key={name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={userFilter.includes(name)}
                                onChange={() => setUserFilter(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name])}
                                className="accent-[#3182F6]"
                              />
                              {name}
                            </label>
                          ))
                        )}
                        {userFilter.length > 0 && (
                          <button
                            onClick={() => setUserFilter([])}
                            className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              )}
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">신고없음</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#15803D] uppercase tracking-wider whitespace-nowrap">검증</th>
              <th className="text-center px-3 py-2.5 text-[10.5px] font-bold text-[#333D4B] uppercase tracking-wider whitespace-nowrap">인건비</th>
              <th className="text-center px-2 py-2.5 text-[10.5px] font-medium text-[#6B7684] uppercase tracking-wider whitespace-nowrap">6개월납</th>
              {ALL_PROCESS_STEPS.map(step => (
                <th key={step} className="text-center px-3 py-2.5 whitespace-nowrap">
                  <span className="text-[10.5px] font-bold text-[#4E5968] uppercase tracking-wider">{step}</span>
                </th>
              ))}
              <th className="text-center px-2 py-2.5 whitespace-nowrap">
                <span className="text-[10.5px] font-bold text-[#1B64DA] uppercase tracking-wider">위멤버스</span>
              </th>
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
              const totalCols = 9 + (showAssignedUser ? 1 : 0) + ALL_PROCESS_STEPS.length + (extraColumns.length > 0 ? 1 : 0) + extraColumns.length;
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
                    const requiredExtra = getRequiredTasks(laborList, client.halfYearTax, month, client.skipDailyWorkReport);
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
                            {/* 거래처 드라이브의 1. 원천세/해당월 폴더 바로가기 (거래처 전달용) */}
                            {client.driveFolderId && (
                              <button
                                onClick={() => openTaxMonthFolder(client.id, client.name)}
                                disabled={folderOpening !== null}
                                className="shrink-0 text-[#B0B8C1] hover:text-[#F59E0B] transition-colors disabled:opacity-40"
                                title={`드라이브: 1. 원천세/${year}년 ${String(month).padStart(2, "0")}월 폴더 열기`}
                              >
                                {folderOpening === client.id ? (
                                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#F59E0B]/30 border-t-[#F59E0B] animate-spin" />
                                ) : (
                                  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                                  </svg>
                                )}
                              </button>
                            )}
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
                                </>
                              );
                            })()}
                          </div>
                          {/* 위하고 마감상태 (원천세 자동신고) — 조회된 적이 있는 거래처만 표시 */}
                          {(() => {
                            const fi = filingOf(client, "income");
                            const fl = filingOf(client, "local");
                            if (!fi && !fl) return null;
                            const fmt = (n: number | null) => n == null ? "" : n.toLocaleString();
                            const chip = (label: string, f: WHFiling | null) => {
                              if (!f) return <span key={label} className="text-[9.5px] px-1.5 py-[1px] rounded-md bg-[#F2F4F6] text-[#B0B8C1]">{label} 미조회</span>;
                              if (!f.closed) return <span key={label} className="text-[9.5px] px-1.5 py-[1px] rounded-md bg-[#F2F4F6] text-[#8B95A1]">{label} 미마감</span>;
                              const half = f.reportType === "반기";
                              const stepLabel = f.status === "submitted" ? "접수" : f.status === "verified" ? "검증" : f.status === "produced" ? "파일" : "";
                              return (
                                <span key={label} title={`${half ? "반기 · " : ""}귀속 ${f.attribYm || ""}${f.fileName ? ` · ${f.fileName}` : ""}${f.receiptNo ? ` · 접수 ${f.receiptNo}` : ""}`} className={`text-[9.5px] px-1.5 py-[1px] rounded-md font-semibold ${half ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]" : "bg-[#F1FBF4] text-[#15803D] border border-[#BBF7D0]"}`}>
                                  {label} {half ? "반기" : fmt(f.amount) || "0"}{stepLabel && <span className="ml-1 text-[#1B64DA]">· {stepLabel}</span>}
                                </span>
                              );
                            };
                            const warn = fi?.closed && fl && !fl.closed && fi.reportType !== "반기";
                            return (
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {chip("원천", fi)}
                                {chip("지방", fl)}
                                {warn && <span title="원천세는 마감됐는데 지방소득세가 마감되지 않았습니다" className="text-[9.5px] px-1.5 py-[1px] rounded-md bg-[#FEF2F2] text-[#DC2626] font-bold">지방 미마감!</span>}
                              </div>
                            );
                          })()}
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
                        {/* 위멤버스 실행/완료 */}
                        <td className="px-2 py-2 text-center">
                          {(() => {
                            const canWm = !!client.wehagoCno && !!client.wehagoCdCom && laborList.length > 0 && !isSkipped;
                            if (!canWm) {
                              // 미연동 ABC 거래처 → 개별 연동 수집 버튼
                              const canCollect = (!client.wehagoCno || !client.wehagoCdCom)
                                && ["A", "B", "C"].includes(client.withholdingType || "")
                                && client.accountingProgram?.includes("위하고")
                                && !isSkipped;
                              if (canCollect) {
                                return (
                                  <button
                                    onClick={() => startCollect(client.id, client.name)}
                                    disabled={!!collectJob && !collectJob.done}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#FFFBEB] text-[#D97706] hover:bg-[#FEF3C7] border border-[#FDE68A] whitespace-nowrap disabled:opacity-40"
                                    title="위하고 연동정보 수집 (급여/사업/일용 버튼 생성)"
                                  >
                                    연동
                                  </button>
                                );
                              }
                              return <span className="text-[#D1D6DB] text-[10px]">-</span>;
                            }
                            if (doneMap.has("위멤버스완료")) {
                              return (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#E8F5EE] border-2 border-[#BBF7D0] text-[#16A865] text-[11px] font-bold" title="위멤버스 업로드 완료">
                                  ✓
                                </span>
                              );
                            }
                            return (
                              <button
                                onClick={() => runWemembersSingle(client.id, client.name, laborList, buildWehagoParams(client))}
                                disabled={!!wmProgress && !wmProgress.finished}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-[#A3CAFD] bg-[#F5F9FF] text-[#3182F6] hover:bg-[#E8F3FF] text-[9px] font-bold transition-colors disabled:opacity-40"
                                title="위멤버스 다운로드+업로드 실행"
                              >
                                ▶
                              </button>
                            );
                          })()}
                        </td>
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
                              ) : col.key === "근로내용확인신고서" && client.skipDailyWorkReport && laborList.includes("일용직") ? (
                                <span title="근로내용확인신고서 미제출 거래처 (거래처 수정 → 원천세 탭에서 변경)" className="text-[#B0B8C1] text-[9px]">미제출</span>
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

      {/* 원천세 자동신고: 파일 제작 진행 모달 */}
      {efileJob && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => (efileJob.done || efileJob.error) && closeEfileModal()}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">자동신고 · 전자신고 파일 제작</h3>
                <div className="text-[11.5px] text-[#6B7684] mt-0.5">{year}년 {month}월 지급분 · 대상 {efileJob.targets.length}곳 · 위하고 창은 화면에 뜨지 않고 뒤에서 돌아갑니다</div>
              </div>
              {(efileJob.done || efileJob.error) && <button onClick={closeEfileModal} className="text-[#8B95A1] hover:text-[#191F28] text-lg">✕</button>}
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {efileJob.kinds.map(k => {
                const p = efileJob.progress[k];
                const lab = k === "income" ? "원천세 (홈택스용)" : "지방소득세 (위택스용)";
                const st = p?.state || "wait";
                const color = st === "done" ? "text-[#15803D]" : st === "error" ? "text-[#DC2626]" : st === "running" ? "text-[#1B64DA]" : "text-[#8B95A1]";
                return (
                  <div key={k} className="rounded-xl border border-[#F2F4F6] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-[#191F28]">{lab}</span>
                      <span className={`text-[12px] font-semibold ${color} flex items-center gap-1.5`}>
                        {st === "running" && <span className="inline-block w-3 h-3 rounded-full border-2 border-[#1B64DA]/30 border-t-[#1B64DA] animate-spin" />}
                        {st === "wait" ? "대기" : st === "running" ? "진행 중" : st === "done" ? "완료" : st === "error" ? "오류" : st}
                      </span>
                    </div>
                    {p?.message && <div className={`text-[11.5px] mt-1 ${st === "error" ? "text-[#DC2626]" : "text-[#6B7684]"}`}>{p.message}</div>}
                    {st === "running" && (() => { const mm = (p?.message || "").match(/(\d+)\/(\d+)/); const pct = mm ? Math.min(99, Math.round(Number(mm[1]) / Math.max(1, Number(mm[2])) * 100)) : null; return (
                      <div className="h-1.5 bg-[#F2F4F6] rounded-full overflow-hidden mt-2">
                        <div className={`h-full bg-[#3182F6] rounded-full transition-all ${pct == null ? "animate-pulse w-1/3" : ""}`} style={pct != null ? { width: `${pct}%` } : undefined} />
                      </div>
                    ); })()}
                    {p?.produced && p.produced.length > 0 && <div className="text-[11px] text-[#4E5968] mt-1">제작: {p.produced.join(", ")}</div>}
                    {p?.skipped && p.skipped.length > 0 && <div className="text-[11px] text-[#B45309] mt-1">건너뜀: {p.skipped.join(" / ")}</div>}
                  </div>
                );
              })}
              {efileJob.skippedAtStart && efileJob.skippedAtStart.length > 0 && (
                <div className="text-[11px] text-[#B45309] bg-[#FFFBEB] rounded-lg px-3 py-2">
                  대상에서 제외: {efileJob.skippedAtStart.map(s => `${s.name}(${s.reason})`).join(", ")}
                </div>
              )}
              {efileJob.error && <div className="text-[12px] text-[#DC2626] bg-[#FEF2F2] rounded-lg px-3 py-2">{efileJob.error}</div>}
              {efileJob.done && !efileJob.error && (
                <div className="text-[12px] text-[#15803D] bg-[#F1FBF4] rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                  <span>파일 제작이 끝났습니다. 이어서 홈택스·위택스에서 검증하고 제출할 수 있습니다.</span>
                  {Object.values(efileJob.progress).some(p => p.state === "done") && (
                    <button onClick={() => { closeEfileModal(); startSubmit(); }}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-bold bg-[#15803D] text-white hover:bg-[#166534]">검증 · 제출로</button>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#F2F4F6] flex justify-end">
              <button onClick={closeEfileModal} disabled={!efileJob.done && !efileJob.error} className="text-xs px-4 py-2 rounded-lg font-medium bg-[#191F28] text-white disabled:opacity-40">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 원천세 자동신고: 홈택스·위택스 검증·제출 진행 모달 */}
      {submitJob && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">자동신고 · 홈택스·위택스 검증·제출</h3>
                <div className="text-[11.5px] text-[#6B7684] mt-0.5">{year}년 {month}월 지급분 · 검증 결과를 확인하고 [제출]을 눌러야 실제로 제출됩니다</div>
              </div>
              <button onClick={closeSubmitModal} className="text-[#8B95A1] hover:text-[#191F28] text-lg">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[68vh] overflow-y-auto">
              {submitJob.kinds.map(k => {
                const p = submitJob.progress[k];
                const f = submitJob.files[k];
                const v = p?.verify;
                const st = p?.state || "wait";
                const stLabel = st === "wait" ? "대기" : st === "running" ? "진행 중" : st === "verified" ? "제출 확인 대기" : st === "submitting" ? "제출 중" : st === "done" ? "제출 완료" : st === "error" ? "오류" : st === "skip" ? "취소됨" : st;
                const color = st === "done" ? "text-[#15803D]" : st === "error" ? "text-[#DC2626]" : st === "verified" ? "text-[#B45309]" : st === "running" || st === "submitting" ? "text-[#1B64DA]" : "text-[#8B95A1]";
                const countMismatch = v?.normal != null && f && v.normal !== f.expectCount;
                const amountMismatch = v?.taxTotal != null && f?.expectAmount != null && v.taxTotal !== f.expectAmount;
                return (
                  <div key={k} className={`rounded-xl border p-3.5 ${st === "verified" ? "border-[#FCD34D] bg-[#FFFBEB]" : "border-[#F2F4F6]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-[#191F28]">{submitKindLabel(k)}</span>
                      <span className={`text-[12px] font-semibold ${color} flex items-center gap-1.5`}>
                        {(st === "running" || st === "submitting") && <span className="inline-block w-3 h-3 rounded-full border-2 border-[#1B64DA]/30 border-t-[#1B64DA] animate-spin" />}
                        {stLabel}
                      </span>
                    </div>
                    {f && (
                      <div className="text-[11px] text-[#6B7684] mt-1">
                        파일 {f.fileName} · {f.expectCount}곳{f.expectAmount != null ? ` · 위하고 세액 ${f.expectAmount.toLocaleString()}원` : ""}
                        <div className="text-[#8B95A1] truncate" title={f.names.join(", ")}>{f.names.slice(0, 6).join(", ")}{f.names.length > 6 ? ` 외 ${f.names.length - 6}곳` : ""}</div>
                      </div>
                    )}
                    {p?.message && <div className={`text-[11.5px] mt-1.5 ${st === "error" ? "text-[#DC2626]" : "text-[#4E5968]"}`}>{p.message}</div>}
                    {v && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                        {([
                          ["정상", v.normal, false],
                          ["형식 오류", v.formatErr, true],
                          ["내용 오류", v.contentErr, true],
                          [k === "income" ? "대상" : "세액 합계", k === "income" ? v.target : v.taxTotal, false],
                        ] as [string, number | null | undefined, boolean][]).map(([lab, n, bad]) => (
                          <div key={lab} className="rounded-lg bg-white border border-[#F2F4F6] py-1.5">
                            <div className={`text-[13px] font-bold ${bad && (n || 0) > 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>{n == null ? "–" : n.toLocaleString()}</div>
                            <div className="text-[10px] text-[#8B95A1]">{lab}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(countMismatch || amountMismatch) && (
                      <div className="text-[11px] text-[#DC2626] bg-[#FEF2F2] rounded-lg px-2.5 py-1.5 mt-2">
                        {countMismatch && <div>검증된 건수({v?.normal})가 제작한 거래처 수({f.expectCount})와 다릅니다.</div>}
                        {amountMismatch && <div>세액 합계({v?.taxTotal?.toLocaleString()}원)가 위하고 금액({f.expectAmount?.toLocaleString()}원)과 다릅니다.</div>}
                      </div>
                    )}
                    {f?.alreadySubmitted?.length > 0 && st !== "done" && (
                      <div className="text-[11px] text-[#B45309] bg-[#FFFBEB] rounded-lg px-2.5 py-1.5 mt-2">이미 접수 처리된 거래처가 들어 있습니다: {f.alreadySubmitted.join(", ")}</div>
                    )}
                    {v?.rows && v.rows.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-[#6B7684] cursor-pointer">검증 화면의 신고 내역 {v.rows.length}건 보기</summary>
                        <div className="mt-1 max-h-32 overflow-y-auto text-[10.5px] text-[#4E5968] space-y-0.5">
                          {v.rows.map((r, i) => <div key={i} className="truncate" title={r}>{r}</div>)}
                        </div>
                      </details>
                    )}
                    {v?.notes && v.notes.length > 0 && (
                      <div className="text-[10.5px] text-[#8B95A1] mt-1.5">사이트 안내: {v.notes.slice(-3).join(" / ")}</div>
                    )}
                    {p?.receipts && p.receipts.length > 0 && (
                      <div className="text-[11.5px] text-[#15803D] font-semibold mt-1.5 break-all">{k === "income" ? "접수번호" : "일괄신고ID"} {p.receipts.join(", ")}</div>
                    )}
                    {st === "verified" && (
                      <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => decideSubmit(k, "cancel")} disabled={submitBusy === k || !!p?.confirmed}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#E5E8EB] text-[#4E5968] hover:bg-[#F9FAFB] disabled:opacity-40">취소</button>
                        <button onClick={() => decideSubmit(k, "confirm")} disabled={submitBusy === k || !!p?.confirmed}
                          className="text-xs px-4 py-1.5 rounded-lg font-bold bg-[#15803D] text-white hover:bg-[#166534] disabled:opacity-40">
                          {p?.confirmed ? "제출 진행 중…" : `${k === "income" ? "홈택스" : "위택스"}에 제출`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {submitJob.skipped && submitJob.skipped.length > 0 && (
                <div className="text-[11px] text-[#B45309] bg-[#FFFBEB] rounded-lg px-3 py-2">
                  제외: {submitJob.skipped.map(s => s.reason).join(" / ")}
                </div>
              )}
              {submitJob.error && <div className="text-[12px] text-[#DC2626] bg-[#FEF2F2] rounded-lg px-3 py-2">{submitJob.error}</div>}
              <div className="text-[11px] text-[#8B95A1] leading-relaxed">
                홈택스는 로그인되어 있지 않으면 설정의 세무대리인 계정으로 자동 로그인합니다. 위택스는 열린 탭에서 공동인증서로 로그인하면 이어서 진행됩니다. 홈택스·위택스 탭은 닫지 말고 그대로 두세요.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#F2F4F6] flex justify-end">
              <button onClick={closeSubmitModal} className="text-xs px-4 py-2 rounded-lg font-medium bg-[#191F28] text-white">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 위하고 연동 수집 모달 */}
      {collectJob && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
            <div className="text-center mb-5">
              <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-gradient-to-br from-[#F59E0B] to-[#D97706] shadow-lg shadow-[#F59E0B]/30">
                {collectJob.done && !collectJob.fatal ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                ) : collectJob.fatal ? (
                  <span className="text-white text-2xl font-bold">!</span>
                ) : (
                  <div className="w-7 h-7 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                )}
              </div>
              <h3 className="text-base font-bold text-[#191F28]">위하고 연동 수집</h3>
              <p className="text-xs text-[#8B95A1] mt-0.5">
                {collectJob.done ? "완료" : collectJob.currentName || "진행 중..."}
              </p>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="font-bold text-[#D97706]">{collectJob.current} / {collectJob.total}</span>
                <span className="text-[#8B95A1] tabular-nums">{collectJob.total > 0 ? Math.round((collectJob.current / collectJob.total) * 100) : 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#F2F4F6] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] transition-all duration-700"
                  style={{ width: `${collectJob.total > 0 ? (collectJob.current / collectJob.total) * 100 : 0}%` }} />
              </div>
            </div>

            {collectJob.results.length > 0 && (
              <div className="space-y-1 mb-4 max-h-44 overflow-y-auto">
                {collectJob.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className={r.status === "ok" ? "text-[#16A865]" : r.status === "skip" ? "text-[#B0B8C1]" : "text-[#DC2626]"}>
                      {r.status === "ok" ? "✓" : r.status === "skip" ? "−" : "✕"}
                    </span>
                    <span className="text-[#333D4B]">{r.name}</span>
                    {r.msg && <span className="text-[10.5px] text-[#8B95A1] truncate">{r.msg}</span>}
                  </div>
                ))}
              </div>
            )}

            {collectJob.fatal && (
              <div className="text-[12px] bg-[#FEF2F2] text-[#B91C1C] rounded-xl px-3.5 py-2.5 mb-4">{collectJob.fatal}</div>
            )}
            {collectJob.done && !collectJob.fatal && (
              <div className="text-[12px] bg-[#E8F5EE] text-[#15803D] rounded-xl px-3.5 py-2.5 mb-4">
                성공 {collectJob.results.filter(r => r.status === "ok").length}건 · 스킵 {collectJob.results.filter(r => r.status === "skip").length}건 · 실패 {collectJob.results.filter(r => r.status === "fail").length}건 — 성공한 거래처는 버튼이 생겼어요!
              </div>
            )}

            <button onClick={closeCollectModal}
              className={`w-full text-sm py-2.5 rounded-xl font-bold transition-colors ${
                collectJob.done ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]" : "bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB]"
              }`}>
              {collectJob.done ? "닫기" : "백그라운드로 진행 (창 닫기)"}
            </button>
          </div>
        </div>
      )}

      {/* 위멤버스 진행상황 모달 */}
      {wmProgress && (() => {
        const total = wmProgress.steps.length;
        const done = wmProgress.steps.filter(s => s.status === "done" || s.status === "skip").length;
        const running = wmProgress.steps.some(s => s.status === "run");
        const pct = Math.round(((done + (running ? 0.5 : 0)) / total) * 100);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
              {/* 헤더 */}
              <div className="text-center mb-5">
                <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-gradient-to-br from-[#3182F6] to-[#1B64DA] shadow-lg shadow-[#3182F6]/30">
                  {wmProgress.finished && !wmProgress.error ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  ) : wmProgress.error ? (
                    <span className="text-white text-2xl font-bold">!</span>
                  ) : (
                    <div className="w-7 h-7 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                  )}
                </div>
                <h3 className="text-base font-bold text-[#191F28]">
                  위멤버스 자동화{wmProgress.batch ? ` (${wmProgress.batch.current}/${wmProgress.batch.total})` : ""}
                </h3>
                <p className="text-xs text-[#8B95A1] mt-0.5">{wmProgress.clientName}</p>
              </div>

              {/* 진행 바 */}
              <div className="mb-5">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className={`font-bold ${wmProgress.error ? "text-[#DC2626]" : "text-[#3182F6]"}`}>
                    {wmProgress.error ? "오류 발생" : wmProgress.finished ? "완료" : "진행 중"}
                  </span>
                  <span className="text-[#8B95A1] tabular-nums">{wmProgress.error ? "" : `${pct}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-[#F2F4F6] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${wmProgress.error ? "bg-[#DC2626]" : "bg-gradient-to-r from-[#3182F6] to-[#1B64DA]"}`}
                    style={{ width: `${wmProgress.error ? 100 : pct}%` }}
                  />
                </div>
              </div>

              {/* 단계 목록 */}
              <div className="space-y-2.5 mb-5">
                {wmProgress.steps.map(s => (
                  <div key={s.key} className="flex items-center gap-2.5">
                    {s.status === "done" ? (
                      <span className="w-5 h-5 rounded-full bg-[#E8F5EE] flex items-center justify-center shrink-0">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16A865" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      </span>
                    ) : s.status === "run" ? (
                      <span className="w-5 h-5 rounded-full border-2 border-[#3182F6]/25 border-t-[#3182F6] animate-spin shrink-0" />
                    ) : s.status === "error" ? (
                      <span className="w-5 h-5 rounded-full bg-[#FEF2F2] text-[#DC2626] text-[11px] font-bold flex items-center justify-center shrink-0">!</span>
                    ) : s.status === "skip" ? (
                      <span className="w-5 h-5 rounded-full bg-[#F2F4F6] text-[#8B95A1] text-[11px] font-bold flex items-center justify-center shrink-0">−</span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-[#E5E8EB] shrink-0" />
                    )}
                    <span className={`text-[13px] ${
                      s.status === "done" ? "text-[#8B95A1] line-through decoration-[#D1D6DB]"
                      : s.status === "run" ? "text-[#191F28] font-bold"
                      : s.status === "error" ? "text-[#DC2626] font-bold"
                      : s.status === "skip" ? "text-[#8B95A1] line-through decoration-[#D1D6DB]"
                      : "text-[#B0B8C1]"
                    }`}>{s.label}</span>
                    {s.status === "run" && ["salary", "business", "daily"].includes(s.key) && (
                      <button
                        onClick={() => { wmSkipRef.current = true; }}
                        className="ml-auto text-[10px] px-2 py-0.5 rounded-md border border-[#FDE68A] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7] shrink-0"
                        title="이번 달 자료가 없는 소득유형이면 건너뛰고 다음 단계로 진행"
                      >
                        건너뛰기
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 상태 메시지 */}
              <div className={`text-[12px] rounded-xl px-3.5 py-2.5 mb-4 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto ${
                wmProgress.error ? "bg-[#FEF2F2] text-[#B91C1C]" : wmProgress.finished ? "bg-[#E8F5EE] text-[#15803D]" : "bg-[#F5F9FF] text-[#4E5968]"
              }`}>
                {wmProgress.message}
              </div>

              <button
                onClick={() => setWmProgress(null)}
                className={`w-full text-sm py-2.5 rounded-xl font-bold transition-colors ${
                  wmProgress.finished
                    ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
                    : "bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB]"
                }`}
              >
                {wmProgress.finished ? "닫기" : "백그라운드로 진행 (창 닫기)"}
              </button>
            </div>
          </div>
        );
      })()}

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
