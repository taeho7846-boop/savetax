"use client";

import React from "react";
import { useState, useTransition } from "react";
import { createOneoffSettlement, updateOneoffSettlement, toggleOneoffField, deleteOneoffSettlement } from "@/app/actions/settlement";

const AFF_ORDER = ["도율세무회계", "세무회계세웅", "예강세무회계", "세무회계태호"];
const AFF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "도율세무회계": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "세무회계세웅": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "예강세무회계": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  "세무회계태호": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
};

type Item = {
  id: number;
  clientName: string;
  ceoName: string | null;
  assignedUserName: string | null;
  affiliation: string | null;
  withdrawalAmount: number;
  fee: number;
  withdrawn: boolean;
  remitted: boolean;
  tiIssued: boolean;
  notes: string | null;
};

export function OneoffTable({ items, yearMonth }: { items: Item[]; yearMonth: string }) {
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<"create" | Item | null>(null);

  // 합계
  const totalWithdrawal = items.reduce((s, r) => s + r.withdrawalAmount, 0);
  const totalFee = items.reduce((s, r) => s + r.fee, 0);
  const totalRemit = items.reduce((s, r) => s + (r.withdrawalAmount - r.fee), 0);

  function handleToggle(id: number, field: "withdrawn" | "remitted" | "tiIssued") {
    startTransition(() => toggleOneoffField(id, field));
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(() => deleteOneoffSettlement(id));
  }

  function handleSave() {
    const clientName = (document.getElementById("oneoff-name") as HTMLInputElement)?.value?.trim();
    if (!clientName) { alert("거래처명을 입력하세요"); return; }
    const ceoName = (document.getElementById("oneoff-ceo") as HTMLInputElement)?.value?.trim() || undefined;
    const assignedUserName = (document.getElementById("oneoff-assigned") as HTMLInputElement)?.value?.trim() || undefined;
    const affiliation = (document.getElementById("oneoff-aff") as HTMLSelectElement)?.value || undefined;
    const withdrawalAmount = parseInt((document.getElementById("oneoff-amount") as HTMLInputElement)?.value || "0") || 0;
    const fee = parseInt((document.getElementById("oneoff-fee") as HTMLInputElement)?.value || "0") || 0;
    const notes = (document.getElementById("oneoff-notes") as HTMLInputElement)?.value?.trim() || undefined;

    if (modal === "create") {
      startTransition(async () => {
        await createOneoffSettlement({ yearMonth, clientName, ceoName, assignedUserName, affiliation, withdrawalAmount, fee, notes });
        setModal(null);
      });
    } else if (modal && typeof modal === "object") {
      startTransition(async () => {
        await updateOneoffSettlement(modal.id, { clientName, ceoName, assignedUserName, affiliation, withdrawalAmount, fee, notes });
        setModal(null);
      });
    }
  }

  const editRow = modal !== null && modal !== "create" ? (modal as Item) : null;

  // 그룹핑
  const groups: { aff: string; rows: Item[] }[] = [];
  for (const aff of AFF_ORDER) {
    const g = items.filter(r => r.affiliation === aff);
    if (g.length > 0) groups.push({ aff, rows: g });
  }
  const others = items.filter(r => !r.affiliation || !AFF_ORDER.includes(r.affiliation));
  if (others.length > 0) groups.push({ aff: "기타", rows: others });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setModal("create")}
          className="text-sm px-4 py-2 rounded-lg font-medium bg-[#1a2e4a] text-white hover:bg-[#243d61] transition-colors"
        >
          + 단건 추가
        </button>
        <div className="flex gap-4 text-sm text-gray-500">
          <span>총출금: <strong className="text-gray-800">{totalWithdrawal.toLocaleString()}원</strong></span>
          <span>수수료: <strong className="text-gray-800">{totalFee.toLocaleString()}원</strong></span>
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
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">출금액</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">수수료</th>
              <th className="text-center px-3 py-3 text-gray-700 font-semibold text-xs text-[#1a2e4a]">송금요청액</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">출금</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">송금</th>
              <th className="text-center px-3 py-3 text-gray-700 font-medium text-xs">T/I</th>
              <th className="text-left px-3 py-3 text-gray-700 font-medium text-xs">비고</th>
              <th className="text-center px-3 py-3 text-gray-500 font-medium text-xs w-14">삭제</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-gray-400">등록된 단건 정산이 없습니다</td></tr>
            ) : groups.map(group => {
              const colors = AFF_COLORS[group.aff] || { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" };
              const gWithdrawal = group.rows.reduce((s, r) => s + r.withdrawalAmount, 0);
              const gFee = group.rows.reduce((s, r) => s + r.fee, 0);
              return (
                <React.Fragment key={group.aff}>
                  <tr className={colors.bg}>
                    <td colSpan={11} className={`px-4 py-2 border-t border-b ${colors.border}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${colors.text}`}>{group.aff}</span>
                        <span className="text-[10px] text-gray-400">{group.rows.length}건</span>
                        <span className="text-[10px] text-gray-400 ml-auto">
                          출금 {gWithdrawal.toLocaleString()} / 수수료 {gFee.toLocaleString()} / 송금 {(gWithdrawal - gFee).toLocaleString()}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(item => {
                    const remit = item.withdrawalAmount - item.fee;
                    return (
                      <tr key={item.id} className="hover:bg-blue-50/30 transition-colors border-b border-gray-50">
                        <td className="px-4 py-2.5 text-[#1a2e4a] font-medium cursor-pointer hover:underline" onClick={() => setModal(item)}>{item.clientName}</td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{item.ceoName || <span className="text-gray-300">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{item.assignedUserName || <span className="text-gray-300">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-gray-800">{item.withdrawalAmount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center text-gray-800">{item.fee.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-[#1a2e4a]">{remit.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={item.withdrawn} onChange={() => handleToggle(item.id, "withdrawn")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={item.remitted} onChange={() => handleToggle(item.id, "remitted")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={item.tiIssued} onChange={() => handleToggle(item.id, "tiIssued")} disabled={isPending} className="accent-[#1a2e4a] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">{item.notes || <span className="text-gray-300">-</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 추가/수정 모달 */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">{modal === "create" ? "단건 정산 추가" : "단건 정산 수정"}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-sm text-gray-500 block mb-1">거래처명 <span className="text-red-400">*</span></label>
                <input id="oneoff-name" type="text" defaultValue={editRow?.clientName || ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="거래처명" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-1">대표자명</label>
                  <input id="oneoff-ceo" type="text" defaultValue={editRow?.ceoName || ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">담당자</label>
                  <input id="oneoff-assigned" type="text" defaultValue={editRow?.assignedUserName || ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">소속</label>
                <select id="oneoff-aff" defaultValue={editRow?.affiliation || ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20">
                  <option value="">선택</option>
                  {AFF_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-1">출금액</label>
                  <input id="oneoff-amount" type="number" defaultValue={editRow?.withdrawalAmount || 0} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">수수료</label>
                  <input id="oneoff-fee" type="number" defaultValue={editRow?.fee || 0} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">비고 (내용설명)</label>
                <input id="oneoff-notes" type="text" defaultValue={editRow?.notes || ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="내용 입력" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">취소</button>
              <button onClick={handleSave} disabled={isPending} className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50">
                {modal === "create" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
