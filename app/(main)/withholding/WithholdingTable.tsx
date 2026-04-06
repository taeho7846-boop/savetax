"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWithholdingTask, setLaborOverride, setWithholdingMemo } from "@/app/actions/withholding";

const LABOR_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400", text: "text-red-600", bg: "bg-red-50" },
  "사업소득": { border: "border-blue-400", text: "text-blue-600", bg: "bg-blue-50" },
  "일용직": { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

type WHRecord = { taskType: string; done: boolean };
type Client = {
  id: number;
  name: string;
  laborTypes: string | null;
  halfYearTax: boolean;
  accountingProgram: string;
  assignedUser?: { name: string } | null;
  withholdingRecords: WHRecord[];
  withholdingLaborOverrides: { laborTypes: string | null; memo: string | null }[];
};

// 해당 월에 필요한 업무 판별
function getRequiredTasks(laborTypes: string[], halfYearTax: boolean, month: number) {
  const tasks: { key: string; label: string }[] = [];
  const has근로 = laborTypes.includes("근로소득");
  const has사업 = laborTypes.includes("사업소득");
  const has일용 = laborTypes.includes("일용직");

  // 자료요청: 모든 거래처 매월
  tasks.push({ key: "자료요청", label: "자료요청" });

  // 자료수취: 모든 거래처 매월
  tasks.push({ key: "자료수취", label: "자료수취" });

  // 급여명세서전달: 모든 거래처 매월
  tasks.push({ key: "급여명세서전달", label: "급여명세서전달" });

  // 6개월납: 1월(7월분), 7월(1월분)만 원천세 신고
  // 일반: 매월
  if (halfYearTax) {
    if (month === 1 || month === 7) {
      tasks.push({ key: "원천세신고", label: "원천세신고" });
      tasks.push({ key: "납부서전달", label: "납부서전달" });
    }
  } else {
    tasks.push({ key: "원천세신고", label: "원천세신고" });
    tasks.push({ key: "납부서전달", label: "납부서전달" });
  }

  // 간이지급명세서 - 근로소득: 반기 (1월, 7월)
  if (has근로 && (month === 1 || month === 7)) {
    tasks.push({ key: "간이지급명세서_근로", label: "간이지급명세서(근로)" });
  }

  // 간이지급명세서 - 사업소득: 매월
  if (has사업) {
    tasks.push({ key: "간이지급명세서_사업", label: "간이지급명세서(사업)" });
  }

  // 근로내용확인신고서 - 일용직: 매월
  if (has일용) {
    tasks.push({ key: "근로내용확인신고서", label: "근로내용확인신고서" });
  }

  // 지급명세서 - 근로소득: 2월만 (전년도분)
  if (has근로 && month === 2) {
    tasks.push({ key: "지급명세서_근로", label: "지급명세서(근로)" });
  }

  // 지급명세서 - 사업소득: 2월만 (전년도분)
  if (has사업 && month === 2) {
    tasks.push({ key: "지급명세서_사업", label: "지급명세서(사업)" });
  }

  // 지급명세서 - 일용직: 매월
  if (has일용) {
    tasks.push({ key: "지급명세서_일용", label: "지급명세서(일용)" });
  }

  return tasks;
}

// 모든 가능한 업무 컬럼 (해당 월 기준)
function getAllColumns(month: number) {
  const cols: { key: string; label: string }[] = [
    { key: "자료요청", label: "자료요청" },
    { key: "자료수취", label: "자료수취" },
    { key: "급여명세서전달", label: "급여명세서\n전달" },
    { key: "원천세신고", label: "원천세신고" },
    { key: "납부서전달", label: "납부서전달" },
  ];
  if (month === 1 || month === 7) {
    cols.push({ key: "간이지급명세서_근로", label: "간이지급명세서\n(근로)" });
  }
  cols.push({ key: "간이지급명세서_사업", label: "간이지급명세서\n(사업)" });
  cols.push({ key: "근로내용확인신고서", label: "근로내용\n확인신고서" });
  if (month === 2) {
    cols.push({ key: "지급명세서_근로", label: "지급명세서\n(근로)" });
    cols.push({ key: "지급명세서_사업", label: "지급명세서\n(사업)" });
  }
  cols.push({ key: "지급명세서_일용", label: "지급명세서\n(일용)" });
  return cols;
}

type SortKey = "laborTypes" | "halfYearTax" | string;

export function WithholdingTable({ clients, yearMonth, showAssignedUser = false }: { clients: Client[]; yearMonth: string; showAssignedUser?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const month = parseInt(yearMonth.split("-")[1]);
  const columns = getAllColumns(month);

  function handleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function handleMonthChange(delta: number) {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/withholding?ym=${ym}`);
  }

  function handleToggle(clientId: number, taskType: string) {
    startTransition(async () => {
      await toggleWithholdingTask(clientId, yearMonth, taskType);
    });
  }

  // 진행률 계산
  const totalTasks = clients.reduce((sum, c) => {
    const types = c.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
    return sum + getRequiredTasks(types, c.halfYearTax, month).length;
  }, 0);
  const doneTasks = clients.reduce((sum, c) => {
    return sum + c.withholdingRecords.filter(r => r.done).length;
  }, 0);

  // 검색 필터
  const filtered = search
    ? clients.filter((c) => c.name.includes(search))
    : clients;

  // 정렬 적용
  const sortedClients = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;

    let av: number | string = "";
    let bv: number | string = "";

    if (sortCol === "laborTypes") {
      av = a.laborTypes ?? "";
      bv = b.laborTypes ?? "";
    } else if (sortCol === "halfYearTax") {
      av = a.halfYearTax ? 1 : 0;
      bv = b.halfYearTax ? 1 : 0;
    } else {
      // 업무 컬럼: 체크 여부로 정렬
      const aDone = a.withholdingRecords.some(r => r.taskType === sortCol && r.done) ? 1 : 0;
      const bDone = b.withholdingRecords.some(r => r.taskType === sortCol && r.done) ? 1 : 0;
      av = aDone;
      bv = bDone;
    }

    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

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
            진행: <span className="font-medium text-[#1a2e4a]">{doneTasks}</span> / {totalTasks}
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button
              onClick={() => handleMonthChange(-1)}
              className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm"
            >
              ◀
            </button>
            <span className="text-sm font-medium text-gray-800 min-w-[100px] text-center">
              {year}년 {parseInt(mon)}월
            </span>
            <button
              onClick={() => handleMonthChange(1)}
              className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-3 w-8">
                <input
                  type="checkbox"
                  checked={sortedClients.length > 0 && checkedIds.size === sortedClients.length}
                  onChange={() => {
                    if (checkedIds.size === sortedClients.length) setCheckedIds(new Set());
                    else setCheckedIds(new Set(sortedClients.map(c => c.id)));
                  }}
                  className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 text-gray-700 font-medium">고객사명</th>
              <th className="text-center px-2 py-3 text-gray-500 font-medium text-xs">특이</th>
              {showAssignedUser && (
                <th className="text-center px-3 py-3 text-gray-700 font-medium">담당자</th>
              )}
              <th className="text-center px-2 py-3 text-gray-700 font-medium text-xs whitespace-pre-line leading-tight">
                <button onClick={() => handleSort("신고없음")} className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]">
                  신고없음{sortCol === "신고없음" ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                </button>
              </th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium">
                <button onClick={() => handleSort("laborTypes")} className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]">
                  인건비{sortCol === "laborTypes" ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                </button>
              </th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium">
                <button onClick={() => handleSort("halfYearTax")} className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]">
                  6개월납{sortCol === "halfYearTax" ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                </button>
              </th>
              {columns.map((col) => (
                <th key={col.key} className="text-center px-2 py-3 text-gray-700 font-medium whitespace-pre-line text-xs leading-tight">
                  <button onClick={() => handleSort(col.key)} className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]">
                    {col.label}{sortCol === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedClients.length === 0 ? (
              <tr>
                <td colSpan={6 + columns.length + (showAssignedUser ? 1 : 0)} className="text-center py-12 text-gray-500">
                  해당하는 거래처가 없습니다
                </td>
              </tr>
            ) : (
              sortedClients.map((client) => {
                const override = client.withholdingLaborOverrides?.[0];
                const baseLaborTypes = client.laborTypes?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
                const laborList = override?.laborTypes
                  ? override.laborTypes.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자")
                  : baseLaborTypes;
                const hasOverride = !!override?.laborTypes;
                const monthMemo = override?.memo || "";
                const requiredTasks = getRequiredTasks(laborList, client.halfYearTax, month);
                const requiredKeys = new Set(requiredTasks.map(t => t.key));
                const doneMap = new Map(
                  client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true])
                );
                const isSkipped = doneMap.has("신고없음");

                // 이 거래처의 모든 업무 완료 여부
                const allDone = isSkipped || (requiredTasks.length > 0 && requiredTasks.every(t => doneMap.has(t.key)));

                return (
                  <tr key={client.id} className={`transition-colors ${isSkipped ? "bg-gray-50 opacity-60" : allDone ? "bg-green-50/50" : "hover:bg-blue-50/50"} ${checkedIds.has(client.id) ? "bg-blue-50/50" : ""}`}>
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={checkedIds.has(client.id)}
                        onChange={() => setCheckedIds(prev => { const n = new Set(prev); if (n.has(client.id)) n.delete(client.id); else n.add(client.id); return n; })}
                        className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-[#1a2e4a] font-medium">
                      <div className="flex items-center gap-1">
                        {client.name}
                        {client.accountingProgram?.split(",").map(p => p.trim()).map(p => (
                          p === "위하고" ? (
                            <img key={p} src="/wehago.svg" alt="위하고" title="위하고" className="w-4 h-4 rounded" />
                          ) : p === "세무사랑" ? (
                            <img key={p} src="/semusarang.svg" alt="세무사랑" title="세무사랑" className="w-4 h-4 rounded" />
                          ) : null
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {monthMemo ? (
                        <span className="relative group cursor-pointer" onClick={() => {
                          const val = prompt("이번달 특이사항:", monthMemo);
                          if (val !== null) startTransition(() => setWithholdingMemo(client.id, yearMonth, val));
                        }}>
                          <span className="text-amber-500 text-xs">📌</span>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-pre-wrap max-w-[250px] z-30 shadow-lg">
                            {monthMemo}
                          </span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            const val = prompt("이번달 특이사항:");
                            if (val) startTransition(() => setWithholdingMemo(client.id, yearMonth, val));
                          }}
                          className="text-gray-200 hover:text-gray-400 text-xs"
                        >+</button>
                      )}
                    </td>
                    {showAssignedUser && (
                      <td className="px-3 py-3 text-center text-xs text-gray-600">
                        {client.assignedUser?.name ?? <span className="text-gray-300">-</span>}
                      </td>
                    )}
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSkipped}
                        onChange={() => handleToggle(client.id, "신고없음")}
                        disabled={isPending}
                        className="accent-gray-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {["근로소득", "사업소득", "일용직"].map((t) => {
                          const active = laborList.includes(t);
                          const isBase = baseLaborTypes.includes(t);
                          const s = LABOR_STYLES[t] ?? { border: "border-gray-300", text: "text-gray-500", bg: "bg-gray-50" };
                          return (
                            <button
                              key={t}
                              onClick={() => {
                                let newList: string[];
                                if (active) {
                                  newList = laborList.filter(l => l !== t);
                                } else {
                                  newList = [...laborList, t];
                                }
                                // 기본값과 같으면 오버라이드 삭제
                                const isSame = newList.sort().join(",") === baseLaborTypes.sort().join(",");
                                startTransition(() => setLaborOverride(client.id, yearMonth, isSame ? "" : newList.join(",")));
                              }}
                              disabled={isPending}
                              className={`inline-flex items-center border rounded-md px-1.5 py-0.5 text-xs font-medium transition-all ${
                                active
                                  ? `${s.border} ${s.text} ${s.bg}`
                                  : "border-dashed border-gray-300 text-gray-300 bg-white"
                              } ${!isBase && active ? "ring-1 ring-offset-1 ring-blue-400" : ""} hover:opacity-80 cursor-pointer`}
                              title={active ? `${t} 이번달 제외` : `${t} 이번달 추가`}
                            >
                              {t}
                            </button>
                          );
                        })}
                        {hasOverride && <span className="text-[9px] text-blue-500" title="이번달 인건비가 기본값과 다릅니다">✎</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {client.halfYearTax ? (
                        <span className="bg-orange-50 text-orange-600 border border-orange-300 rounded-md px-2 py-0.5 text-xs font-medium">
                          6개월납
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-2 py-3 text-center">
                        {isSkipped ? (
                          <span className="text-gray-200">-</span>
                        ) : requiredKeys.has(col.key) ? (
                          <input
                            type="checkbox"
                            checked={doneMap.has(col.key)}
                            onChange={() => handleToggle(client.id, col.key)}
                            disabled={isPending}
                            className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                          />
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
