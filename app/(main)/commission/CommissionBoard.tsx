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
    return { label: "완료", cls: "bg-green-100 text-green-700" };
  if (c.happyCalls.length === 0)
    return { label: "해피콜 대기", cls: "bg-gray-100 text-gray-500" };
  if (!c.hasIdCard || !c.hasHometaxCredentials)
    return { label: "서류수집 중", cls: "bg-yellow-100 text-yellow-700" };
  if (!c.hometaxCommissionDone)
    return { label: "수임 대기", cls: "bg-blue-100 text-blue-700" };
  if (!c.wihagoDone)
    return { label: "위하고 대기", cls: "bg-violet-100 text-violet-700" };
  const hasWage = (c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득");
  if (hasWage && (!c.nationalPensionDone || !c.healthInsuranceDone))
    return { label: "EDI 대기", cls: "bg-orange-100 text-orange-700" };
  return {
    label: "완료처리 필요",
    cls: "bg-green-50 text-green-600 border border-green-200",
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
          ? "bg-[#1a2e4a] text-white"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
        const payload: Record<string, string> = {
          mode: action,
          id: data.agentId,
          pw: data.agentPw,
          certName: data.certName,
          certPw: data.certPw,
        };
        if (action === "register") {
          payload.clientType = data.clientType;
          payload.bizNumber = data.bizNumber;
          payload.residentNumber = data.residentNumber;
          payload.phone = data.phone;
        } else {
          payload.residentNumber = data.residentNumber;
          payload.ceoName = data.ceoName;
          payload.agentIdCardUrl = data.agentIdCardUrl ?? "";
          payload.clientIdCardUrl = data.clientIdCardUrl ?? "";
          payload.pdfUrl = data.pdfUrl ?? "";
        }
        const creds = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        window.open(
          `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
          "_blank"
        );
        const actionLabel = action === "register" ? "기장등록" : action === "commission" ? "기장수임" : "해지후수임";
        setAutoResult({ ok: true, msg: `홈택스에서 ${actionLabel} 자동 입력 중... 확인 후 신청 버튼을 눌러주세요` });
      } else {
        setAutoResult({ ok: true, msg: data.message ?? "완료", pdfPath: data.pdfPath });
      }
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
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="text-sm text-amber-800">
            <span className="font-medium">{availableClients.length}명</span>의 고객이 아직 수임 목록에 없습니다.
          </div>
          <button
            onClick={doBulkImport}
            disabled={importing}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
          >
            {importing ? "가져오는 중..." : "전체 가져오기"}
          </button>
        </div>
      )}

      {/* 상단 통계 + 추가 버튼 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <div className="bg-white rounded-lg px-4 py-2.5 border border-gray-100 shadow-sm flex items-baseline gap-1.5">
            <span className="text-xs text-gray-500">진행 중</span>
            <span className="text-xl font-bold text-[#1a2e4a]">
              {commissions.length}
            </span>
            <span className="text-xs text-gray-400">건</span>
          </div>
          {Object.entries(stageCounts).map(([label, count]) => (
            <div
              key={label}
              className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 shadow-sm flex items-baseline gap-1.5"
            >
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-sm font-bold text-gray-700">{count}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setModal("add")}
          className="bg-[#1a2e4a] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#243d61] transition-colors"
        >
          + 수임 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[130px]">
                거래처
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[110px]">
                연락처
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[150px]">
                해피콜
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[150px]">
                서류
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[95px]">
                홈택스 수임
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[150px]">
                위하고
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[110px]">
                인건비
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[130px]">
                4대보험 EDI
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[110px]">
                현재 단계
              </th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium min-w-[80px]">
                액션
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {commissions.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-14 text-center text-gray-400 text-sm"
                >
                  진행 중인 수임이 없습니다.{" "}
                  <button
                    onClick={() => setModal("add")}
                    className="text-[#1a2e4a] underline"
                  >
                    수임 추가
                  </button>
                  를 눌러 시작하세요.
                </td>
              </tr>
            ) : (
              commissions.map((c) => {
                const stage = getStage(c);
                const loading = loadingId === c.id;
                const lastCall =
                  c.happyCalls[c.happyCalls.length - 1] ?? null;

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-gray-50/40 transition-colors ${
                      loading ? "opacity-60" : ""
                    }`}
                  >
                    {/* 거래처 */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setAutoResult(null); setModal({ type: "idcard", id: c.id, clientId: c.client.id, clientName: c.client.name }); }}
                        className="font-medium text-gray-800 hover:text-[#1a2e4a] hover:underline flex items-center gap-1 mx-auto"
                      >
                        {c.client.name}
                        {(c.id in localIdCards ? localIdCards[c.id] : c.idCardPath) ? (
                          <span className="text-green-500 text-xs">📄</span>
                        ) : (
                          <span className="text-gray-300 text-xs">📄</span>
                        )}
                      </button>
                      {c.client.ceoName && (
                        <div className="text-xs text-gray-400">
                          {c.client.ceoName}
                        </div>
                      )}
                      <div className="text-xs text-gray-300 mt-0.5">
                        {fmtDate(c.createdAt)} 등록
                      </div>
                    </td>

                    {/* 연락처 */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-600">
                        {c.client.phone || "-"}
                      </span>
                    </td>

                    {/* 해피콜 */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1.5 items-center">
                        {c.happyCalls.length > 0 ? (
                          <div className="text-xs text-gray-500 leading-relaxed">
                            <span className="font-semibold text-gray-700">
                              {c.happyCalls.length}차
                            </span>
                            {" · "}
                            {RESULT_LABELS[lastCall!.result] ?? lastCall!.result}
                            <br />
                            <span className="text-gray-400">
                              {fmtDate(lastCall!.calledAt)}
                            </span>
                            {lastCall?.notes && (
                              <div className="text-gray-400 truncate max-w-[120px]">
                                {lastCall.notes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-300">
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
                          className="text-xs text-[#1a2e4a] hover:underline"
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
                          <div className="text-xs text-gray-400">
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
                          className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1a2e4a] bg-white"
                        >
                          <option value="">유형 선택</option>
                          <option value="new">신규</option>
                          <option value="transfer">이관</option>
                        </select>
                        <Pill
                          checked={c.wihagoDone}
                          label="생성완료"
                          onClick={() =>
                            doToggle(c.id, "wihagoDone", !c.wihagoDone)
                          }
                          disabled={loading}
                        />
                        {c.wihagoAt && (
                          <div className="text-xs text-gray-400">
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
                              <span key="근로소득" className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">근로소득</span>
                            ),
                            types.includes("일용직") && (
                              <span key="일용직" className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">일용직</span>
                            ),
                          ].filter(Boolean);
                          return tags.length > 0 ? tags : <span className="text-xs text-gray-300">-</span>;
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
                            <div className="text-xs text-gray-400">{fmtDate(c.nationalPensionAt)}</div>
                          )}
                          <Pill
                            checked={c.healthInsuranceDone}
                            label="건강보험"
                            onClick={() => doToggle(c.id, "healthInsuranceDone", !c.healthInsuranceDone)}
                            disabled={loading}
                          />
                          {c.healthInsuranceAt && (
                            <div className="text-xs text-gray-400">{fmtDate(c.healthInsuranceAt)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
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
                          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {c.notes ? "📝 메모" : "📝 메모 추가"}
                        </button>
                        <button
                          onClick={() => doMarkComplete(c.id)}
                          disabled={loading}
                          className="text-xs text-green-600 hover:text-green-700 font-medium transition-colors"
                        >
                          ✓ 완료처리
                        </button>
                        <button
                          onClick={() => doRemove(c.id)}
                          disabled={loading}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                        >
                          제거
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 완료된 수임 ── */}
      {completed.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <span>{showCompleted ? "▾" : "▸"}</span>
            <span>완료된 수임 ({completed.length}건)</span>
          </button>

          {showCompleted && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto opacity-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">거래처</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">완료일</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">해피콜</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">위하고</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">인건비</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">EDI</th>
                    <th className="px-4 py-2.5 text-center text-xs text-gray-400 font-medium">다시 진행</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {completed.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/40">
                      <td className="px-4 py-2.5 text-center">
                        <div className="font-medium text-gray-600">{c.client.name}</div>
                        {c.client.ceoName && (
                          <div className="text-xs text-gray-400">{c.client.ceoName}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 text-center">
                        {fmtDate(c.completedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 text-center">
                        {c.happyCalls.length}차
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 text-center">
                        {c.wihagoType === "new" ? "신규" : c.wihagoType === "transfer" ? "이관" : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(() => {
                            const types = (c.client.laborTypes ?? "").split(",").map(t => t.trim());
                            const tags = [
                              types.includes("근로소득") && (
                                <span key="근로소득" className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">근로소득</span>
                              ),
                              types.includes("일용직") && (
                                <span key="일용직" className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">일용직</span>
                              ),
                            ].filter(Boolean);
                            return tags.length > 0 ? tags : <span className="text-xs text-gray-300">-</span>;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {(c.client.laborTypes ?? "").split(",").map(t => t.trim()).includes("근로소득") ? (
                          <div className="flex flex-col gap-0.5 items-center text-xs">
                            <span className={c.nationalPensionDone ? "text-gray-500" : "text-orange-400"}>
                              국민연금 {c.nationalPensionDone ? "✓" : "미완료"}
                            </span>
                            <span className={c.healthInsuranceDone ? "text-gray-500" : "text-orange-400"}>
                              건강보험 {c.healthInsuranceDone ? "✓" : "미완료"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => doRestore(c.id)}
                          disabled={loadingId === c.id}
                          className="text-xs text-blue-400 hover:text-blue-600 font-medium transition-colors disabled:opacity-50"
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
              <h3 className="font-semibold text-gray-800 mb-4">해피콜 기록</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">
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
                            ? "bg-[#1a2e4a] text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">
                    메모 (선택)
                  </label>
                  <textarea
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 resize-none"
                    placeholder="요청사항, 특이사항 등..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => doHappyCall(modal.id)}
                    className="flex-1 py-2 rounded-lg text-sm text-white bg-[#1a2e4a] hover:bg-[#243d61] font-medium"
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
              <h3 className="font-semibold text-gray-800 mb-4">메모</h3>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 resize-none"
                placeholder="특이사항, 요청사항, 진행 내용 등..."
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  onClick={() => doSaveNotes(modal.id)}
                  className="flex-1 py-2 rounded-lg text-sm text-white bg-[#1a2e4a] hover:bg-[#243d61] font-medium"
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
              <h3 className="font-semibold text-gray-800 mb-0.5">대표자 신분증</h3>
              <p className="text-xs text-gray-400 mb-4">{modal.clientName}</p>

              {currentPath && (
                <div className="mb-4">
                  {isImage && (
                    <img
                      src={currentPath}
                      alt="신분증"
                      className="w-full rounded-lg mb-2 max-h-52 object-contain bg-gray-50"
                    />
                  )}
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <a
                      href={currentPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline truncate max-w-[240px]"
                    >
                      📄 파일 보기
                    </a>
                    <button
                      onClick={() => doDeleteIdCard(modal.id)}
                      className="text-xs text-red-400 hover:text-red-600 ml-3 shrink-0"
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
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#1a2e4a] bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {uploading ? (
                  <div className="text-sm text-gray-500">업로드 중...</div>
                ) : (
                  <>
                    <div className="text-2xl mb-2">📎</div>
                    <div className="text-sm text-gray-500">
                      {currentPath ? "새 파일로 교체하려면 끌어다 놓거나 클릭" : "파일을 끌어다 놓거나 클릭하여 선택"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">이미지, PDF 지원</div>
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
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-2">서류 출력</div>
                <button
                  onClick={() => doAutoAction(modal.clientId, "commission-form")}
                  disabled={autoLoading !== null}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition-colors mb-2 ${
                    autoLoading === "commission-form"
                      ? "bg-[#1a2e4a] text-white opacity-70"
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                  } disabled:cursor-not-allowed`}
                >
                  {autoLoading === "commission-form" ? "생성 중..." : "📄 홈택스수임신청서 PDF"}
                </button>
              </div>

              {/* 홈택스 자동화 */}
              <div className="pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-2">홈택스 자동화</div>
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
                          ? "bg-[#1a2e4a] text-white opacity-70"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
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

              <button
                onClick={() => setModal(null)}
                className="mt-3 w-full py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
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
            <h3 className="font-semibold text-gray-800 mb-3">수임 추가</h3>
            <input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="거래처명 또는 대표자명 검색..."
              autoFocus
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 mb-3"
            />
            <div className="overflow-y-auto flex-1 -mx-1">
              {filteredClients.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">
                  {availableClients.length === 0
                    ? "모든 고객사가 수임 관리 중입니다"
                    : "검색 결과 없음"}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => doAdd(client.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {client.name}
                      </div>
                      {client.ceoName && (
                        <div className="text-xs text-gray-400">
                          {client.ceoName}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-[#1a2e4a] opacity-0 group-hover:opacity-100 transition-opacity">
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
              className="mt-3 w-full py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
