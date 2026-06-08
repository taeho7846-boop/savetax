"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import {
  addHappyCall,
  toggleField,
  setWihagoType,
  markComplete,
  removeFromCommission,
  restoreCommission,
  createCommission,
  saveNotes,
  bulkImportAllClients,
  deleteIdCard,
} from "@/app/actions/commission";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

type HappyCallData = {
  id: number;
  attemptNo: number;
  result: string;
  notes: string | null;
  calledAt: Date | string;
};

type CommissionData = {
  id: number;
  clientId: number;
  client: {
    id: number;
    name: string;
    ceoName: string | null;
    phone: string | null;
    laborTypes?: string | null;
    assignedUser?: { name: string } | null;
  };
  hasIdCard: boolean;
  hasHometaxCredentials: boolean;
  hometaxCommissionDone: boolean;
  hometaxCommissionAt: Date | string | null;
  wihagoType: string | null;
  wihagoDone: boolean;
  wihagoAt: Date | string | null;
  idCardPath: string | null;
  hasEmployees: boolean;
  nationalPensionDone: boolean;
  nationalPensionAt: Date | string | null;
  healthInsuranceDone: boolean;
  healthInsuranceAt: Date | string | null;
  notes: string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  happyCalls: HappyCallData[];
};

type AvailableClient = {
  id: number;
  name: string;
  ceoName: string | null;
};

function getStage(c: CommissionData) {
  if (c.completedAt)
    return { label: "완료", cls: "bg-[#E7F7EE] text-[#15803D]" };
  // 해피콜 대기: 통화 연결(connected) 기록이 없으면 0회/부재중 N차 모두 포함
  const hasConnected = c.happyCalls.some(h => h.result === "connected");
  if (!hasConnected)
    return { label: "해피콜 대기", cls: "bg-[#F2F4F6] text-[#6B7684]" };
  if (!c.hasIdCard || !c.hasHometaxCredentials)
    return { label: "서류수집 중", cls: "bg-[#FFF4D0] text-[#B08809]" };
  if (!c.hometaxCommissionDone)
    return { label: "수임 대기", cls: "bg-[#E8F3FF] text-[#1B64DA]" };
  if (!c.wihagoDone)
    return { label: "위하고 대기", cls: "bg-violet-100 text-violet-700" };
  const hasWage = (c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득");
  if (hasWage && (!c.nationalPensionDone || !c.healthInsuranceDone))
    return { label: "EDI 대기", cls: "bg-[#FEF3C7] text-[#92400E]" };
  return {
    label: "완료처리 필요",
    cls: "bg-[#F1FBF4] text-[#16A865] border border-[#BBF7D0]",
  };
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function Pill({
  checked,
  label,
  onClick,
  disabled,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        checked
          ? "bg-[#3182F6] text-white"
          : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {checked ? "✓ " : ""}
      {label}
    </button>
  );
}

type ModalState =
  | null
  | "add"
  | { type: "happycall"; id: number }
  | { type: "happycall-history"; id: number; clientName: string; calls: HappyCallData[] }
  | { type: "notes"; id: number }
  | { type: "idcard"; id: number; clientId: number; clientName: string };

export default function CommissionBoard({
  commissions,
  completed,
  availableClients,
}: {
  commissions: CommissionData[];
  completed: CommissionData[];
  availableClients: AvailableClient[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [importing, setImporting] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localIdCards, setLocalIdCards] = useState<Record<number, string | null>>({});
  const [autoLoading, setAutoLoading] = useState<string | null>(null);
  const [autoResult, setAutoResult] = useState<{ ok: boolean; msg: string; pdfPath?: string } | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "board">("board");
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [wehagoProgress, setWehagoProgress] = useState<{ id: number; step: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Happy call form
  const [callResult, setCallResult] = useState("no_answer");
  const [callNotes, setCallNotes] = useState("");

  // Notes form
  const [notesValue, setNotesValue] = useState("");

  // Add modal search
  const [addSearch, setAddSearch] = useState("");

  async function doToggle(
    id: number,
    field: Parameters<typeof toggleField>[1],
    value: boolean
  ) {
    setLoadingId(id);
    await toggleField(id, field, value);
    router.refresh();
    setLoadingId(null);
  }

  async function doSetWihagoType(id: number, type: string | null) {
    setLoadingId(id);
    await setWihagoType(id, type);
    router.refresh();
    setLoadingId(null);
  }

  async function doHappyCall(id: number) {
    setLoadingId(id);
    await addHappyCall(id, callResult, callNotes);
    setModal(null);
    setCallResult("no_answer");
    setCallNotes("");
    router.refresh();
    setLoadingId(null);
  }

  async function doMarkComplete(id: number) {
    if (!confirm("수임 완료 처리하시겠습니까?")) return;
    setLoadingId(id);
    await markComplete(id);
    router.refresh();
    setLoadingId(null);
  }

  async function doRemove(id: number) {
    if (!confirm("수임 관리에서 제거하시겠습니까?")) return;
    setLoadingId(id);
    await removeFromCommission(id);
    router.refresh();
    setLoadingId(null);
  }

  async function doRestore(id: number) {
    setLoadingId(id);
    await restoreCommission(id);
    router.refresh();
    setLoadingId(null);
  }

  async function doAdd(clientId: number) {
    await createCommission(clientId);
    setModal(null);
    setAddSearch("");
    router.refresh();
  }

  async function doBulkImport() {
    setImporting(true);
    const count = await bulkImportAllClients();
    router.refresh();
    setImporting(false);
    if (count > 0) alert(`${count}명의 고객이 신규수임 목록에 추가되었습니다.`);
  }

  async function doSaveNotes(id: number) {
    await saveNotes(id, notesValue);
    setModal(null);
    router.refresh();
  }

  async function doUploadIdCard(id: number, file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("commissionId", String(id));
      const res = await fetch("/api/commission/upload-idcard", {
        method: "POST",
        body: formData,
      });
      let data: { error?: string; path?: string } = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        alert(`업로드 실패: ${data.error ?? res.status}`);
        return;
      }
      console.log("[upload] res.ok:", res.ok, "data:", data);
      if (data.path) {
        console.log("[upload] setting localIdCards id:", id, "path:", data.path);
        setLocalIdCards((prev) => {
          const next = { ...prev, [id]: data.path! };
          console.log("[upload] new state:", next);
          return next;
        });
      }
      router.refresh();
    } catch (err) {
      alert(`업로드 오류: ${String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  async function doDeleteIdCard(id: number) {
    await deleteIdCard(id);
    setLocalIdCards((prev) => ({ ...prev, [id]: null }));
    router.refresh();
  }

  async function doAutoAction(
    clientId: number,
    action: "register" | "commission" | "recommission" | "commission-form"
  ) {
    setAutoLoading(action);
    setAutoResult(null);
    try {
      const res = await fetch(`/api/automation/commission/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        setAutoResult({ ok: false, msg: data.error ?? `오류 (${res.status})` });
        return;
      }

      // Chrome 확장 프로그램 방식
      if ((action === "register" || action === "commission" || action === "recommission") && data.agentId) {
        const isCorp = !!data.agentNumber;
        const payload: Record<string, string> = {
          mode: isCorp ? "corp_" + action : action,
          id: data.agentId,
          pw: data.agentPw,
          certName: data.certName,
          certPw: data.certPw,
        };
        if (isCorp) {
          payload.agentNumber = data.agentNumber;
          payload.agentPw = data.agentPw;
        }
        if (action === "register") {
          payload.clientType = data.clientType;
          payload.bizNumber = data.bizNumber;
          payload.residentNumber = data.residentNumber;
          payload.phone = data.phone;
        } else {
          const serverOrigin = window.location.origin;
          payload.residentNumber = data.residentNumber;
          payload.ceoName = data.ceoName;
          payload.agentIdCardUrl = data.agentIdCardPath ? `${serverOrigin}${data.agentIdCardPath}` : "";
          payload.clientIdCardUrl = data.clientIdCardPath ? `${serverOrigin}${data.clientIdCardPath}` : "";
          payload.pdfUrl = data.pdfPath ? `${serverOrigin}${data.pdfPath}` : "";
        }
        const creds = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=/g, "");
        window.open(
          `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
          "_blank"
        );
        const actionLabel = action === "register" ? "기장등록" : action === "commission" ? "기장수임" : "해지후수임";
        setAutoResult({ ok: true, msg: `홈택스에서 ${actionLabel} 자동 처리 중... 확인 후 신청 버튼을 눌러주세요` });
      } else {
        setAutoResult({ ok: true, msg: data.message ?? "완료", pdfPath: data.pdfPath });
      }
    } catch (err) {
      setAutoResult({ ok: false, msg: String(err) });
    } finally {
      setAutoLoading(null);
    }
  }

  async function doInsuranceDownload(clientId: number, type: string) {
    setAutoLoading(type);
    setAutoResult(null);
    try {
      const res = await fetch(`/api/automation/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAutoResult({ ok: false, msg: data.error ?? "오류 발생" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : `${type}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setAutoResult({ ok: true, msg: "PDF 다운로드 완료" });
    } catch (err) {
      setAutoResult({ ok: false, msg: String(err) });
    } finally {
      setAutoLoading(null);
    }
  }

  // Stage breakdown for stats
  const stageCounts = commissions.reduce(
    (acc, c) => {
      const s = getStage(c).label;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const filteredClients = availableClients.filter(
    (c) =>
      c.name.includes(addSearch) || (c.ceoName ?? "").includes(addSearch)
  );

  const RESULT_LABELS: Record<string, string> = {
    connected: "✓ 연결",
    no_answer: "부재중",
    callback: "콜백요청",
  };

  return (
    <div>
      {/* 기존 고객 가져오기 배너 */}
      {availableClients.length > 0 && (
        <div className="glass rounded-2xl px-4 py-3 mb-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, rgba(255,251,235,.85), rgba(254,243,199,.6))" }}>
          <div className="text-[13px] text-[#92400E]">
            <span className="font-extrabold">{availableClients.length}명</span>의 고객이 아직 수임 목록에 없습니다.
          </div>
          <button
            onClick={doBulkImport}
            disabled={importing}
            className="text-[13px] font-bold text-[#B45309] hover:text-[#78350F] underline disabled:opacity-50"
          >
            {importing ? "가져오는 중..." : "⤓ 전체 가져오기"}
          </button>
        </div>
      )}

      {/* 상단 통계 + 뷰 토글 + 추가 버튼 */}
      <div className="glass rounded-3xl p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={() => setStageFilter(null)}
              className={`rounded-2xl px-4 py-2 flex items-baseline gap-1.5 transition cursor-pointer ${
                stageFilter === null
                  ? "text-white bg-[#3182F6]"
                  : "glass-strong text-[#6B7684] hover:text-[#191F28]"
              }`}
            >
              <span className={`text-[11px] ${stageFilter === null ? "text-white/80" : "text-[#8B95A1]"}`}>전체</span>
              <span className={`text-[16px] font-bold ${stageFilter === null ? "text-white" : "text-[#191F28]"}`}>
                {commissions.length}
              </span>
              <span className={`text-[10px] ${stageFilter === null ? "text-white/60" : "text-[#8B95A1]"}`}>건</span>
            </button>
            {Object.entries(stageCounts).map(([label, count]) => (
              <button
                key={label}
                onClick={() => setStageFilter(stageFilter === label ? null : label)}
                className={`rounded-2xl px-3 py-2 flex items-baseline gap-1.5 transition cursor-pointer ${
                  stageFilter === label
                    ? "text-white bg-[#3182F6]"
                    : "glass-strong text-[#6B7684] hover:text-[#191F28]"
                }`}
              >
                <span className={`text-[11px] ${stageFilter === label ? "text-white/80" : "text-[#8B95A1]"}`}>{label}</span>
                <span className={`text-[13px] font-bold ${stageFilter === label ? "text-white" : "text-[#191F28]"}`}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* 뷰 토글 */}
            <div className="glass-strong rounded-2xl p-1 flex items-center gap-1">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors ${
                  viewMode === "table"
                    ? "text-white bg-[#3182F6]"
                    : "text-[#6B7684] hover:text-[#191F28]"
                }`}
              >
                테이블
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors ${
                  viewMode === "board"
                    ? "text-white bg-[#3182F6]"
                    : "text-[#6B7684] hover:text-[#191F28]"
                }`}
              >
                보드
              </button>
            </div>
            <button
              onClick={() => setModal("add")}
              className="bg-[#3182F6] text-white px-5 py-2.5 rounded-2xl text-[13px] font-bold hover:bg-[#1B64DA] transition-colors"
            >
              ＋ 수임 추가
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="mt-3">
          <div className="bg-white/80 rounded-2xl flex items-center gap-3 px-4 h-11 max-w-md">
            <svg width={16} height={16} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24">
              <circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="거래처명, 대표자, 사업자번호 검색…"
              className="flex-1 bg-transparent outline-none text-[13.5px] text-[#191F28] placeholder:text-[#8B95A1]"
            />
          </div>
        </div>
      </div>

      {/* 테이블 / 보드 뷰 */}
      {viewMode === "table" && (
      <div className="glass rounded-3xl overflow-hidden">
       <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/60 bg-white/50 backdrop-blur-md">
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[130px]">
                거래처
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[110px]">
                연락처
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[150px]">
                해피콜
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[150px]">
                서류
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[95px]">
                홈택스 수임
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[150px]">
                위하고
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[110px]">
                인건비
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[130px]">
                4대보험 EDI
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[110px]">
                현재 단계
              </th>
              <th className="px-4 py-3 text-center text-xs text-[#6B7684] font-medium min-w-[80px]">
                액션
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {(() => {
              const q = searchQuery.trim().toLowerCase();
              const filtered = commissions.filter((c) => {
                if (stageFilter && getStage(c).label !== stageFilter) return false;
                if (q && !c.client.name.toLowerCase().includes(q) && !(c.client.ceoName ?? "").toLowerCase().includes(q)) return false;
                return true;
              });
              return filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-14 text-center text-[#8B95A1] text-sm"
                >
                  {stageFilter
                    ? `'${stageFilter}' 상태의 수임이 없습니다.`
                    : <>진행 중인 수임이 없습니다.{" "}
                        <button
                          onClick={() => setModal("add")}
                          className="text-[#191F28] underline"
                        >
                          수임 추가
                        </button>
                        를 눌러 시작하세요.
                      </>
                  }
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const stage = getStage(c);
                const loading = loadingId === c.id;
                const lastCall =
                  c.happyCalls[c.happyCalls.length - 1] ?? null;

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-white/60 transition-colors ${
                      loading ? "opacity-60" : ""
                    }`}
                  >
                    {/* 거래처 */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setAutoResult(null); setModal({ type: "idcard", id: c.id, clientId: c.client.id, clientName: c.client.name }); setEditingClientId(c.client.id); }}
                        className="font-medium text-[#191F28] hover:text-[#191F28] hover:underline flex items-center gap-1 mx-auto"
                      >
                        {c.client.name}
                        {(c.id in localIdCards ? localIdCards[c.id] : c.idCardPath) ? (
                          <span className="text-[#1AB266] text-xs">📄</span>
                        ) : (
                          <span className="text-[#B0B8C1] text-xs">📄</span>
                        )}
                      </button>
                      {c.client.ceoName && (
                        <div className="text-xs text-[#8B95A1]">
                          {c.client.ceoName}
                        </div>
                      )}
                      <div className="text-xs text-[#B0B8C1] mt-0.5">
                        {c.client.assignedUser && <span className="text-[#3182F6] mr-1">{c.client.assignedUser.name}</span>}
                        {fmtDate(c.createdAt)} 등록
                      </div>
                    </td>

                    {/* 연락처 */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-[#4E5968]">
                        {c.client.phone || "-"}
                      </span>
                    </td>

                    {/* 해피콜 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1.5 items-center">
                        {c.happyCalls.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setModal({ type: "happycall-history", id: c.id, clientName: c.client.name, calls: c.happyCalls })}
                            className="text-xs text-[#6B7684] leading-relaxed text-left hover:bg-[#F9FAFB] rounded px-1.5 py-1 -mx-1.5 transition-colors"
                          >
                            <span className="font-bold text-[#333D4B]">
                              {c.happyCalls.length}차
                            </span>
                            {" · "}
                            {RESULT_LABELS[lastCall!.result] ?? lastCall!.result}
                            <br />
                            <span className="text-[#8B95A1]">
                              {fmtDate(lastCall!.calledAt)}
                            </span>
                            {lastCall?.notes && (
                              <div className="text-[#8B95A1] truncate max-w-[120px]">
                                {lastCall.notes}
                              </div>
                            )}
                          </button>
                        ) : (
                          <div className="text-xs text-[#B0B8C1]">
                            기록 없음
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setModal({ type: "happycall", id: c.id });
                            setCallResult("no_answer");
                            setCallNotes("");
                          }}
                          disabled={loading}
                          className="text-xs text-[#191F28] hover:underline"
                        >
                          + 해피콜 기록
                        </button>
                      </div>
                    </td>

                    {/* 서류 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1.5 items-center">
                        <Pill
                          checked={c.hasIdCard}
                          label="신분증"
                          onClick={() =>
                            doToggle(c.id, "hasIdCard", !c.hasIdCard)
                          }
                          disabled={loading}
                        />
                        <Pill
                          checked={c.hasHometaxCredentials}
                          label="홈택스 정보"
                          onClick={() =>
                            doToggle(
                              c.id,
                              "hasHometaxCredentials",
                              !c.hasHometaxCredentials
                            )
                          }
                          disabled={loading}
                        />
                      </div>
                    </td>

                    {/* 홈택스 수임 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1 items-center">
                        <Pill
                          checked={c.hometaxCommissionDone}
                          label="수임완료"
                          onClick={() =>
                            doToggle(
                              c.id,
                              "hometaxCommissionDone",
                              !c.hometaxCommissionDone
                            )
                          }
                          disabled={loading}
                        />
                        {c.hometaxCommissionAt && (
                          <div className="text-xs text-[#8B95A1]">
                            {fmtDate(c.hometaxCommissionAt)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 위하고 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1.5 items-center">
                        <select
                          value={c.wihagoType ?? ""}
                          onChange={(e) =>
                            doSetWihagoType(c.id, e.target.value || null)
                          }
                          disabled={loading}
                          className="text-xs border border-[#E5E8EB] rounded-md px-2 py-1 text-[#4E5968] focus:outline-none focus:ring-1 focus:ring-[#3182F6] bg-white"
                        >
                          <option value="">유형 선택</option>
                          <option value="new">신규</option>
                          <option value="transfer">이관</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <Pill
                            checked={c.wihagoDone}
                            label="생성완료"
                            onClick={() =>
                              doToggle(c.id, "wihagoDone", !c.wihagoDone)
                            }
                            disabled={loading}
                          />
                          {!c.wihagoDone && (
                            wehagoProgress?.id === c.id ? (
                              <div className="flex items-center gap-1 text-[9px] text-[#3182F6]">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="whitespace-nowrap">{wehagoProgress.step}</span>
                              </div>
                            ) : (
                              <button
                                onClick={async () => {
                                  if (!confirm(`"${c.client.name}" 위하고 수임처를 자동 생성하시겠습니까?`)) return;
                                  setWehagoProgress({ id: c.id, step: "준비 중..." });
                                  try {
                                    const res = await fetch("/api/wehago/create-client", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ clientId: c.clientId }),
                                    });
                                    if (!res.ok) {
                                      const err = await res.json();
                                      throw new Error(err.error || "요청 실패");
                                    }
                                    const reader = res.body?.getReader();
                                    if (!reader) throw new Error("스트림 없음");
                                    const decoder = new TextDecoder();
                                    let buf = "";
                                    let finalResult: { success?: boolean; message?: string } = {};
                                    while (true) {
                                      const { done, value } = await reader.read();
                                      if (done) break;
                                      buf += decoder.decode(value, { stream: true });
                                      const lines = buf.split("\n\n");
                                      buf = lines.pop() || "";
                                      for (const line of lines) {
                                        const match = line.match(/^data: (.+)$/m);
                                        if (!match) continue;
                                        const ev = JSON.parse(match[1]);
                                        if (ev.type === "progress") {
                                          setWehagoProgress({ id: c.id, step: ev.step });
                                        } else if (ev.type === "done") {
                                          finalResult = ev;
                                        }
                                      }
                                    }
                                    setWehagoProgress(null);
                                    const msg = finalResult.message || "완료";
                                    alert(msg);
                                    if (finalResult.success) doToggle(c.id, "wihagoDone", true);
                                  } catch (err) {
                                    setWehagoProgress(null);
                                    const errMsg = String(err);
                                    if (errMsg.includes("network") || errMsg.includes("abort") || errMsg.includes("TypeError")) {
                                      alert("위하고 자동생성이 진행 중이거나 완료되었을 수 있습니다. 위하고에서 직접 확인해주세요.");
                                    } else {
                                      alert("위하고 자동생성 실패: " + errMsg);
                                    }
                                  }
                                }}
                                disabled={loading || wehagoProgress !== null}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-[#F5F9FF] text-[#3182F6] hover:bg-[#E8F3FF] border border-[#A3CAFD] disabled:opacity-50 whitespace-nowrap"
                              >
                                자동
                              </button>
                            )
                          )}
                        </div>
                        {c.wihagoAt && (
                          <div className="text-xs text-[#8B95A1]">
                            {fmtDate(c.wihagoAt)}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 인건비 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(() => {
                          const types = (c.client.laborTypes ?? "").split(",").map(t => t.trim());
                          const tags = [
                            types.includes("근로소득") && (
                              <span key="근로소득" className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#DC2626]">근로소득</span>
                            ),
                            types.includes("일용직") && (
                              <span key="일용직" className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#E7F7EE] text-[#16A865]">일용직</span>
                            ),
                          ].filter(Boolean);
                          return tags.length > 0 ? tags : <span className="text-xs text-[#B0B8C1]">-</span>;
                        })()}
                      </div>
                    </td>

                    {/* 4대보험 EDI */}
                    <td className="px-4 py-3 text-center">
                      {(c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득") ? (
                        <div className="flex flex-col gap-1.5 items-center">
                          <Pill
                            checked={c.nationalPensionDone}
                            label="국민연금"
                            onClick={() => doToggle(c.id, "nationalPensionDone", !c.nationalPensionDone)}
                            disabled={loading}
                          />
                          {c.nationalPensionAt && (
                            <div className="text-xs text-[#8B95A1]">{fmtDate(c.nationalPensionAt)}</div>
                          )}
                          <Pill
                            checked={c.healthInsuranceDone}
                            label="건강보험"
                            onClick={() => doToggle(c.id, "healthInsuranceDone", !c.healthInsuranceDone)}
                            disabled={loading}
                          />
                          {c.healthInsuranceAt && (
                            <div className="text-xs text-[#8B95A1]">{fmtDate(c.healthInsuranceAt)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#B0B8C1]">-</span>
                      )}
                    </td>

                    {/* 현재 단계 */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${stage.cls}`}
                      >
                        {stage.label}
                      </span>
                    </td>

                    {/* 액션 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1.5 items-center">
                        <button
                          onClick={() => {
                            setModal({ type: "notes", id: c.id });
                            setNotesValue(c.notes ?? "");
                          }}
                          className="text-xs text-[#8B95A1] hover:text-[#333D4B] transition-colors"
                        >
                          {c.notes ? "📝 메모" : "📝 메모 추가"}
                        </button>
                        <button
                          onClick={() => doMarkComplete(c.id)}
                          disabled={loading}
                          className="text-xs text-[#16A865] hover:text-[#15803D] font-medium transition-colors"
                        >
                          ✓ 완료처리
                        </button>
                        <button
                          onClick={() => doRemove(c.id)}
                          disabled={loading}
                          className="text-xs text-[#B0B8C1] hover:text-[#F87171] transition-colors"
                        >
                          제거
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            );
            })()}
          </tbody>
        </table>
       </div>
      </div>
      )}

      {/* ── 보드 뷰 ── */}
      {viewMode === "board" && (() => {
        const q = searchQuery.trim().toLowerCase();
        const filtered = commissions.filter((c) => {
          if (q && !c.client.name.toLowerCase().includes(q) && !(c.client.ceoName ?? "").toLowerCase().includes(q)) return false;
          return true;
        });
        const STAGES: { key: string; label: string; dot: string }[] = [
          { key: "해피콜 대기",   label: "해피콜 대기",   dot: "bg-[#8B95A1]" },
          { key: "서류수집 중",   label: "서류수집 중",   dot: "bg-[#92400E]" },
          { key: "수임 대기",     label: "홈택스 수임",   dot: "bg-[#3182F6]" },
          { key: "위하고 대기",   label: "위하고 등록",   dot: "bg-[#6D28D9]" },
          { key: "EDI 대기",      label: "EDI 대기",      dot: "bg-[#92400E]" },
          { key: "완료처리 필요", label: "완료처리 필요", dot: "bg-[#15803D]" },
        ];
        const grouped: Record<string, CommissionData[]> = {};
        STAGES.forEach(s => grouped[s.key] = []);
        filtered.forEach(c => {
          const lbl = getStage(c).label;
          if (grouped[lbl]) grouped[lbl].push(c);
          else (grouped["완료처리 필요"] ??= []).push(c);
        });
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map(stage => {
              const items = grouped[stage.key] ?? [];
              return (
                <div key={stage.key} className="glass rounded-2xl p-3 flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between px-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className="text-[12px] font-bold text-[#191F28]">{stage.label}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-[#6B7684]">{items.length}</span>
                  </div>
                  <div className="space-y-2 flex-1">
                    {items.length === 0 && (
                      <div className="text-[11px] text-[#B0B8C1] text-center py-6">없음</div>
                    )}
                    {items.map(c => {
                      const lastCall = c.happyCalls[c.happyCalls.length - 1] ?? null;
                      const hasWage = (c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득");
                      return (
                        <div key={c.id} className="glass-strong rounded-xl p-2.5">
                          <button
                            onClick={() => { setAutoResult(null); setModal({ type: "idcard", id: c.id, clientId: c.client.id, clientName: c.client.name }); setEditingClientId(c.client.id); }}
                            className="font-bold text-[12.5px] text-[#191F28] hover:underline text-left w-full truncate flex items-center gap-1"
                          >
                            {c.client.name}
                            {(c.id in localIdCards ? localIdCards[c.id] : c.idCardPath)
                              ? <span className="text-[#1AB266] text-[10px]">📄</span>
                              : <span className="text-[#B0B8C1] text-[10px]">📄</span>}
                          </button>
                          {c.client.ceoName && <div className="text-[10.5px] text-[#6B7684] truncate">{c.client.ceoName}{c.client.phone ? ` · ${c.client.phone}` : ""}</div>}
                          {c.client.assignedUser && (
                            <div className="text-[10px] text-[#3182F6] mt-0.5">{c.client.assignedUser.name}</div>
                          )}

                          {/* 단계별 내부 액션 */}
                          {stage.key === "해피콜 대기" && (
                            <div className="mt-2 flex flex-col gap-1">
                              <button
                                onClick={() => { setModal({ type: "happycall", id: c.id }); setCallResult("no_answer"); setCallNotes(""); }}
                                className="w-full text-[10.5px] py-1 rounded-lg bg-[#E8F3FF] text-[#1B64DA] font-bold hover:bg-[#D6E9FF]"
                              >
                                ＋ 해피콜 기록
                              </button>
                              <button
                                onClick={() => doMarkComplete(c.id)}
                                disabled={loadingId === c.id}
                                className="w-full text-[10.5px] py-1 rounded-lg bg-[#F1FBF4] text-[#15803D] font-bold hover:bg-[#DCFCE7] border border-[#BBF7D0] disabled:opacity-50"
                              >
                                ⚡ 즉시완료
                              </button>
                            </div>
                          )}
                          {stage.key === "서류수집 중" && (
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              <Pill checked={c.hasIdCard} label="신분증" onClick={() => doToggle(c.id, "hasIdCard", !c.hasIdCard)} disabled={loadingId === c.id} />
                              <Pill checked={c.hasHometaxCredentials} label="홈택스" onClick={() => doToggle(c.id, "hasHometaxCredentials", !c.hasHometaxCredentials)} disabled={loadingId === c.id} />
                            </div>
                          )}
                          {stage.key === "수임 대기" && (
                            <button
                              onClick={() => doToggle(c.id, "hometaxCommissionDone", true)}
                              disabled={loadingId === c.id}
                              className="mt-2 w-full text-[10.5px] py-1 rounded-lg bg-[#3182F6] text-white font-bold hover:bg-[#1B64DA]"
                            >
                              ✓ 수임완료
                            </button>
                          )}
                          {stage.key === "위하고 대기" && (
                            <div className="mt-2 flex flex-col gap-1">
                              <select
                                value={c.wihagoType ?? ""}
                                onChange={(e) => doSetWihagoType(c.id, e.target.value || null)}
                                disabled={loadingId === c.id}
                                className="text-[10.5px] border border-[#E5E8EB] rounded-md px-1.5 py-0.5 text-[#4E5968] bg-white"
                              >
                                <option value="">유형</option>
                                <option value="new">신규</option>
                                <option value="transfer">이관</option>
                              </select>
                              <Pill checked={c.wihagoDone} label="생성완료" onClick={() => doToggle(c.id, "wihagoDone", !c.wihagoDone)} disabled={loadingId === c.id} />
                            </div>
                          )}
                          {stage.key === "EDI 대기" && hasWage && (
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              <Pill checked={c.nationalPensionDone} label="국민연금" onClick={() => doToggle(c.id, "nationalPensionDone", !c.nationalPensionDone)} disabled={loadingId === c.id} />
                              <Pill checked={c.healthInsuranceDone} label="건강보험" onClick={() => doToggle(c.id, "healthInsuranceDone", !c.healthInsuranceDone)} disabled={loadingId === c.id} />
                            </div>
                          )}
                          {stage.key === "완료처리 필요" && (
                            <button
                              onClick={() => doMarkComplete(c.id)}
                              disabled={loadingId === c.id}
                              className="mt-2 w-full text-[10.5px] py-1.5 rounded-lg bg-[#15803D] text-white font-bold hover:bg-[#166534] transition-colors"
                            >
                              ✓ 완료처리
                            </button>
                          )}

                          {lastCall && stage.key !== "해피콜 대기" && (
                            <div className="text-[9.5px] text-[#8B95A1] mt-1 truncate">
                              해피콜 {c.happyCalls.length}차 · {fmtDate(lastCall.calledAt)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── 완료된 수임 ── */}
      {completed.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-sm text-[#6B7684] hover:text-[#333D4B] mb-3"
          >
            <span>{showCompleted ? "▾" : "▸"}</span>
            <span>완료된 수임 ({completed.length}건)</span>
          </button>

          {showCompleted && (
            <div className="glass rounded-3xl overflow-x-auto opacity-90">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/60 bg-white/50 backdrop-blur-md">
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">거래처</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">완료일</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">해피콜</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">위하고</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">인건비</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">EDI</th>
                    <th className="px-4 py-2.5 text-center text-xs text-[#8B95A1] font-medium">다시 진행</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {completed.map((c) => (
                    <tr key={c.id} className="hover:bg-white/60">
                      <td className="px-4 py-2.5 text-center">
                        <div className="font-medium text-[#4E5968]">{c.client.name}</div>
                        {c.client.ceoName && (
                          <div className="text-xs text-[#8B95A1]">{c.client.ceoName}</div>
                        )}
                        {c.client.assignedUser && (
                          <div className="text-[10px] text-[#3182F6]">{c.client.assignedUser.name}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#6B7684] text-center">
                        {fmtDate(c.completedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#6B7684] text-center">
                        {c.happyCalls.length}차
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#6B7684] text-center">
                        {c.wihagoType === "new" ? "신규" : c.wihagoType === "transfer" ? "이관" : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(() => {
                            const types = (c.client.laborTypes ?? "").split(",").map(t => t.trim());
                            const tags = [
                              types.includes("근로소득") && (
                                <span key="근로소득" className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#DC2626]">근로소득</span>
                              ),
                              types.includes("일용직") && (
                                <span key="일용직" className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#E7F7EE] text-[#16A865]">일용직</span>
                              ),
                            ].filter(Boolean);
                            return tags.length > 0 ? tags : <span className="text-xs text-[#B0B8C1]">-</span>;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {(c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득") ? (
                          <div className="flex flex-col gap-0.5 items-center text-xs">
                            <span className={c.nationalPensionDone ? "text-[#6B7684]" : "text-[#D97706]"}>
                              국민연금 {c.nationalPensionDone ? "✓" : "미완료"}
                            </span>
                            <span className={c.healthInsuranceDone ? "text-[#6B7684]" : "text-[#D97706]"}>
                              건강보험 {c.healthInsuranceDone ? "✓" : "미완료"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#B0B8C1]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => doRestore(c.id)}
                          disabled={loadingId === c.id}
                          className="text-xs text-[#60A5FA] hover:text-[#3182F6] font-medium transition-colors disabled:opacity-50"
                        >
                          ↩ 진행중으로
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 해피콜 이력 모달 ── */}
      {modal && typeof modal === "object" && "type" in modal && modal.type === "happycall-history" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-96 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#191F28]">해피콜 이력</h3>
                <p className="text-xs text-[#8B95A1]">{modal.clientName}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-[#8B95A1] hover:text-[#4E5968] text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {modal.calls.map((call, i) => (
                <div key={call.id} className="border border-[#F2F4F6] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-[#191F28]">{call.attemptNo}차</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      call.result === "connected" ? "bg-[#E7F7EE] text-[#15803D]" :
                      call.result === "callback" ? "bg-[#FEF3C7] text-[#B45309]" :
                      "bg-[#F2F4F6] text-[#4E5968]"
                    }`}>
                      {RESULT_LABELS[call.result] ?? call.result}
                    </span>
                    <span className="text-[10px] text-[#8B95A1] ml-auto">{fmtDate(call.calledAt)}</span>
                  </div>
                  {call.notes && (
                    <p className="text-sm text-[#333D4B] whitespace-pre-wrap">{call.notes}</p>
                  )}
                  {!call.notes && (
                    <p className="text-xs text-[#B0B8C1]">메모 없음</p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setModal(null)}
              className="mt-4 w-full py-2 rounded-lg text-sm text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ── 해피콜 기록 모달 ── */}
      {modal !== null &&
        typeof modal === "object" &&
        modal.type === "happycall" && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-xl p-6 w-80 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-[#191F28] mb-4">해피콜 기록</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#6B7684] mb-2 block">
                    통화 결과
                  </label>
                  <div className="flex gap-2">
                    {[
                      { v: "connected", l: "✓ 연결" },
                      { v: "no_answer", l: "부재중" },
                      { v: "callback", l: "콜백요청" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setCallResult(o.v)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                          callResult === o.v
                            ? "bg-[#3182F6] text-white"
                            : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#6B7684] mb-2 block">
                    메모 (선택)
                  </label>
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6] resize-none"
                    placeholder="요청사항, 특이사항 등..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 py-2 rounded-lg text-sm text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => doHappyCall(modal.id)}
                    className="flex-1 py-2 rounded-lg text-sm text-white bg-[#3182F6] hover:bg-[#1B64DA] font-medium"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ── 메모 모달 ── */}
      {modal !== null &&
        typeof modal === "object" &&
        modal.type === "notes" && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-xl p-6 w-80 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-[#191F28] mb-4">메모</h3>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6] resize-none"
                placeholder="특이사항, 요청사항, 진행 내용 등..."
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 py-2 rounded-lg text-sm text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]"
                >
                  취소
                </button>
                <button
                  onClick={() => doSaveNotes(modal.id)}
                  className="flex-1 py-2 rounded-lg text-sm text-white bg-[#3182F6] hover:bg-[#1B64DA] font-medium"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ── 신분증 업로드 모달 ── */}
      {modal !== null && typeof modal === "object" && modal.type === "idcard" && (() => {
        const commission = commissions.find((c) => c.id === modal.id);
        const currentPath = modal.id in localIdCards
          ? localIdCards[modal.id]
          : (commission?.idCardPath ?? null);
        const isImage = currentPath ? /\.(jpg|jpeg|png|gif|webp)$/i.test(currentPath) : false;
        return (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-xl p-6 w-96 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-[#191F28] mb-0.5">대표자 신분증</h3>
              <p className="text-xs text-[#8B95A1] mb-4">{modal.clientName}</p>

              {currentPath && (
                <div className="mb-4">
                  {isImage && (
                    <img
                      src={currentPath}
                      alt="신분증"
                      className="w-full rounded-lg mb-2 max-h-52 object-contain bg-[#F9FAFB]"
                    />
                  )}
                  <div className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-3 py-2">
                    <a
                      href={currentPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#3182F6] hover:underline truncate max-w-[240px]"
                    >
                      📄 파일 보기
                    </a>
                    <button
                      onClick={() => doDeleteIdCard(modal.id)}
                      className="text-xs text-[#F87171] hover:text-[#DC2626] ml-3 shrink-0"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) doUploadIdCard(modal.id, file);
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of Array.from(items)) {
                    if (item.type.startsWith("image/")) {
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (file) doUploadIdCard(modal.id, file);
                      break;
                    }
                  }
                }}
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors outline-none ${
                  dragOver
                    ? "border-[#3182F6] bg-[#F5F9FF]"
                    : "border-[#E5E8EB] hover:border-[#D1D6DB] hover:bg-[#F9FAFB] focus:border-blue-300 focus:bg-[#F5F9FF]/30"
                }`}
              >
                {uploading ? (
                  <div className="text-sm text-[#6B7684]">업로드 중...</div>
                ) : (
                  <>
                    <div className="text-2xl mb-2">📎</div>
                    <div className="text-sm text-[#6B7684]">
                      {currentPath ? "새 파일로 교체" : "파일을 끌어다 놓거나 클릭"}
                    </div>
                    <div className="text-xs text-[#8B95A1] mt-1">드래그 · 클릭 · Ctrl+V 붙여넣기</div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) doUploadIdCard(modal.id, file);
                  e.target.value = "";
                }}
              />

              {/* 홈택스수임신청서 */}
              <div className="mt-4 pt-4 border-t border-[#F2F4F6]">
                <div className="text-xs text-[#8B95A1] mb-2">서류 출력</div>
                <button
                  onClick={() => doAutoAction(modal.clientId, "commission-form")}
                  disabled={autoLoading !== null}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition-colors mb-2 ${
                    autoLoading === "commission-form"
                      ? "bg-[#3182F6] text-white opacity-70"
                      : "bg-[#F5F9FF] text-[#3182F6] hover:bg-[#E8F3FF] border border-[#A3CAFD]"
                  } disabled:cursor-not-allowed`}
                >
                  {autoLoading === "commission-form" ? "생성 중..." : "📄 홈택스수임신청서 PDF"}
                </button>
              </div>

              {/* 홈택스 */}
              <div className="pt-3 border-t border-[#F2F4F6]">
                <div className="text-xs text-[#8B95A1] mb-2">홈택스</div>
                <div className="flex gap-2">
                  {(
                    [
                      { key: "register", label: "기장 등록" },
                      { key: "commission", label: "기장 수임" },
                      { key: "recommission", label: "해지 후 수임" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => doAutoAction(modal.clientId, key)}
                      disabled={autoLoading !== null}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        autoLoading === key
                          ? "bg-[#3182F6] text-white opacity-70"
                          : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
                      } disabled:cursor-not-allowed`}
                    >
                      {autoLoading === key ? "실행 중..." : label}
                    </button>
                  ))}
                </div>
                {autoResult && (
                  <div
                    className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                      autoResult.ok
                        ? "bg-[#F1FBF4] text-[#15803D]"
                        : "bg-[#FEF2F2] text-[#DC2626]"
                    }`}
                  >
                    {autoResult.ok ? "✓ " : "✕ "}
                    {autoResult.msg}
                    {autoResult.pdfPath && (
                      <a
                        href={autoResult.pdfPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-1 underline font-medium"
                      >
                        📄 PDF 열기
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* 4대보험 */}
              <div className="pt-3 border-t border-[#F2F4F6]">
                <div className="text-xs text-[#8B95A1] mb-2">4대보험</div>
                <div className="flex gap-2">
                  {(
                    [
                      { key: "pension", label: "국민연금", enabled: true },
                      { key: "health", label: "건강보험", enabled: true },
                      { key: "employment", label: "고용산재", enabled: false },
                    ] as { key: string; label: string; enabled: boolean }[]
                  ).map(({ key, label, enabled }) => (
                    <button
                      key={key}
                      onClick={enabled ? () => doInsuranceDownload(modal.clientId, key) : undefined}
                      disabled={!enabled || autoLoading !== null}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        autoLoading === key
                          ? "bg-[#3182F6] text-white opacity-70"
                          : enabled
                            ? "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
                            : "bg-[#F2F4F6] text-[#8B95A1] cursor-not-allowed"
                      } disabled:cursor-not-allowed`}
                    >
                      {autoLoading === key ? "생성 중..." : label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setModal(null)}
                className="mt-3 w-full py-2 rounded-lg text-sm text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]"
              >
                닫기
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── 수임 추가 모달 ── */}
      {modal === "add" && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => {
            setModal(null);
            setAddSearch("");
          }}
        >
          <div
            className="bg-white rounded-xl p-6 w-96 max-h-[70vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-[#191F28] mb-3">수임 추가</h3>
            <input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="거래처명 또는 대표자명 검색..."
              autoFocus
              className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6] mb-3"
            />
            <div className="overflow-y-auto flex-1 -mx-1">
              {filteredClients.length === 0 ? (
                <div className="text-center text-[#8B95A1] text-sm py-8">
                  {availableClients.length === 0
                    ? "모든 고객사가 수임 관리 중입니다"
                    : "검색 결과 없음"}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => doAdd(client.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#F9FAFB] flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm font-medium text-[#191F28]">
                        {client.name}
                      </div>
                      {client.ceoName && (
                        <div className="text-xs text-[#8B95A1]">
                          {client.ceoName}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-[#191F28] opacity-0 group-hover:opacity-100 transition-opacity">
                      추가 →
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => {
                setModal(null);
                setAddSearch("");
              }}
              className="mt-3 w-full py-2 rounded-lg text-sm text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {editingClientId && (
        <ClientEditModal
          clientId={editingClientId}
          onClose={() => setEditingClientId(null)}
        />
      )}
    </div>
  );
}
