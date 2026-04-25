"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cycleCmsStatus, bulkCmsRegister } from "@/app/actions/clients";

type CmsClient = {
  id: number;
  name: string;
  ceoName: string | null;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  cmsStatus: string;
  bankName: string | null;
  bankAccount: string | null;
  affiliation: string | null;
};

type MatchedItem = {
  excelName: string;
  excelStatus: string;
  excelStatusType: string;
  clientId: number;
  clientName: string;
  ceoName: string | null;
  currentStatus: string;
  monthlyFee: number | null;
};

type VerifyResult = {
  totalClients: number;
  totalExcel: number;
  matched: number;
  needsUpdate: MatchedItem[];
  alreadyDone: MatchedItem[];
  failed: MatchedItem[];
  paused: MatchedItem[];
  notInExcel: { clientId: number; clientName: string; ceoName: string | null; currentStatus: string }[];
};

type SortCol = "name" | "ceoName" | "monthlyFee" | "cmsStatus";

export function CmsTable({ clients }: { clients: CmsClient[] }) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const filterRef = useRef<HTMLDivElement>(null);
  const [affFilter, setAffFilter] = useState<string[]>([]);
  const [affFilterOpen, setAffFilterOpen] = useState(false);
  const affFilterRef = useRef<HTMLDivElement>(null);
  const [tiMonth, setTiMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // CMS 검증 모달 상태
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [updatedIds, setUpdatedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cms/verify-excel", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "엑셀 파싱 실패");
        return;
      }
      setVerifyResult(data);
      setUpdatedIds(new Set());
    } catch {
      alert("업로드 실패");
    } finally {
      setVerifyLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleVerifyExcelDownload() {
    if (!verifyResult) return;
    const rows: string[][] = [["구분", "거래처명", "대표자", "CMS 상태", "현재 시스템", "월 기장료"]];
    for (const item of verifyResult.needsUpdate) {
      rows.push(["변경 필요", item.clientName, item.ceoName || "", item.excelStatus, statusLabel(item.currentStatus), item.monthlyFee?.toLocaleString() || ""]);
    }
    for (const item of verifyResult.alreadyDone) {
      rows.push(["이미 일치", item.clientName, item.ceoName || "", item.excelStatus, statusLabel(item.currentStatus), item.monthlyFee?.toLocaleString() || ""]);
    }
    for (const item of verifyResult.failed) {
      rows.push(["등록실패", item.clientName, item.ceoName || "", item.excelStatus, statusLabel(item.currentStatus), item.monthlyFee?.toLocaleString() || ""]);
    }
    for (const item of verifyResult.paused || []) {
      rows.push(["일시정지", item.clientName, item.ceoName || "", item.excelStatus, statusLabel(item.currentStatus), item.monthlyFee?.toLocaleString() || ""]);
    }
    for (const item of verifyResult.notInExcel) {
      rows.push(["엑셀에 없음", item.clientName, item.ceoName || "", "", statusLabel(item.currentStatus), ""]);
    }
    // CSV 생성 후 다운로드
    const bom = "\uFEFF";
    const csv = bom + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CMS_검증결과_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpdateSingle(clientId: number, status: string) {
    startTransition(async () => {
      await fetch("/api/cms/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, status }),
      });
      setUpdatedIds(prev => new Set(prev).add(clientId));
      router.refresh();
    });
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (affFilterRef.current && !affFilterRef.current.contains(e.target as Node)) {
        setAffFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const allMonths = [...new Set(clients.map((c) => c.firstWithdrawalMonth).filter(Boolean) as string[])].sort();
  const affOptions = [...new Set(clients.map(c => c.affiliation).filter(Boolean))] as string[];

  let rows = [...clients];
  if (monthFilter.length > 0) {
    rows = rows.filter((c) => c.firstWithdrawalMonth && monthFilter.includes(c.firstWithdrawalMonth));
  }
  if (affFilter.length > 0) {
    rows = rows.filter((c) => affFilter.includes(c.affiliation || ""));
  }

  if (sortCol) {
    const col = sortCol;
    rows.sort((a, b) => {
      let av: string | number | boolean = a[col] ?? "";
      let bv: string | number | boolean = b[col] ?? "";
      if (typeof av === "boolean") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="text-[#B0B8C1] ml-0.5">↕</span>;
    return <span className="text-[#191F28] ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleCycle(clientId: number) {
    startTransition(async () => {
      await cycleCmsStatus(clientId);
      router.refresh();
    });
  }

  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);

  function toggleCheck(id: number, e?: React.MouseEvent) {
    const currentIdx = rows.findIndex((c) => c.id === id);
    if (e?.shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
      const start = Math.min(lastCheckedIdx, currentIdx);
      const end = Math.max(lastCheckedIdx, currentIdx);
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(rows[i].id);
        return next;
      });
    } else {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    setLastCheckedIdx(currentIdx);
  }

  function toggleAll() {
    if (checkedIds.size === rows.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(rows.map((c) => c.id)));
    }
  }

  function toggleMonth(m: string) {
    setMonthFilter((prev) =>
      prev.includes(m) ? prev.filter((v) => v !== m) : [...prev, m]
    );
  }

  async function handleTaxInvoice() {
    if (checkedIds.size === 0) return;
    try {
      const res = await fetch("/api/clients/tax-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [...checkedIds], yearMonth: tiMonth }),
      });
      if (!res.ok) { alert("다운로드 실패"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TI_${tiMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("다운로드 실패"); }
  }

  async function handleBulkRegister() {
    if (checkedIds.size === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/cms/bulk-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientIds: [...checkedIds] }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "엑셀 생성 실패");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "CMS_일괄등록.zip";
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert("엑셀 다운로드 실패");
        return;
      }
      setCheckedIds(new Set());
    });
  }

  const statusLabel = (s: string) =>
    s === "done" ? "등록" : s === "pending" ? "등록요청중" : "미등록";

  return (
    <>
    <div className="flex items-center gap-3 mb-3">
      <button
        onClick={handleBulkRegister}
        disabled={isPending || checkedIds.size === 0}
        className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
          checkedIds.size > 0
            ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
            : "bg-[#F2F4F6] text-[#8B95A1] cursor-not-allowed"
        } disabled:opacity-50`}
      >
        {isPending ? "처리 중..." : `일괄등록${checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}`}
      </button>

      {/* CMS 엑셀 검증 업로드 */}
      <label className="text-sm px-4 py-2 rounded-lg font-medium transition-colors bg-[#3182F6] text-white hover:bg-[#1B64DA] cursor-pointer">
        {verifyLoading ? "분석 중..." : "CMS 검증"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={handleExcelUpload}
          className="hidden"
          disabled={verifyLoading}
        />
      </label>

      <div className="flex items-center gap-2 ml-auto">
        <input
          type="month"
          value={tiMonth}
          onChange={(e) => setTiMonth(e.target.value)}
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-2 py-1.5 text-sm focus:outline-none focus:border-[#3182F6]"
        />
        <button
          onClick={handleTaxInvoice}
          disabled={isPending || checkedIds.size === 0}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            checkedIds.size > 0
              ? "bg-[#16A865] text-white hover:bg-[#15803D]"
              : "bg-[#F2F4F6] text-[#8B95A1] cursor-not-allowed"
          } disabled:opacity-50`}
        >
          T/I 발행{checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}
        </button>
      </div>
    </div>

    {/* CMS 검증 결과 모달 */}
    {verifyResult && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVerifyResult(null)}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* 모달 헤더 */}
          <div className="px-6 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#191F28]">CMS 등록 검증 결과</h2>
              <p className="text-sm text-[#6B7684] mt-0.5">
                내 거래처 {verifyResult.totalClients}건 중 {verifyResult.matched}건 엑셀 매칭
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleVerifyExcelDownload()}
                className="text-sm bg-[#16A865] text-white px-3 py-1.5 rounded-lg hover:bg-[#15803D] transition-colors"
              >
                엑셀 다운로드
              </button>
              <button onClick={() => setVerifyResult(null)} className="text-[#8B95A1] hover:text-[#4E5968] text-2xl leading-none">&times;</button>
            </div>
          </div>

          {/* 요약 카드 */}
          <div className="px-6 py-3 grid grid-cols-4 gap-3">
            <div className="bg-[#FFFBEB] rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-[#B45309]">{verifyResult.needsUpdate.length}</div>
              <div className="text-xs text-[#B45309] mt-1">변경 필요</div>
            </div>
            <div className="bg-[#F1FBF4] rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-[#16A865]">{verifyResult.alreadyDone.length}</div>
              <div className="text-xs text-[#16A865] mt-1">이미 일치</div>
            </div>
            <div className="bg-[#FEF2F2] rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-[#DC2626]">{verifyResult.failed.length}</div>
              <div className="text-xs text-[#DC2626] mt-1">등록실패</div>
            </div>
            <div className="bg-[#F9FAFB] rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-[#4E5968]">{verifyResult.notInExcel.length}</div>
              <div className="text-xs text-[#4E5968] mt-1">엑셀에 없음</div>
            </div>
          </div>

          {/* 디버그 정보 (임시) */}
          {(verifyResult as any).debug && (
            <div className="mx-6 mt-2 p-3 bg-[#F2F4F6] rounded-lg text-xs text-[#4E5968]">
              <div><strong>상호 컬럼:</strong> {(verifyResult as any).debug.tradeNameKey || "없음"} / <strong>회원명 컬럼:</strong> {(verifyResult as any).debug.memberNameKey || "없음"} / <strong>상태 컬럼:</strong> {(verifyResult as any).debug.statusKey || "없음"}</div>
              <div><strong>엑셀 행수:</strong> {(verifyResult as any).debug.totalRows} → <strong>이름 있는 행:</strong> {(verifyResult as any).debug.excelMapSize}</div>
              <div><strong>엑셀 샘플:</strong> {(verifyResult as any).debug.excelSampleNames?.join(", ")}</div>
              <div><strong>DB 샘플:</strong> {(verifyResult as any).debug.dbSampleNames?.join(", ")}</div>
            </div>
          )}

          {/* 상세 목록 */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* 1. 변경 필요 (등록성공인데 우리 시스템에서 미등록/등록요청중) */}
            {verifyResult.needsUpdate.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#92400E] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  변경 필요 — CMS 등록성공이나 시스템 미반영
                </h3>
                <div className="border border-orange-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FFFBEB]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">대표자</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">CMS 상태</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">현재 시스템</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">변경</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100">
                      {verifyResult.needsUpdate.map(item => (
                        <tr key={item.clientId} className={updatedIds.has(item.clientId) ? "bg-[#F1FBF4]" : ""}>
                          <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                          <td className="px-3 py-2 text-center text-[#4E5968]">{item.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs text-[#15803D] bg-[#E7F7EE] px-2 py-0.5 rounded-full">{item.excelStatus}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              item.currentStatus === "pending" ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#F2F4F6] text-[#6B7684]"
                            }`}>{statusLabel(item.currentStatus)}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {updatedIds.has(item.clientId) ? (
                              <span className="text-xs text-[#16A865] font-medium">완료</span>
                            ) : (
                              <button
                                onClick={() => handleUpdateSingle(item.clientId, "done")}
                                disabled={isPending}
                                className="text-xs px-3 py-1 rounded-lg bg-[#F59E0B] text-white hover:bg-[#B45309] disabled:opacity-50"
                              >
                                등록으로 변경
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. 등록실패 */}
            {verifyResult.failed.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#B91C1C] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#E02E2E]" />
                  등록실패 — CMS 사이트에서 실패 처리된 건
                </h3>
                <div className="border border-[#FECACA] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FEF2F2]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">대표자</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">실패 사유</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">현재 시스템</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">변경</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {verifyResult.failed.map(item => (
                        <tr key={item.clientId} className={updatedIds.has(item.clientId) ? "bg-[#F1FBF4]" : ""}>
                          <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                          <td className="px-3 py-2 text-center text-[#4E5968]">{item.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs text-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 rounded-full">{item.excelStatus}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              item.currentStatus === "done" ? "bg-[#E7F7EE] text-[#15803D]"
                              : item.currentStatus === "pending" ? "bg-[#FEF3C7] text-[#B45309]"
                              : "bg-[#F2F4F6] text-[#6B7684]"
                            }`}>{statusLabel(item.currentStatus)}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {updatedIds.has(item.clientId) ? (
                              <span className="text-xs text-[#16A865] font-medium">완료</span>
                            ) : item.currentStatus !== "none" ? (
                              <button
                                onClick={() => handleUpdateSingle(item.clientId, "none")}
                                disabled={isPending}
                                className="text-xs px-3 py-1 rounded-lg bg-[#E02E2E] text-white hover:bg-[#DC2626] disabled:opacity-50"
                              >
                                미등록으로 변경
                              </button>
                            ) : (
                              <span className="text-xs text-[#8B95A1]">변경 불필요</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. 일시정지 */}
            {verifyResult.paused.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#333D4B] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#8B95A1]" />
                  일시정지
                </h3>
                <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F9FAFB]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">대표자</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">상태</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">현재 시스템</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F4F6]">
                      {verifyResult.paused.map(item => (
                        <tr key={item.clientId}>
                          <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                          <td className="px-3 py-2 text-center text-[#4E5968]">{item.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs text-[#333D4B] bg-[#E5E8EB] px-2 py-0.5 rounded-full">{item.excelStatus}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              item.currentStatus === "done" ? "bg-[#E7F7EE] text-[#15803D]"
                              : item.currentStatus === "pending" ? "bg-[#FEF3C7] text-[#B45309]"
                              : "bg-[#F2F4F6] text-[#6B7684]"
                            }`}>{statusLabel(item.currentStatus)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. 이미 일치 */}
            {verifyResult.alreadyDone.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#15803D] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1AB266]" />
                  이미 일치 — CMS 등록성공 + 시스템 등록 완료
                </h3>
                <div className="border border-[#BBF7D0] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F1FBF4]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">대표자</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">CMS 상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {verifyResult.alreadyDone.map(item => (
                        <tr key={item.clientId}>
                          <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                          <td className="px-3 py-2 text-center text-[#4E5968]">{item.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs text-[#15803D] bg-[#E7F7EE] px-2 py-0.5 rounded-full">{item.excelStatus}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. 엑셀에 없는 내 거래처 */}
            {verifyResult.notInExcel.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#6B7684] mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#D1D6DB]" />
                  엑셀에 없음 — CMS 미등록 추정 ({verifyResult.notInExcel.length}건)
                </h3>
                <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F9FAFB]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[#333D4B]">거래처명</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">대표자</th>
                        <th className="px-3 py-2 text-center text-[#333D4B]">현재 시스템</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F4F6]">
                      {verifyResult.notInExcel.map(item => (
                        <tr key={item.clientId}>
                          <td className="px-3 py-2 font-medium text-[#191F28]">{item.clientName}</td>
                          <td className="px-3 py-2 text-center text-[#4E5968]">{item.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              item.currentStatus === "done" ? "bg-[#E7F7EE] text-[#15803D]"
                              : item.currentStatus === "pending" ? "bg-[#FEF3C7] text-[#B45309]"
                              : "bg-[#F2F4F6] text-[#6B7684]"
                            }`}>{statusLabel(item.currentStatus)}</span>
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

    <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#F9FAFB] border-b border-[#F2F4F6]">
          <tr>
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={rows.length > 0 && checkedIds.size === rows.length}
                onChange={toggleAll}
                className="accent-[#3182F6] w-4 h-4 cursor-pointer"
              />
            </th>
            {([
              { key: "name" as SortCol, label: "고객사명" },
              { key: "ceoName" as SortCol, label: "대표자명" },
              { key: "monthlyFee" as SortCol, label: "월 기장료" },
            ]).map(({ key, label }) => (
              <th key={key} className="text-center px-4 py-3 text-[#333D4B] font-medium">
                <button
                  onClick={() => handleSort(key)}
                  className="flex items-center justify-center mx-auto hover:text-[#191F28]"
                >
                  {label}
                  <SortIcon col={key} />
                </button>
              </th>
            ))}
            <th className="text-center px-3 py-3 text-[#6B7684] font-medium text-xs">출금정보</th>

            <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
              <div className="relative inline-block" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${monthFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                >
                  최초 출금월
                  {monthFilter.length > 0 && (
                    <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                      {monthFilter.length}
                    </span>
                  )}
                  <span className="text-[#8B95A1] text-[10px]">▼</span>
                </button>
                {filterOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[140px] max-h-60 overflow-y-auto">
                    {allMonths.length === 0 ? (
                      <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                    ) : (
                      allMonths.map((m) => (
                        <label
                          key={m}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={monthFilter.includes(m)}
                            onChange={() => toggleMonth(m)}
                            className="accent-[#3182F6]"
                          />
                          {m}
                        </label>
                      ))
                    )}
                    {monthFilter.length > 0 && (
                      <button
                        onClick={() => setMonthFilter([])}
                        className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                )}
              </div>
            </th>

            <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
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

            <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
              <button
                onClick={() => handleSort("cmsStatus")}
                className="flex items-center justify-center mx-auto hover:text-[#191F28]"
              >
                CMS 등록여부
                <SortIcon col="cmsStatus" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F2F4F6]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-center py-12 text-[#6B7684]">
                {monthFilter.length > 0 ? "필터 조건에 맞는 고객사가 없습니다" : "등록된 고객사가 없습니다"}
              </td>
            </tr>
          ) : (
            rows.map((client) => {
              // 최초출금월이 현재월 이하인데 미등록이면 경고
              const now = new Date();
              const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              const isOverdue = client.cmsStatus === "none" && client.firstWithdrawalMonth && client.firstWithdrawalMonth <= currentYM;
              return (
              <tr
                key={client.id}
                className={`transition-colors ${
                  isOverdue
                    ? "bg-[#FFFBEB] hover:bg-[#FEF3C7]"
                    : checkedIds.has(client.id)
                    ? "bg-[#F5F9FF]/50 hover:bg-[#F5F9FF]"
                    : "hover:bg-[#F5F9FF]/50"
                }`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(client.id)}
                    onClick={(e) => { e.stopPropagation(); toggleCheck(client.id, e as unknown as React.MouseEvent); }}
                    onChange={() => {}}
                    className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-center text-[#191F28] font-medium">{client.name}</td>
                <td className="px-4 py-3 text-center text-[#191F28]">{client.ceoName || <span className="text-[#8B95A1]">-</span>}</td>
                <td className="px-4 py-3 text-center text-[#191F28]">
                  {client.monthlyFee != null ? `${client.monthlyFee.toLocaleString()}원` : <span className="text-[#8B95A1]">-</span>}
                </td>
                <td className="px-3 py-3 text-center">
                  {client.bankName || client.bankAccount ? (
                    <div className="text-xs text-[#6B7684]">
                      <span>{client.bankName || "-"}</span>
                      {client.bankAccount && (
                        <div className="text-[10px] text-[#8B95A1]">{client.bankAccount}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#F87171]">미입력</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-[#191F28]">{client.firstWithdrawalMonth || <span className="text-[#8B95A1]">-</span>}</td>
                <td className="px-4 py-3 text-center text-xs">{client.affiliation === "세이브택스" ? <span className="text-[#3182F6] font-bold">세이브택스</span> : client.affiliation ? <span className="text-[#4E5968]">{client.affiliation}</span> : <span className="text-[#B0B8C1]">-</span>}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleCycle(client.id)}
                    disabled={isPending}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      client.cmsStatus === "done"
                        ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]"
                        : client.cmsStatus === "pending"
                        ? "bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A]"
                        : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
                    }`}
                  >
                    {client.cmsStatus === "done" ? "등록" : client.cmsStatus === "pending" ? "등록요청중" : "미등록"}
                  </button>
                </td>
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
