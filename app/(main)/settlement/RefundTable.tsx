"use client";

import React from "react";
import { useState, useTransition } from "react";
import { createRefundSettlement, updateRefundSettlement, toggleRefundField, deleteRefundSettlement } from "@/app/actions/settlement";

const AFF_ORDER = ["도율세무회계", "세무회계세웅", "예강세무회계", "세무회계태호"];
const AFF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "도율세무회계": { bg: "bg-[#F5F9FF]", text: "text-[#1B64DA]", border: "border-[#A3CAFD]" },
  "세무회계세웅": { bg: "bg-[#F1FBF4]", text: "text-[#15803D]", border: "border-[#BBF7D0]" },
  "예강세무회계": { bg: "bg-[#F5F9FF]", text: "text-[#1B64DA]", border: "border-[#A3CAFD]" },
  "세무회계태호": { bg: "bg-[#FFFBEB]", text: "text-[#B45309]", border: "border-[#FDE68A]" },
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
  notes: string | null;
};

export function RefundTable({ items, yearMonth }: { items: Item[]; yearMonth: string }) {
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<"create" | Item | null>(null);

  const totalWithdrawal = items.reduce((s, r) => s + r.withdrawalAmount, 0);
  const totalFee = items.reduce((s, r) => s + r.fee, 0);
  const totalRemit = items.reduce((s, r) => s + (r.withdrawalAmount - r.fee), 0);

  function handleToggle(id: number, field: "withdrawn" | "remitted") {
    startTransition(() => toggleRefundField(id, field));
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(() => deleteRefundSettlement(id));
  }

  function handleSave() {
    const clientName = (document.getElementById("refund-name") as HTMLInputElement)?.value?.trim();
    if (!clientName) { alert("거래처명을 입력하세요"); return; }
    const ceoName = (document.getElementById("refund-ceo") as HTMLInputElement)?.value?.trim() || undefined;
    const assignedUserName = (document.getElementById("refund-assigned") as HTMLInputElement)?.value?.trim() || undefined;
    const affiliation = (document.getElementById("refund-aff") as HTMLSelectElement)?.value || undefined;
    const withdrawalAmount = parseInt((document.getElementById("refund-amount") as HTMLInputElement)?.value || "0") || 0;
    const fee = parseInt((document.getElementById("refund-fee") as HTMLInputElement)?.value || "0") || 0;
    const notes = (document.getElementById("refund-notes") as HTMLInputElement)?.value?.trim() || undefined;

    if (modal === "create") {
      startTransition(async () => {
        await createRefundSettlement({ yearMonth, clientName, ceoName, assignedUserName, affiliation, withdrawalAmount, fee, notes });
        setModal(null);
      });
    } else if (modal && typeof modal === "object") {
      startTransition(async () => {
        await updateRefundSettlement(modal.id, { clientName, ceoName, assignedUserName, affiliation, withdrawalAmount, fee, notes });
        setModal(null);
      });
    }
  }

  const editRow = modal !== null && modal !== "create" ? (modal as Item) : null;

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
          className="text-sm px-4 py-2 rounded-lg font-medium bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors"
        >
          + 환불 추가
        </button>
        <div className="flex gap-4 text-sm text-[#6B7684]">
          <span>총출금: <strong className="text-[#191F28]">{totalWithdrawal.toLocaleString()}원</strong></span>
          <span>수수료: <strong className="text-[#191F28]">{totalFee.toLocaleString()}원</strong></span>
          <span>송금요청: <strong className="text-[#191F28]">{totalRemit.toLocaleString()}원</strong></span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
            <tr>
              <th className="text-left px-4 py-3 text-[#333D4B] font-bold text-xs">거래처명</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">대표자명</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">담당자</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">출금액</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">수수료</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-bold text-xs text-[#191F28]">송금요청액</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">출금</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">송금</th>
              <th className="text-left px-3 py-3 text-[#333D4B] font-medium text-xs">비고</th>
              <th className="text-center px-3 py-3 text-[#6B7684] font-medium text-xs w-14">삭제</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-[#8B95A1]">등록된 환불 정산이 없습니다</td></tr>
            ) : groups.map(group => {
              const colors = AFF_COLORS[group.aff] || { bg: "bg-[#F9FAFB]", text: "text-[#4E5968]", border: "border-[#E5E8EB]" };
              const gWithdrawal = group.rows.reduce((s, r) => s + r.withdrawalAmount, 0);
              const gFee = group.rows.reduce((s, r) => s + r.fee, 0);
              return (
                <React.Fragment key={group.aff}>
                  <tr className={colors.bg}>
                    <td colSpan={10} className={`px-4 py-2 border-t border-b ${colors.border}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${colors.text}`}>{group.aff}</span>
                        <span className="text-[10px] text-[#8B95A1]">{group.rows.length}건</span>
                        <span className="text-[10px] text-[#8B95A1] ml-auto">
                          출금 {gWithdrawal.toLocaleString()} / 수수료 {gFee.toLocaleString()} / 송금 {(gWithdrawal - gFee).toLocaleString()}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(item => {
                    const remit = item.withdrawalAmount - item.fee;
                    return (
                      <tr key={item.id} className="hover:bg-[#F5F9FF]/30 transition-colors border-b border-[#F2F4F6]">
                        <td className="px-4 py-2.5 text-[#191F28] font-medium cursor-pointer hover:underline" onClick={() => setModal(item)}>{item.clientName}</td>
                        <td className="px-3 py-2.5 text-center text-[#333D4B]">{item.ceoName || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-[#4E5968] text-xs">{item.assignedUserName || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-[#191F28]">{item.withdrawalAmount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center text-[#191F28]">{item.fee.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-[#191F28]">{remit.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={item.withdrawn} onChange={() => handleToggle(item.id, "withdrawn")} disabled={isPending} className="accent-[#3182F6] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={item.remitted} onChange={() => handleToggle(item.id, "remitted")} disabled={isPending} className="accent-[#3182F6] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-[#6B7684] text-xs max-w-[200px] truncate">{item.notes || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => handleDelete(item.id)} className="text-[#B0B8C1] hover:text-[#E02E2E] text-xs">✕</button>
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

      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[#191F28]">{modal === "create" ? "환불 정산 추가" : "환불 정산 수정"}</h3>
              <button onClick={() => setModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">거래처명 <span className="text-[#F87171]">*</span></label>
                <input id="refund-name" type="text" defaultValue={editRow?.clientName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="거래처명" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">대표자명</label>
                  <input id="refund-ceo" type="text" defaultValue={editRow?.ceoName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">담당자</label>
                  <input id="refund-assigned" type="text" defaultValue={editRow?.assignedUserName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">소속</label>
                <select id="refund-aff" defaultValue={editRow?.affiliation || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]">
                  <option value="">선택</option>
                  {AFF_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">출금액</label>
                  <input id="refund-amount" type="number" defaultValue={editRow?.withdrawalAmount || 0} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">수수료</label>
                  <input id="refund-fee" type="number" defaultValue={editRow?.fee || 0} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">비고 (내용설명)</label>
                <input id="refund-notes" type="text" defaultValue={editRow?.notes || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="내용 입력" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6]">취소</button>
              <button onClick={handleSave} disabled={isPending} className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50">
                {modal === "create" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
