"use client";

import React, { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toggleFeeRecord } from "@/app/actions/feeRecords";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

interface ClientRow {
  id: number;
  name: string;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  affiliation: string | null;
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
  if (sortCol !== col) return <span className="ml-1 text-[#B0B8C1]">↕</span>;
  return <span className="ml-1 text-[#191F28]">{sortDir === "asc" ? "↑" : "↓"}</span>;
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

  // 소속 필터
  const [affFilter, setAffFilter] = useState<string[]>([]);
  const [affFilterOpen, setAffFilterOpen] = useState(false);
  const affFilterRef = useRef<HTMLDivElement>(null);
  const affOptions = [...new Set(clients.map(c => c.affiliation).filter(Boolean))] as string[];

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

  // 소속 필터 외부 클릭 닫기
  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (affFilterRef.current && !affFilterRef.current.contains(e.target as Node)) setAffFilterOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

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

  const filtered = affFilter.length > 0 ? clients.filter(c => affFilter.includes(c.affiliation || "")) : clients;
  const sorted = [...filtered].sort((a, b) => {
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
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-2 py-1.5 text-sm focus:outline-none focus:border-[#3182F6]"
        />
        <label className="text-sm px-4 py-2 rounded-lg font-medium transition-colors bg-[#3182F6] text-white hover:bg-[#1B64DA] cursor-pointer">
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
            <div className="px-6 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#191F28]">{verifyResult.targetMonth.replace("-", "년 ")}월 출금 검증</h2>
                <p className="text-sm text-[#6B7684] mt-0.5">
                  엑셀 {verifyResult.totalExcel}건 / 내 거래처 매칭: 출금성공 {verifyResult.success.length} · 실패 {verifyResult.failed.length} · 미포함 {verifyResult.notInExcel.length}
                </p>
              </div>
              <button onClick={() => setVerifyResult(null)} className="text-[#8B95A1] hover:text-[#4E5968] text-2xl leading-none">&times;</button>
            </div>

            {/* 요약 */}
            <div className="px-6 py-3 grid grid-cols-3 gap-3">
              <div className="bg-[#F1FBF4] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-[#16A865]">{verifyResult.success.length}</div>
                <div className="text-xs text-[#16A865] mt-1">출금 성공</div>
              </div>
              <div className="bg-[#FEF2F2] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-[#DC2626]">{verifyResult.failed.length}</div>
                <div className="text-xs text-[#DC2626] mt-1">출금 실패</div>
              </div>
              <div className="bg-[#F9FAFB] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-[#4E5968]">{verifyResult.notInExcel.length}</div>
                <div className="text-xs text-[#4E5968] mt-1">엑셀에 없음</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {/* 출금 성공 */}
              {verifyResult.success.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-[#15803D] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1AB266]" />
                    출금 성공
                  </h3>
                  <div className="border border-[#BBF7D0] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F1FBF4]">
                        <tr>
                          <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                          <th className="px-3 py-2 text-right text-[#333D4B]">기장료</th>
                          <th className="px-3 py-2 text-right text-[#333D4B]">출금액</th>
                          <th className="px-3 py-2 text-center text-[#333D4B]">출금결과</th>
                          <th className="px-3 py-2 text-center text-[#333D4B]">수납</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-green-100">
                        {verifyResult.success.map(item => {
                          const alreadyPaid = item.currentPaid || paidIds.has(item.clientId);
                          return (
                            <tr key={item.clientId} className={alreadyPaid ? "bg-[#F1FBF4]/50" : ""}>
                              <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                              <td className="px-3 py-2 text-right text-[#4E5968]">{item.monthlyFee?.toLocaleString()}원</td>
                              <td className="px-3 py-2 text-right text-[#4E5968]">{item.excelAmount?.toLocaleString()}원</td>
                              <td className="px-3 py-2 text-center">
                                <span className="text-xs text-[#15803D] bg-[#E7F7EE] px-2 py-0.5 rounded-full">{item.excelResult || "성공"}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {alreadyPaid ? (
                                  <span className="text-xs text-[#16A865] font-medium">수납완료</span>
                                ) : (
                                  <button
                                    onClick={() => handleMarkPaid(item.clientId)}
                                    className="text-xs px-3 py-1 rounded-lg bg-[#1AB266] text-white hover:bg-[#16A865]"
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
                  <h3 className="text-sm font-bold text-[#B91C1C] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#E02E2E]" />
                    출금 실패
                  </h3>
                  <div className="border border-[#FECACA] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#FEF2F2]">
                        <tr>
                          <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                          <th className="px-3 py-2 text-right text-[#333D4B]">기장료</th>
                          <th className="px-3 py-2 text-center text-[#333D4B]">실패 사유</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {verifyResult.failed.map(item => (
                          <tr key={item.clientId}>
                            <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                            <td className="px-3 py-2 text-right text-[#4E5968]">{item.monthlyFee?.toLocaleString()}원</td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-xs text-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 rounded-full">{item.excelResult}</span>
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
                  <h3 className="text-sm font-bold text-[#6B7684] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#D1D6DB]" />
                    엑셀에 없음 ({verifyResult.notInExcel.length}건)
                  </h3>
                  <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F9FAFB]">
                        <tr>
                          <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                          <th className="px-3 py-2 text-right text-[#333D4B]">기장료</th>
                          <th className="px-3 py-2 text-center text-[#333D4B]">현재 상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2F4F6]">
                        {verifyResult.notInExcel.map(item => (
                          <tr key={item.clientId}>
                            <td className="px-3 py-2 text-[#4E5968]">{item.clientName}</td>
                            <td className="px-3 py-2 text-right text-[#4E5968]">{item.monthlyFee?.toLocaleString()}원</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${item.currentPaid ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#FEF2F2] text-[#E02E2E]"}`}>
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
        <div className="bg-white rounded-lg border border-[#F2F4F6] shadow-sm p-4">
          <div className="text-xs text-[#6B7684] mb-1">누적 청구 합계</div>
          <div className="text-lg font-bold text-[#191F28]">{fmtWon(summary.totalExpected)}</div>
        </div>
        <div className="bg-white rounded-lg border border-green-100 shadow-sm p-4">
          <div className="text-xs text-[#16A865] mb-1">누적 수납 완료</div>
          <div className="text-lg font-bold text-[#15803D]">{fmtWon(summary.totalPaid)}</div>
        </div>
        <div className="bg-white rounded-lg border border-red-100 shadow-sm p-4">
          <div className="text-xs text-[#E02E2E] mb-1">누적 미수</div>
          <div className="text-lg font-bold text-[#DC2626]">{fmtWon(summary.totalUnpaid)}</div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-[#F2F4F6]">
              <th className="sticky left-0 z-10 bg-[#F9FAFB] text-left px-4 py-3 text-[#333D4B] font-medium min-w-[140px]">
                고객사명
              </th>
              {/* 소속 필터 */}
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium min-w-[70px] whitespace-nowrap">
                <div className="relative inline-block" ref={affFilterRef}>
                  <button
                    onClick={() => setAffFilterOpen(o => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${affFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                  >
                    소속
                    {affFilter.length > 0 && (
                      <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{affFilter.length}</span>
                    )}
                    <span className="text-[#8B95A1] text-[10px]">▼</span>
                  </button>
                  {affFilterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[120px]">
                      {affOptions.length === 0 ? (
                        <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                      ) : (
                        affOptions.map(aff => (
                          <label key={aff} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={affFilter.includes(aff)}
                              onChange={() => setAffFilter(prev => prev.includes(aff) ? prev.filter(v => v !== aff) : [...prev, aff])}
                              className="accent-[#3182F6]"
                            />
                            {aff}
                          </label>
                        ))
                      )}
                      {affFilter.length > 0 && (
                        <button onClick={() => setAffFilter([])} className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]">초기화</button>
                      )}
                    </div>
                  )}
                </div>
              </th>
              <th className="text-right px-4 py-3 text-[#333D4B] font-medium min-w-[100px] whitespace-nowrap">
                월 기장료
              </th>
              {months.map((m) => (
                <th key={m} className="text-center px-3 py-3 text-[#333D4B] font-medium min-w-[52px] whitespace-nowrap">
                  <button
                    onClick={() => handleSort(m)}
                    className="hover:text-[#191F28] transition-colors inline-flex items-center"
                  >
                    {fmt(m)}
                    <SortIcon col={m} sortCol={sortCol} sortDir={sortDir} />
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-3 text-[#E02E2E] font-medium min-w-[100px] whitespace-nowrap">
                <button
                  onClick={() => handleSort("unpaid")}
                  className="hover:text-[#B91C1C] transition-colors inline-flex items-center"
                >
                  미수금액
                  <SortIcon col="unpaid" sortCol={sortCol} sortDir={sortDir} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F6]">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={months.length + 4} className="text-center py-12 text-[#8B95A1]">
                  최초 출금월과 기장료가 등록된 고객사가 없습니다
                </td>
              </tr>
            )}
            {sorted.map((client) => (
              <tr key={client.id} className="hover:bg-[#F9FAFB] transition-colors">
                {/* 고객사명 */}
                <td className="sticky left-0 z-10 bg-white hover:bg-[#F9FAFB] px-4 py-3 font-medium whitespace-nowrap">
                  <button
                    onClick={() => setEditingClientId(client.id)}
                    className="text-[#191F28] hover:underline text-left"
                  >
                    {client.name}
                  </button>
                </td>

                {/* 소속 */}
                <td className="px-3 py-3 text-center text-xs whitespace-nowrap">
                  {client.affiliation === "세이브택스" ? <span className="text-[#3182F6] font-bold">세이브택스</span> : client.affiliation ? <span className="text-[#4E5968]">{client.affiliation}</span> : <span className="text-[#B0B8C1]">-</span>}
                </td>
                {/* 월 기장료 */}
                <td className="px-4 py-3 text-right text-[#333D4B] whitespace-nowrap">
                  {client.monthlyFee ? fmtWon(client.monthlyFee) : "-"}
                </td>

                {/* 1월 ~ 12월 */}
                {months.map((m) => {
                  const isFuture = m > currentYM;
                  const isBeforeStart = !!client.firstWithdrawalMonth && m < client.firstWithdrawalMonth;
                  const isPaid = client.yearRecords[m] === "paid";

                  if (isBeforeStart || (isFuture && !isPaid)) {
                    return (
                      <td key={m} className="px-3 py-3 text-center text-[#D1D6DB]">
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
                            ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]"
                            : "bg-[#FEF2F2] text-[#F87171] hover:bg-[#FEF2F2]"
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
                    <span className="text-[#DC2626] font-medium">{fmtWon(client.cumulativeUnpaid)}</span>
                  ) : (
                    <span className="text-[#16A865] font-medium">0원</span>
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
