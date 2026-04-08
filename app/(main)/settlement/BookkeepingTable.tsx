"use client";

import React from "react";
import { useState, useTransition } from "react";
import { upsertBookkeepingSettlement, toggleBookkeepingField } from "@/app/actions/settlement";

const AFF_ORDER = ["도율세무회계", "세무회계세웅", "예강세무회계", "세무회계태호"];
const AFF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "도율세무회계": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "세무회계세웅": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "예강세무회계": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  "세무회계태호": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
};

type Row = {
  clientId: number;
  clientName: string;
  ceoName: string | null;
  assignedUserName: string | null;
  affiliation: string;
  monthlyFee: number;
  settlementStartMonth: string | null;
  headquarterFee: number;
  withdrawn: boolean;
  remitted: boolean;
  tiIssued: boolean;
  notes: string;
};

export function BookkeepingTable({ rows, yearMonth }: { rows: Row[]; yearMonth: string }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Row | null>(null);

  const filtered = search ? rows.filter(r => r.clientName.includes(search)) : rows;

  // 합계
  const totalFee = filtered.reduce((s, r) => s + r.monthlyFee, 0);
  const totalHQ = filtered.reduce((s, r) => s + r.headquarterFee, 0);
  const totalRemit = filtered.reduce((s, r) => s + (r.monthlyFee - r.headquarterFee), 0);

  function handleToggle(clientId: number, field: "withdrawn" | "remitted" | "tiIssued") {
    startTransition(() => toggleBookkeepingField(clientId, yearMonth, field));
  }

  function handleSaveModal() {
    if (!modal) return;
    const hqFee = parseInt((document.getElementById("modal-hqfee") as HTMLInputElement)?.value || "0") || 0;
    const notes = (document.getElementById("modal-notes") as HTMLInputElement)?.value || "";
    const startMonth = (document.getElementById("modal-startmonth") as HTMLInputElement)?.value || "";
    startTransition(async () => {
      await upsertBookkeepingSettlement(modal.clientId, yearMonth, { headquarterFee: hqFee, notes, settlementStartMonth: startMonth });
      setModal(null);
    });
  }

  return (
    <>
      {/* 검색 + 합계 */}
      <div className="flex items-center justify-between mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="거래처명 검색"
          autoComplete="off"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        <div className="flex gap-4 text-sm text-gray-500">
          <span>총기장료: <strong className="text-gray-800">{totalFee.toLocaleString()}원</strong></span>
          <span>본점지급: <strong className="text-gray-800">{totalHQ.toLocaleString()}원</strong></span>
          <span>송금요청: <strong className="text-[#1a2e4a]">{totalRemit.toLocaleString()}원</strong></span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-700 font-semibold text-xs">거래처명</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">대표자명</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">담당자</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">총기장료</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">본점지급액</th>
              <th className="text-center px-3 py-3 text-gray-700 font-semibold text-xs text-[#1a2e4a]">송금요청액</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">출금</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">송금</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">T/I</th>
              <th className="text-left px-3 py-3 text-gray-700 font-medium text-xs">비고</th>
              <th className="text-center px-3 py-3 text-gray-500 font-medium text-xs w-14">설정</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-gray-400">거래처가 없습니다</td></tr>
            ) : (() => {
              // 소속별 그룹핑
              const groups: { aff: string; rows: Row[] }[] = [];
              for (const aff of AFF_ORDER) {
                const g = filtered.filter(r => r.affiliation === aff);
                if (g.length > 0) groups.push({ aff, rows: g });
              }
              const others = filtered.filter(r => !AFF_ORDER.includes(r.affiliation));
              if (others.length > 0) groups.push({ aff: "기타", rows: others });

              return groups.map(group => {
                const colors = AFF_COLORS[group.aff] || { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" };
                const groupTotal = group.rows.reduce((s, r) => s + r.monthlyFee, 0);
                const groupHQ = group.rows.reduce((s, r) => s + r.headquarterFee, 0);
                return (
                  <React.Fragment key={group.aff}>
                    <tr className={colors.bg}>
                      <td colSpan={11} className={`px-4 py-2 border-t border-b ${colors.border}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold ${colors.text}`}>{group.aff}</span>
                          <span className="text-[10px] text-gray-400">{group.rows.length}개</span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            기장료 {groupTotal.toLocaleString()} / 본점 {groupHQ.toLocaleString()} / 송금 {(groupTotal - groupHQ).toLocaleString()}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map(row => {
                      const remitAmount = row.monthlyFee - row.headquarterFee;
                      return (
                        <tr key={row.clientId} className="hover:bg-blue-50/30 transition-colors border-b border-gray-50">
                          <td className="px-4 py-2.5 text-[#1a2e4a] font-medium">{row.clientName}</td>
                          <td className="px-3 py-2.5 text-center text-gray-700">{row.ceoName || <span className="text-gray-300">-</span>}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{row.assignedUserName || <span className="text-gray-300">-</span>}</td>
                          <td className="px-3 py-2.5 text-center text-gray-800">{row.monthlyFee.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-center text-gray-800">
                            {row.headquarterFee > 0 ? row.headquarterFee.toLocaleString() : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium text-[#1a2e4a]">
                            {remitAmount > 0 ? remitAmount.toLocaleString() : row.monthlyFee.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" checked={row.withdrawn} onChange={() => handleToggle(row.clientId, "withdrawn")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" checked={row.remitted} onChange={() => handleToggle(row.clientId, "remitted")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" checked={row.tiIssued} onChange={() => handleToggle(row.clientId, "tiIssued")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">{row.notes || <span className="text-gray-300">-</span>}</td>
                          <td className="px-3 py-2.5 text-center">
                            <button onClick={() => setModal(row)} className="text-gray-400 hover:text-[#1a2e4a] text-xs">✏️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* 설정 모달 */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">기장 정산 설정</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-20">거래처명</span>
                <span className="font-medium text-gray-900">{modal.clientName}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-20">대표자명</span>
                <span className="text-gray-700">{modal.ceoName || "-"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-20">총기장료</span>
                <span className="text-gray-700">{modal.monthlyFee.toLocaleString()}원</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-20">담당자</span>
                <span className="text-gray-700">{modal.assignedUserName || "-"}</span>
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">출금시작월</label>
                <input
                  id="modal-startmonth"
                  type="month"
                  defaultValue={modal.settlementStartMonth || ""}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">본점지급액</label>
                <input
                  id="modal-hqfee"
                  type="number"
                  defaultValue={modal.headquarterFee}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">비고 (내용설명)</label>
                <input
                  id="modal-notes"
                  type="text"
                  defaultValue={modal.notes}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20"
                  placeholder="내용 입력"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">취소</button>
              <button onClick={handleSaveModal} disabled={isPending} className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50">저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
