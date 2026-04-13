"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
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

type VerifyMatchedItem = {
  clientId: number;
  clientName: string;
  monthlyFee: number | null;
  excelResult: string;
  excelSuccess: boolean;
  excelAmount: number;
  currentPaid: boolean;
};

type VerifyResult = {
  targetMonth: string;
  totalExcel: number;
  totalClients: number;
  success: VerifyMatchedItem[];
  failed: VerifyMatchedItem[];
  notInExcel: { clientId: number; clientName: string; monthlyFee: number | null; currentPaid: boolean }[];
};

export function ReceivablesTable({ clients, months, currentYM, summary }: Props) {
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, startTransition] = useTransition();
  const router = useRouter();

  // 출금 검증
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMonth, setVerifyMonth] = useState(currentYM);
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleVerifyUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("targetMonth", verifyMonth);
      const res = await fetch("/api/receivables/verify-excel", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "파싱 실패"); return; }
      setVerifyResult(data);
      setPaidIds(new Set());
    } catch { alert("업로드 실패"); }
    finally {
      setVerifyLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleMarkPaid(clientId: number) {
    if (!verifyResult) return;
    await fetch("/api/receivables/bulk-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [clientId], yearMonth: verifyResult.targetMonth }),
    });
    setPaidIds(prev => new Set(prev).add(clientId));
    router.refresh();
  }

  async function handleBulkMarkPaid() {
    if (!verifyResult) return;
    const ids = verifyResult.success
      .filter(s => !s.currentPaid && !paidIds.has(s.clientId))
      .map(s => s.clientId);
    if (ids.length === 0) return;
    await fetch("/api/receivables/bulk-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: ids, yearMonth: verifyResult.targetMonth }),
    });
    setPaidIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    router.refresh();
  }

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
      {/* 출금 검증 버튼 */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="month"
          value={verifyMonth}
          onChange={(e) => setVerifyMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        <label className="text-sm px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
          {verifyLoading ? "분석 중..." : "출금 검증"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleVerifyUpload}
            className="hidden"
            disabled={verifyLoading}
          />
        </label>
      </div>

      {/* 출금 검증 결과 모달 */}
      {verifyResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVerifyResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{verifyResult.targetMonth.replace("-", "년 ")}월 출금 검증</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  엑셀 {verifyResult.totalExcel}건 / 내 거래처 매칭: 출금성공 {verifyResult.success.length} · 실패 {verifyResult.failed.length} · 미포함 {verifyResult.notInExcel.length}
                </p>
              </div>
              <button onClick={() => setVerifyResult(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* 요약 */}
            <div className="px-6 py-3 grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{verifyResult.success.length}</div>
                <div className="text-xs text-green-600 mt-1">출금 성공</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{verifyResult.failed.length}</div>
                <div className="text-xs text-red-600 mt-1">출금 실패</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-600">{verifyResult.notInExcel.length}</div>
                <div className="text-xs text-gray-600 mt-1">엑셀에 없음</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {/* 출금 성공 */}
              {verifyResult.success.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-green-700 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      출금 성공
                    </h3>
                    {verifyResult.success.some(s => !s.currentPaid && !paidIds.has(s.clientId)) && (
                      <button
                        onClick={handleBulkMarkPaid}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700"
                      >
                        미수납 전체 수납처리
                      </button>
                    )}
                  </div>
                  <div className="border border-green-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700">거래처명</th>
                          <th className="px-3 py-2 text-right text-gray-700">기장료</th>
                          <th className="px-3 py-2 text-right text-gray-700">출금액</th>
                          <th className="px-3 py-2 text-center text-gray-700">출금결과</th>
                          <th className="px-3 py-2 text-center text-gray-700">수납</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-green-100">
                        {verifyResult.success.map(item => {
                          const alreadyPaid = item.currentPaid || paidIds.has(item.clientId);
                          return (
                            <tr key={item.clientId} className={alreadyPaid ? "bg-green-50/50" : ""}>
                              <td className="px-3 py-2 font-medium text-gray-900">{item.clientName}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{item.monthlyFee?.toLocaleString()}원</td>
                              <td className="px-3 py-2 text-right text-gray-600">{item.excelAmount?.toLocaleString()}원</td>
                              <td className="px-3 py-2 text-center">
                                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{item.excelResult || "성공"}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {alreadyPaid ? (
                                  <span className="text-xs text-green-600 font-medium">수납완료</span>
                                ) : (
                                  <button
                                    onClick={() => handleMarkPaid(item.clientId)}
                                    className="text-xs px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600"
                                  >
                                    수납처리
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 출금 실패 */}
              {verifyResult.failed.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    출금 실패
                  </h3>
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700">거래처명</th>
                          <th className="px-3 py-2 text-right text-gray-700">기장료</th>
                          <th className="px-3 py-2 text-center text-gray-700">실패 사유</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {verifyResult.failed.map(item => (
                          <tr key={item.clientId}>
                            <td className="px-3 py-2 font-medium text-gray-900">{item.clientName}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{item.monthlyFee?.toLocaleString()}원</td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{item.excelResult}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 엑셀에 없음 */}
              {verifyResult.notInExcel.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    엑셀에 없음 ({verifyResult.notInExcel.length}건)
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-700">거래처명</th>
                          <th className="px-3 py-2 text-right text-gray-700">기장료</th>
                          <th className="px-3 py-2 text-center text-gray-700">현재 상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {verifyResult.notInExcel.map(item => (
                          <tr key={item.clientId}>
                            <td className="px-3 py-2 text-gray-600">{item.clientName}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{item.monthlyFee?.toLocaleString()}원</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${item.currentPaid ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"}`}>
                                {item.currentPaid ? "수납완료" : "미수납"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
