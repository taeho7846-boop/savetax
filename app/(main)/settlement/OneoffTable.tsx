"use client";

import { useState, useTransition } from "react";
import { createOneoffSettlement, toggleOneoffField, deleteOneoffSettlement } from "@/app/actions/settlement";

type Item = {
  id: number;
  clientName: string;
  ceoName: string | null;
  assignedUserName: string | null;
  withdrawalAmount: number;
  fee: number;
  withdrawn: boolean;
  remitted: boolean;
  tiIssued: boolean;
  notes: string | null;
};

export function OneoffTable({ items, yearMonth }: { items: Item[]; yearMonth: string }) {
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState(false);

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

  function handleCreate() {
    const clientName = (document.getElementById("oneoff-name") as HTMLInputElement)?.value?.trim();
    if (!clientName) { alert("거래처명을 입력하세요"); return; }
    const ceoName = (document.getElementById("oneoff-ceo") as HTMLInputElement)?.value?.trim() || undefined;
    const assignedUserName = (document.getElementById("oneoff-assigned") as HTMLInputElement)?.value?.trim() || undefined;
    const withdrawalAmount = parseInt((document.getElementById("oneoff-amount") as HTMLInputElement)?.value || "0") || 0;
    const fee = parseInt((document.getElementById("oneoff-fee") as HTMLInputElement)?.value || "0") || 0;
    const notes = (document.getElementById("oneoff-notes") as HTMLInputElement)?.value?.trim() || undefined;

    startTransition(async () => {
      await createOneoffSettlement({ yearMonth, clientName, ceoName, assignedUserName, withdrawalAmount, fee, notes });
      setModal(false);
    });
  }

  return (
    <>
      {/* 상단 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setModal(true)}
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
          <tbody className="divide-y divide-gray-50">
            {items.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-gray-400">등록된 단건 정산이 없습니다</td></tr>
            ) : items.map(item => {
              const remit = item.withdrawalAmount - item.fee;
              return (
                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-2.5 text-[#1a2e4a] font-medium">{item.clientName}</td>
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
          </tbody>
        </table>
      </div>

      {/* 추가 모달 */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900">단건 정산 추가</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-sm text-gray-500 block mb-1">거래처명 <span className="text-red-400">*</span></label>
                <input id="oneoff-name" type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="거래처명" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-1">대표자명</label>
                  <input id="oneoff-ceo" type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">담당자</label>
                  <input id="oneoff-assigned" type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-500 block mb-1">출금액</label>
                  <input id="oneoff-amount" type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-gray-500 block mb-1">수수료</label>
                  <input id="oneoff-fee" type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">비고 (내용설명)</label>
                <input id="oneoff-notes" type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" placeholder="내용 입력" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">취소</button>
              <button onClick={handleCreate} disabled={isPending} className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50">추가</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
