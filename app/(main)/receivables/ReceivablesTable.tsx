"use client";

import { useState, useTransition } from "react";
import { toggleFeeRecord } from "@/app/actions/feeRecords";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

interface ClientRow {
  id: number;
  name: string;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  yearRecords: Record<string, string>;
  cumulativeUnpaid: number;
}

interface Props {
  clients: ClientRow[];
  months: string[];       // 항상 12개 (YYYY-01 ~ YYYY-12)
  currentYM: string;      // "2026-03"
  summary: {
    totalExpected: number;
    totalPaid: number;
    totalUnpaid: number;
  };
}

type SortDir = "asc" | "desc";

function fmt(yearMonth: string) {
  return `${parseInt(yearMonth.split("-")[1])}월`;
}

function fmtWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string | null; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-[#1a2e4a]">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

/** 월별 정렬 가중치: N/A=-1, 미수=0, 수납=1 */
function monthSortValue(client: ClientRow, month: string, currentYM: string): number {
  const isBeforeStart = !!client.firstWithdrawalMonth && month < client.firstWithdrawalMonth;
  const isFuture = month > currentYM;
  const isPaid = client.yearRecords[month] === "paid";
  if (isBeforeStart || (isFuture && !isPaid)) return -1;
  return isPaid ? 1 : 0;
}

export function ReceivablesTable({ clients, months, currentYM, summary }: Props) {
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, startTransition] = useTransition();

  function toggle(clientId: number, yearMonth: string) {
    startTransition(() => toggleFeeRecord(clientId, yearMonth));
  }

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sorted = [...clients].sort((a, b) => {
    if (!sortCol) return 0;
    let diff = 0;
    if (sortCol === "unpaid") {
      diff = a.cumulativeUnpaid - b.cumulativeUnpaid;
    } else {
      diff = monthSortValue(a, sortCol, currentYM) - monthSortValue(b, sortCol, currentYM);
    }
    return sortDir === "asc" ? diff : -diff;
  });

  return (
    <div>
      {editingClientId && (
        <ClientEditModal clientId={editingClientId} onClose={() => setEditingClientId(null)} />
      )}
      {/* 요약 카드 (누적 전체 기간) */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">누적 청구 합계</div>
          <div className="text-lg font-bold text-gray-900">{fmtWon(summary.totalExpected)}</div>
        </div>
        <div className="bg-white rounded-lg border border-green-100 shadow-sm p-4">
          <div className="text-xs text-green-600 mb-1">누적 수납 완료</div>
          <div className="text-lg font-bold text-green-700">{fmtWon(summary.totalPaid)}</div>
        </div>
        <div className="bg-white rounded-lg border border-red-100 shadow-sm p-4">
          <div className="text-xs text-red-500 mb-1">누적 미수</div>
          <div className="text-lg font-bold text-red-600">{fmtWon(summary.totalUnpaid)}</div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 text-gray-700 font-medium min-w-[140px]">
                고객사명
              </th>
              <th className="text-right px-4 py-3 text-gray-700 font-medium min-w-[100px] whitespace-nowrap">
                월 기장료
              </th>
              {months.map((m) => (
                <th key={m} className="text-center px-3 py-3 text-gray-700 font-medium min-w-[52px] whitespace-nowrap">
                  <button
                    onClick={() => handleSort(m)}
                    className="hover:text-[#1a2e4a] transition-colors inline-flex items-center"
                  >
                    {fmt(m)}
                    <SortIcon col={m} sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-3 text-red-500 font-medium min-w-[100px] whitespace-nowrap">
                <button
                  onClick={() => handleSort("unpaid")}
                  className="hover:text-red-700 transition-colors inline-flex items-center"
                >
                  미수금액
                  <SortIcon col="unpaid" sortCol={sortCol} sortDir={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={months.length + 3} className="text-center py-12 text-gray-400">
                  최초 출금월과 기장료가 등록된 고객사가 없습니다
                </td>
              </tr>
            )}
            {sorted.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                {/* 고객사명 */}
                <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-3 font-medium whitespace-nowrap">
                  <button
                    onClick={() => setEditingClientId(client.id)}
                    className="text-[#1a2e4a] hover:underline text-left"
                  >
                    {client.name}
                  </button>
                </td>

                {/* 월 기장료 */}
                <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                  {client.monthlyFee ? fmtWon(client.monthlyFee) : "-"}
                </td>

                {/* 1월 ~ 12월 */}
                {months.map((m) => {
                  const isFuture = m > currentYM;
                  const isBeforeStart = !!client.firstWithdrawalMonth && m < client.firstWithdrawalMonth;
                  const isPaid = client.yearRecords[m] === "paid";

                  if (isBeforeStart || (isFuture && !isPaid)) {
                    return (
                      <td key={m} className="px-3 py-3 text-center text-gray-200">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={m} className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggle(client.id, m)}
                        className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                          isPaid
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-50 text-red-400 hover:bg-red-100"
                        }`}
                        title={isPaid ? "수납 완료 (클릭: 취소)" : "미수 (클릭: 수납 처리)"}
                      >
                        {isPaid ? "✓" : "✕"}
                      </button>
                    </td>
                  );
                })}

                {/* 누적 미수금액 */}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {client.cumulativeUnpaid > 0 ? (
                    <span className="text-red-600 font-medium">{fmtWon(client.cumulativeUnpaid)}</span>
                  ) : (
                    <span className="text-green-600 font-medium">0원</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
