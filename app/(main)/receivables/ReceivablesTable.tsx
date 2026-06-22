"use client";

import React, { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toggleFeeRecord } from "@/app/actions/feeRecords";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

interface ClientRow {
  id: number;
  name: string;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  affiliation: string | null;
  assignedUserName: string | null;
  yearRecords: Record<string, string>;
  cumulativeExpected: number;
  cumulativePaid: number;
  cumulativeUnpaid: number;
  contractStatus: string;
  terminationMonth: string | null;
}

interface Props {
  clients: ClientRow[];
  months: string[];       // 항상 12개 (YYYY-01 ~ YYYY-12)
  currentYM: string;      // "2026-03"
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
  const isAfterTermination = !!client.terminationMonth && month > client.terminationMonth;
  const isPaid = client.yearRecords[month] === "paid";
  if (isBeforeStart || isAfterTermination || (isFuture && !isPaid)) return -1;
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
  matchedBy?: "name" | "ceoName";
};

type VerifyResult = {
  targetMonth: string;
  totalExcel: number;
  totalClients: number;
  success: VerifyMatchedItem[];
  failed: VerifyMatchedItem[];
  notInExcel: { clientId: number; clientName: string; monthlyFee: number | null; currentPaid: boolean }[];
};

export function ReceivablesTable({ clients, months, currentYM }: Props) {
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
  const [bulkPaying, setBulkPaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 소속 필터
  const [affFilter, setAffFilter] = useState<string[]>([]);
  const [affFilterOpen, setAffFilterOpen] = useState(false);
  const affFilterRef = useRef<HTMLDivElement>(null);
  const affOptions = [...new Set(clients.map(c => c.affiliation).filter(Boolean))] as string[];

  // 담당자 필터
  const [assignFilter, setAssignFilter] = useState<string[]>([]);
  const [assignFilterOpen, setAssignFilterOpen] = useState(false);
  const assignFilterRef = useRef<HTMLDivElement>(null);
  const assignOptions = [...new Set(clients.map(c => c.assignedUserName).filter(Boolean))] as string[];

  // 채권관리 작업용 체크박스 (확인한 업체는 체크 해제해가며 작업)
  // 처음엔 전부 체크 → 새로고침에도 유지되도록 연도별 localStorage 저장
  const allIds = useMemo(() => clients.map(c => c.id), [clients]);
  const storageKey = `recv-check-${months[0]?.slice(0, 4) ?? "x"}`;
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set(allIds));
  const [checkLoaded, setCheckLoaded] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 마운트 후 저장된 진행상황 불러오기 (있으면)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCheckedIds(new Set(JSON.parse(raw) as number[]));
    } catch { /* 무시 */ }
    setCheckLoaded(true);
  }, [storageKey]);

  // 변경 시 저장
  useEffect(() => {
    if (!checkLoaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify([...checkedIds])); } catch { /* 무시 */ }
  }, [checkedIds, checkLoaded, storageKey]);

  function toggleOneCheck(id: number) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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

  // 출금 성공 + 아직 미수납인 거래처를 한 번에 수납처리
  async function handleBulkMarkPaid(clientIds: number[]) {
    if (!verifyResult || clientIds.length === 0) return;
    setBulkPaying(true);
    try {
      await fetch("/api/receivables/bulk-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds, yearMonth: verifyResult.targetMonth }),
      });
      setPaidIds(prev => {
        const next = new Set(prev);
        clientIds.forEach(id => next.add(id));
        return next;
      });
      router.refresh();
    } catch {
      alert("일괄 수납처리 실패");
    } finally {
      setBulkPaying(false);
    }
  }

  // 소속 필터 외부 클릭 닫기
  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (affFilterRef.current && !affFilterRef.current.contains(e.target as Node)) setAffFilterOpen(false);
      if (assignFilterRef.current && !assignFilterRef.current.contains(e.target as Node)) setAssignFilterOpen(false);
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

  const filtered = clients.filter(c =>
    (affFilter.length === 0 || affFilter.includes(c.affiliation || "")) &&
    (assignFilter.length === 0 || assignFilter.includes(c.assignedUserName || ""))
  );
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

  // 현재 보이는(필터 적용된) 거래처 기준 전체선택 상태
  const checkedCount = filtered.filter(c => checkedIds.has(c.id)).length;
  const allChecked = filtered.length > 0 && checkedCount === filtered.length;
  const someChecked = checkedCount > 0 && !allChecked;

  // 헤더 체크박스 indeterminate(일부만 선택) 표시
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleAllVisible() {
    setCheckedIds(prev => {
      const next = new Set(prev);
      filtered.forEach(c => { if (allChecked) next.delete(c.id); else next.add(c.id); });
      return next;
    });
  }

  return (
    <div>
      {editingClientId && (
        <ClientEditModal clientId={editingClientId} onClose={() => setEditingClientId(null)} />
      )}
      {/* 출금 검증 버튼 */}
      <div className="glass rounded-2xl p-3 mb-4 flex items-center gap-3">
        <span className="text-[12px] font-bold text-[#6B7684] pl-2">출금 검증</span>
        <input
          type="month"
          value={verifyMonth}
          onChange={(e) => setVerifyMonth(e.target.value)}
          className="bg-white/80 rounded-xl px-3 py-2 text-[13px] font-medium text-[#191F28] focus:outline-none border border-white/60"
        />
        <label className="text-[13px] px-4 py-2 rounded-xl font-bold transition-colors bg-[#3182F6] text-white hover:bg-[#1B64DA] cursor-pointer flex items-center gap-1.5">
          {verifyLoading ? "분석 중..." : "📊 엑셀 업로드"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleVerifyUpload}
            className="hidden"
            disabled={verifyLoading}
          />
        </label>
        <span className="text-[11px] text-[#8B95A1] ml-auto pr-2">CMS 출금 결과 엑셀로 일괄 수납처리</span>
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-[#15803D] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#1AB266]" />
                      출금 성공
                    </h3>
                    {(() => {
                      const unpaidIds = verifyResult.success
                        .filter(item => !item.currentPaid && !paidIds.has(item.clientId))
                        .map(item => item.clientId);
                      if (unpaidIds.length === 0) return null;
                      return (
                        <button
                          onClick={() => handleBulkMarkPaid(unpaidIds)}
                          disabled={bulkPaying}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#1AB266] text-white font-bold hover:bg-[#16A865] disabled:opacity-50"
                        >
                          {bulkPaying ? "처리 중..." : `미수납 ${unpaidIds.length}건 일괄 수납처리`}
                        </button>
                      );
                    })()}
                  </div>
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
                              <td className="px-3 py-2 font-medium text-[#191F28]">
                                {item.clientName}
                                {item.matchedBy === "ceoName" && (
                                  <span className="ml-1.5 text-[10px] font-medium text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded-full align-middle whitespace-nowrap">대표자명</span>
                                )}
                              </td>
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
                            <td className="px-3 py-2 font-medium text-[#191F28]">
                                {item.clientName}
                                {item.matchedBy === "ceoName" && (
                                  <span className="ml-1.5 text-[10px] font-medium text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded-full align-middle whitespace-nowrap">대표자명</span>
                                )}
                              </td>
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

      {/* 요약 카드 (소속별 · 누적 전체 기간) */}
      {(() => {
        const groups = [
          { key: "save", label: "세이브택스", dot: "#3182F6", match: (c: ClientRow) => c.affiliation === "세이브택스" },
          { key: "personal", label: "개인세무거래처", dot: "#8B5CF6", match: (c: ClientRow) => c.affiliation !== "세이브택스" },
        ];
        return (
          <div className="flex gap-4 mb-6">
            {groups.map((g) => {
              const gc = clients.filter(g.match);
              const expected = gc.reduce((s, c) => s + c.cumulativeExpected, 0);
              const paid = gc.reduce((s, c) => s + c.cumulativePaid, 0);
              const unpaid = expected - paid;
              const paidRate = expected > 0 ? (paid / expected) * 100 : 0;
              const metrics = [
                { label: "누적 청구", value: expected, color: "#191F28", bar: "#3182F6" },
                { label: "누적 수납", value: paid, color: "#15803D", bar: "#15803D" },
                { label: "미수금", value: unpaid, color: "#DC2626", bar: "#DC2626" },
              ];
              return (
                <div key={g.key} className="flex-1 min-w-0">
                  {/* 소속 라벨 (그룹당 한 번) */}
                  <div className="flex items-center gap-1.5 mb-1.5 pl-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: g.dot }} />
                    <span className="text-[12px] font-bold text-[#4E5968]">{g.label}</span>
                    <span className="text-[11px] text-[#B0B8C1]">{gc.length}곳</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {metrics.map((m) => (
                      <div key={m.label} className="stat-card glass rounded-2xl p-4 relative overflow-hidden h-[96px] flex flex-col justify-between">
                        <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r" style={{ background: m.bar }} />
                        <div className="text-[10px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">{m.label}</div>
                        <div className="text-[18px] font-extrabold leading-tight pl-2 truncate" style={{ color: m.color }} title={fmtWon(m.value)}>{fmtWon(m.value)}</div>
                        {m.label === "누적 수납" ? (
                          <div className="progress ml-2">
                            <div className="progress-fill bg-[#15803D]" style={{ width: `${Math.min(paidRate, 100)}%` }} />
                          </div>
                        ) : (
                          <div className="h-[6px]" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 채권관리 작업 체크리스트 카운터 */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[12px] text-[#6B7684]">
          ✅ 확인 대기 <b className="text-[#191F28]">{checkedCount}곳</b>
          <span className="text-[#B0B8C1]"> / 전체 {filtered.length}곳</span>
        </span>
        <button
          onClick={toggleAllVisible}
          className="text-[12px] font-bold text-[#3182F6] hover:underline"
        >
          {allChecked ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      {/* 테이블 */}
      <div className="glass rounded-3xl overflow-hidden">
       <div className="overflow-auto max-h-[70vh]">
        <table className="text-sm border-collapse w-full">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white/90 backdrop-blur-md border-b border-white/60">
              <th className="sticky left-0 top-0 z-30 bg-white/90 backdrop-blur-md text-left px-4 py-3 text-[#333D4B] font-medium min-w-[140px]">
                <div className="flex items-center gap-2.5">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAllVisible}
                    className="w-4 h-4 accent-[#3182F6] cursor-pointer"
                    title="전체 선택 / 해제"
                  />
                  고객사명
                </div>
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
              {/* 담당자 필터 */}
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium min-w-[80px] whitespace-nowrap">
                <div className="relative inline-block" ref={assignFilterRef}>
                  <button
                    onClick={() => setAssignFilterOpen(o => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${assignFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                  >
                    담당자
                    {assignFilter.length > 0 && (
                      <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{assignFilter.length}</span>
                    )}
                    <span className="text-[#8B95A1] text-[10px]">▼</span>
                  </button>
                  {assignFilterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[120px]">
                      {assignOptions.length === 0 ? (
                        <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                      ) : (
                        assignOptions.map(name => (
                          <label key={name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={assignFilter.includes(name)}
                              onChange={() => setAssignFilter(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name])}
                              className="accent-[#3182F6]"
                            />
                            {name}
                          </label>
                        ))
                      )}
                      {assignFilter.length > 0 && (
                        <button onClick={() => setAssignFilter([])} className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]">초기화</button>
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
          <tbody className="divide-y divide-white/40">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={months.length + 5} className="text-center py-12 text-[#8B95A1]">
                  최초 출금월과 기장료가 등록된 고객사가 없습니다
                </td>
              </tr>
            )}
            {sorted.map((client) => {
              const hasUnpaid = client.cumulativeUnpaid > 0;
              const isChecked = checkedIds.has(client.id);
              return (
              <tr key={client.id} className={`transition-colors ${!isChecked ? "opacity-40" : ""} ${hasUnpaid ? "bg-rose-50/30 hover:bg-rose-50/50" : "hover:bg-white/60"}`}>
                {/* 고객사명 */}
                <td className={`sticky left-0 z-10 px-4 py-3 font-medium whitespace-nowrap ${hasUnpaid ? "bg-rose-50/60" : "bg-white/80"} backdrop-blur-md`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOneCheck(client.id)}
                      className="w-4 h-4 accent-[#3182F6] cursor-pointer shrink-0"
                    />
                    <button
                      onClick={() => setEditingClientId(client.id)}
                      className={`hover:underline text-left ${isChecked ? "text-[#191F28]" : "text-[#8B95A1] line-through"}`}
                    >
                      {client.name}
                    </button>
                    {client.contractStatus !== "active" && (
                      <span className="text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap" title={client.terminationMonth ? `해지 · ${client.terminationMonth}월까지 청구` : "해지 (해지월 미설정 — 거래처 수정에서 지정하세요)"}>
                        해지{client.terminationMonth ? ` ~${client.terminationMonth.slice(5)}월` : ""}
                      </span>
                    )}
                  </div>
                </td>

                {/* 소속 */}
                <td className="px-3 py-3 text-center text-xs whitespace-nowrap">
                  {client.affiliation === "세이브택스" ? <span className="text-[#3182F6] font-bold">세이브택스</span> : client.affiliation ? <span className="text-[#4E5968]">{client.affiliation}</span> : <span className="text-[#B0B8C1]">-</span>}
                </td>
                {/* 담당자 */}
                <td className="px-3 py-3 text-center text-xs whitespace-nowrap">
                  {client.assignedUserName ? <span className="text-[#4E5968]">{client.assignedUserName}</span> : <span className="text-[#B0B8C1]">-</span>}
                </td>
                {/* 월 기장료 */}
                <td className="px-4 py-3 text-right text-[#333D4B] whitespace-nowrap">
                  {client.monthlyFee ? fmtWon(client.monthlyFee) : "-"}
                </td>

                {/* 1월 ~ 12월 */}
                {months.map((m) => {
                  const isFuture = m > currentYM;
                  const isBeforeStart = !!client.firstWithdrawalMonth && m < client.firstWithdrawalMonth;
                  const isAfterTermination = !!client.terminationMonth && m > client.terminationMonth;
                  const isPaid = client.yearRecords[m] === "paid";

                  if (isBeforeStart || isAfterTermination || (isFuture && !isPaid)) {
                    return (
                      <td key={m} className={`px-3 py-3 text-center text-[#C4CCD4] ${isAfterTermination ? "bg-[#F9FAFB]/40" : ""}`} title={isAfterTermination ? "해지월 이후 (청구 종료)" : undefined}>
                        ·
                      </td>
                    );
                  }

                  return (
                    <td key={m} className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggle(client.id, m)}
                        className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                          isPaid
                            ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]"
                            : "bg-[#FEF2F2] text-[#F87171] hover:bg-[#FEE2E2]"
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
                    <span className="text-[#DC2626] font-extrabold">{fmtWon(client.cumulativeUnpaid)}</span>
                  ) : (
                    <span className="text-[#16A865] font-medium">0원</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
       </div>
      </div>
    </div>
  );
}
