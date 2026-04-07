"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWithholdingTask, setLaborOverride, setWithholdingMemo } from "@/app/actions/withholding";
// 프로세스 단계도 withholdingRecords 테이블을 사용

const LABOR_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400", text: "text-red-600", bg: "bg-red-50" },
  "사업소득": { border: "border-blue-400", text: "text-blue-600", bg: "bg-blue-50" },
  "일용직": { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
  A: { label: "A", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", description: "매월 변동" },
  B: { label: "B", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", description: "매월 동일, 납부서 필요" },
  C: { label: "C", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", description: "매월 동일, 납부서 불필요" },
  D: { label: "D", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200", description: "1인사업자 (원천세 없음)" },
};

// 모든 프로세스 단계 (A 기준 최대, 나머지는 비활성)
const ALL_PROCESS_STEPS = ["급여확인요청", "급여명세서전달", "원천세신고", "납부서전달"];

const STEPS_BY_TYPE: Record<string, string[]> = {
  A: ["급여확인요청", "급여명세서전달", "원천세신고", "납부서전달"],
  B: ["급여명세서전달", "원천세신고", "납부서전달"],
  C: ["급여명세서전달", "원천세신고"],
  D: ["최초안내발송"],
};

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

function getAllExtraColumns(month: number) {
  const cols: { key: string; label: string }[] = [];
  if (month === 1 || month === 7) cols.push({ key: "간이지급명세서_근로", label: "간이지급명세서\n(근로)" });
  cols.push({ key: "간이지급명세서_사업", label: "간이지급명세서\n(사업)" });
  cols.push({ key: "근로내용확인신고서", label: "근로내용\n확인신고서" });
  if (month === 2) {
    cols.push({ key: "지급명세서_근로", label: "지급명세서\n(근로)" });
    cols.push({ key: "지급명세서_사업", label: "지급명세서\n(사업)" });
  }
  cols.push({ key: "지급명세서_일용", label: "지급명세서\n(일용)" });
  return cols;
}

export function WithholdingTable({ clients, yearMonth, showAssignedUser = false }: { clients: Client[]; yearMonth: string; showAssignedUser?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const month = parseInt(yearMonth.split("-")[1]);
  const extraColumns = getAllExtraColumns(month);

  function handleMonthChange(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  // 전체 진행률
  const allClients = filtered;
  const totalProcess = allClients.reduce((sum, c) => {
    const steps = STEPS_BY_TYPE[c.withholdingType || ""] || [];
    return sum + steps.length;
  }, 0);
  const doneProcess = allClients.reduce((sum, c) => {
    const steps = STEPS_BY_TYPE[c.withholdingType || ""] || [];
    const doneMap = new Map(c.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    return sum + steps.filter(s => doneMap.has(s)).length;
  }, 0);

  const [year, mon] = yearMonth.split("-");

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">원천세</h1>
        <div className="flex items-center gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="고객사명 검색"
            autoComplete="off"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
          />
          {checkedIds.size > 0 && (
            <div className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-1 rounded-lg">
              {checkedIds.size}개 선택
            </div>
          )}
          <div className="text-sm text-gray-500">
            프로세스: <span className="font-medium text-[#1a2e4a]">{doneProcess}</span> / {totalProcess}
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button onClick={() => handleMonthChange(-1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">◀</button>
            <span className="text-sm font-medium text-gray-800 min-w-[100px] text-center">{year}년 {parseInt(mon)}월</span>
            <button onClick={() => handleMonthChange(1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">▶</button>
          </div>
        </div>
      </div>

      {/* 통합 테이블 */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-3 w-9"></th>
              <th className="text-left px-4 py-3 text-gray-700 font-semibold text-xs whitespace-nowrap">고객사명</th>
              <th className="text-center px-2 py-3 text-gray-500 font-medium text-xs w-10">메모</th>
              {showAssignedUser && <th className="text-center px-2 py-3 text-gray-500 font-medium text-xs whitespace-nowrap">담당자</th>}
              <th className="text-center px-3 py-3 text-gray-700 font-semibold text-xs whitespace-nowrap">인건비</th>
              {ALL_PROCESS_STEPS.map(step => (
                <th key={step} className="text-center px-3 py-3 whitespace-nowrap">
                  <span className="text-[11px] font-semibold text-gray-600">{step}</span>
                </th>
              ))}
              {extraColumns.length > 0 && <th className="w-[1px] px-0 bg-gray-200"></th>}
              {extraColumns.map(col => (
                <th key={col.key} className="text-center px-2 py-3">
                  <span className="text-[10px] font-medium text-gray-400 leading-tight block whitespace-pre-line">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={99} className="text-center py-12 text-gray-400">해당하는 거래처가 없습니다</td></tr>
            )}
            {groups.map((group) => {
              const cfg = group.config;
              const totalCols = 5 + (showAssignedUser ? 1 : 0) + ALL_PROCESS_STEPS.length + (extraColumns.length > 0 ? 1 : 0) + extraColumns.length;
              return (
                <React.Fragment key={group.type || "unassigned"}>
                  {/* 그룹 헤더 행 */}
                  <tr className={`${cfg ? cfg.bg : "bg-gray-100"}`}>
                    <td colSpan={totalCols} className="px-4 py-2 border-t border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        {cfg && (
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${cfg.border} ${cfg.color}`}>
                            {group.type}
                          </span>
                        )}
                        <span className={`text-xs font-semibold ${cfg ? cfg.color : "text-gray-500"}`}>{group.label}</span>
                        <span className="text-[10px] text-gray-400">{group.clients.length}개</span>
                      </div>
                    </td>
                  </tr>
                  {/* 거래처 행 */}
                  {group.clients.map((client) => {
                    const override = client.withholdingLaborOverrides?.[0];
                    const baseLaborTypes = client.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
                    const laborList = override?.laborTypes
                      ? override.laborTypes.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자")
                      : baseLaborTypes;
                    const monthMemo = override?.memo || "";
                    const doneMap = new Map(client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
                    const steps = new Set(STEPS_BY_TYPE[client.withholdingType || ""] || []);
                    const allStepsDone = steps.size > 0 && [...steps].every(s => doneMap.has(s));
                    const requiredExtra = getRequiredTasks(laborList, client.halfYearTax, month);
                    const requiredExtraKeys = new Set(requiredExtra.map(t => t.key));

                    return (
                      <tr key={client.id} className={`border-b border-gray-50 transition-colors ${allStepsDone ? "bg-green-50/40" : "hover:bg-blue-50/30"} ${checkedIds.has(client.id) ? "bg-blue-50/50" : ""}`}>
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
                            className="accent-[#1a2e4a] w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2 text-[#1a2e4a] font-medium">
                          <div className="flex items-center gap-1 truncate">
                            {client.name}
                            {client.accountingProgram?.split(",").map(p => p.trim()).map(p => (
                              p === "위하고" ? <img key={p} src="/wehago.svg" alt="위하고" className="w-3.5 h-3.5 rounded shrink-0" /> :
                              p === "세무사랑" ? <img key={p} src="/semusarang.svg" alt="세무사랑" className="w-3.5 h-3.5 rounded shrink-0" /> : null
                            ))}
                          </div>
                        </td>
                        <td className="px-1 py-2 text-center">
                          {monthMemo ? (
                            <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: monthMemo })}>
                              <span className="text-amber-500 text-xs">📌</span>
                              <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#1a2e4a] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl">{monthMemo}</div>
                            </span>
                          ) : (
                            <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-gray-200 hover:text-amber-500 text-xs">+</button>
                          )}
                        </td>
                        {showAssignedUser && (
                          <td className="px-1 py-2 text-center text-[10px] text-gray-500 truncate">{client.assignedUser?.name ?? "-"}</td>
                        )}
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5 flex-wrap">
                            {laborList.map(t => {
                              const s = LABOR_STYLES[t];
                              return s ? <span key={t} className={`border ${s.border} ${s.text} ${s.bg} rounded px-1 py-0.5 text-[9px] font-medium`}>{t}</span> : null;
                            })}
                            {laborList.length === 0 && <span className="text-gray-300 text-[10px]">-</span>}
                          </div>
                        </td>
                        {/* 프로세스 4열 (항상 표시) */}
                        {ALL_PROCESS_STEPS.map(step => (
                          <td key={step} className="px-2 py-2 text-center">
                            {steps.has(step) ? (
                              <div className="flex justify-center">
                                <button
                                  onClick={() => handleProcessToggle(client.id, step)}
                                  disabled={isPending}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all text-[10px] font-bold ${
                                    doneMap.has(step)
                                      ? `${cfg?.bg || "bg-gray-100"} ${cfg?.border || "border-gray-300"} ${cfg?.color || "text-gray-600"}`
                                      : "border-gray-200 text-gray-300 hover:border-gray-400"
                                  }`}
                                  title={step}
                                >
                                  {doneMap.has(step) ? "✓" : ""}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-200 text-[10px]">-</span>
                            )}
                          </td>
                        ))}
                        {/* 구분선 */}
                        {extraColumns.length > 0 && <td className="w-[1px] px-0 bg-gray-100"></td>}
                        {/* 추가 체크리스트 */}
                        {extraColumns.map(col => (
                          <td key={col.key} className="px-1 py-2 text-center">
                            {client.withholdingType === "D" ? (
                              <span className="text-gray-200 text-[10px]">-</span>
                            ) : requiredExtraKeys.has(col.key) ? (
                              <input
                                type="checkbox"
                                checked={doneMap.has(col.key)}
                                onChange={() => handleToggle(client.id, col.key)}
                                disabled={isPending}
                                className="accent-[#1a2e4a] w-3.5 h-3.5 cursor-pointer"
                              />
                            ) : (
                              <span className="text-gray-200 text-[10px]">-</span>
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
                <h3 className="text-base font-bold text-gray-900">이번달 특이사항</h3>
                <p className="text-xs text-gray-400 mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="이번달 특이사항을 입력하세요..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a] resize-none mb-4"
              id="memo-textarea"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {memoModal.value && (
                <button onClick={() => { startTransition(() => setWithholdingMemo(memoModal.clientId, yearMonth, "")); setMemoModal(null); }} className="text-sm text-red-500 hover:text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
              )}
              <button onClick={() => setMemoModal(null)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">취소</button>
              <button
                onClick={() => {
                  const val = (document.getElementById("memo-textarea") as HTMLTextAreaElement)?.value ?? "";
                  startTransition(() => setWithholdingMemo(memoModal.clientId, yearMonth, val));
                  setMemoModal(null);
                }}
                disabled={isPending}
                className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50 transition-colors"
              >저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
