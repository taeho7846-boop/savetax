"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleWithholdingTask } from "@/app/actions/withholding";

const LABOR_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400", text: "text-red-600", bg: "bg-red-50" },
  "사업소득": { border: "border-blue-400", text: "text-blue-600", bg: "bg-blue-50" },
  "일용직": { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

type Record = { taskType: string; done: boolean };
type Client = {
  id: number;
  name: string;
  laborTypes: string | null;
  halfYearTax: boolean;
  withholdingRecords: Record[];
};

// 해당 월에 필요한 업무 판별
function getRequiredTasks(laborTypes: string[], halfYearTax: boolean, month: number) {
  const tasks: { key: string; label: string }[] = [];
  const has근로 = laborTypes.includes("근로소득");
  const has사업 = laborTypes.includes("사업소득");
  const has일용 = laborTypes.includes("일용직");

  // 6개월납: 1월(7월분), 7월(1월분)만 원천세 신고
  // 일반: 매월
  if (halfYearTax) {
    if (month === 1 || month === 7) {
      tasks.push({ key: "원천세신고", label: "원천세신고" });
    }
  } else {
    tasks.push({ key: "원천세신고", label: "원천세신고" });
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
    { key: "원천세신고", label: "원천세신고" },
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

export function WithholdingTable({ clients, yearMonth }: { clients: Client[]; yearMonth: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const month = parseInt(yearMonth.split("-")[1]);
  const columns = getAllColumns(month);

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

  const [year, mon] = yearMonth.split("-");

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">원천세</h1>
        <div className="flex items-center gap-4">
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
              <th className="text-left px-4 py-3 text-gray-700 font-medium">고객사명</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium">인건비</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium">6개월납</th>
              {columns.map((col) => (
                <th key={col.key} className="text-center px-2 py-3 text-gray-700 font-medium whitespace-pre-line text-xs leading-tight">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={3 + columns.length} className="text-center py-12 text-gray-500">
                  해당하는 거래처가 없습니다
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const laborList = client.laborTypes
                  ?.split(",").map(t => t.trim()).filter(t => t && t !== "1인사업자") ?? [];
                const requiredTasks = getRequiredTasks(laborList, client.halfYearTax, month);
                const requiredKeys = new Set(requiredTasks.map(t => t.key));
                const doneMap = new Map(
                  client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true])
                );

                // 이 거래처의 모든 업무 완료 여부
                const allDone = requiredTasks.length > 0 && requiredTasks.every(t => doneMap.has(t.key));

                return (
                  <tr key={client.id} className={`transition-colors ${allDone ? "bg-green-50/50" : "hover:bg-blue-50/50"}`}>
                    <td className="px-4 py-3 text-[#1a2e4a] font-medium">{client.name}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {laborList.map((t) => {
                          const s = LABOR_STYLES[t] ?? { border: "border-gray-300", text: "text-gray-500", bg: "bg-gray-50" };
                          return (
                            <span key={t} className={`inline-flex items-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-xs font-medium`}>
                              {t}
                            </span>
                          );
                        })}
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
                        {requiredKeys.has(col.key) ? (
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
