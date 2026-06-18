"use client";

import React from "react";
import { useState, useTransition } from "react";
import {
  createBookkeepingSettlement,
  updateBookkeepingSettlement,
  toggleBookkeepingField,
  deleteBookkeepingSettlement,
} from "@/app/actions/settlement";

const AFF_ORDER = ["도율세무회계", "세무회계세웅", "예강세무회계", "세무회계태호"];
const AFF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "도율세무회계": { bg: "bg-[#F5F9FF]", text: "text-[#1B64DA]", border: "border-[#A3CAFD]" },
  "세무회계세웅": { bg: "bg-[#F1FBF4]", text: "text-[#15803D]", border: "border-[#BBF7D0]" },
  "예강세무회계": { bg: "bg-[#F5F9FF]", text: "text-[#1B64DA]", border: "border-[#A3CAFD]" },
  "세무회계태호": { bg: "bg-[#FFFBEB]", text: "text-[#B45309]", border: "border-[#FDE68A]" },
};

type Row = {
  id: number;
  clientName: string;
  ceoName: string | null;
  assignedUserName: string | null;
  affiliation: string | null;
  monthlyFee: number;
  headquarterFee: number;
  startMonth: string | null;
  withdrawn: boolean;
  remitted: boolean;
  tiIssued: boolean;
  notes: string | null;
};

export function BookkeepingTable({ rows, yearMonth }: { rows: Row[]; yearMonth: string }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | Row | null>(null);

  // 출금시작월 이후만 표시
  const visible = rows.filter(r => !r.startMonth || r.startMonth <= yearMonth);
  const filtered = search ? visible.filter(r => r.clientName.includes(search)) : visible;

  // 합계 — 출금 체크(직접 확인)한 행만 청구액에 합산
  const checkedRows = filtered.filter(r => r.withdrawn);
  const totalFee = checkedRows.reduce((s, r) => s + r.monthlyFee, 0);
  const totalHQ = checkedRows.reduce((s, r) => s + r.headquarterFee, 0);
  const totalRemit = checkedRows.reduce((s, r) => s + (r.monthlyFee - r.headquarterFee), 0);

  function handleToggle(id: number, field: "withdrawn" | "remitted" | "tiIssued") {
    startTransition(() => toggleBookkeepingField(id, yearMonth, field));
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(() => deleteBookkeepingSettlement(id));
  }

  function handleSave() {
    const clientName = (document.getElementById("bk-name") as HTMLInputElement)?.value?.trim();
    if (!clientName) { alert("거래처명을 입력하세요"); return; }
    const ceoName = (document.getElementById("bk-ceo") as HTMLInputElement)?.value?.trim() || undefined;
    const assignedUserName = (document.getElementById("bk-assigned") as HTMLInputElement)?.value?.trim() || undefined;
    const affiliation = (document.getElementById("bk-aff") as HTMLSelectElement)?.value || undefined;
    const monthlyFee = parseInt((document.getElementById("bk-fee") as HTMLInputElement)?.value || "0") || 0;
    const headquarterFee = parseInt((document.getElementById("bk-hqfee") as HTMLInputElement)?.value || "0") || 0;
    const startMonth = (document.getElementById("bk-startmonth") as HTMLInputElement)?.value || undefined;
    const notes = (document.getElementById("bk-notes") as HTMLInputElement)?.value?.trim() || undefined;

    if (modal === "create") {
      startTransition(async () => {
        await createBookkeepingSettlement({ clientName, ceoName, assignedUserName, affiliation, monthlyFee, headquarterFee, startMonth, notes });
        setModal(null);
      });
    } else if (modal && typeof modal === "object") {
      startTransition(async () => {
        await updateBookkeepingSettlement(modal.id, { clientName, ceoName, assignedUserName, affiliation, monthlyFee, headquarterFee, startMonth, notes });
        setModal(null);
      });
    }
  }

  // 그룹핑
  const groups: { aff: string; rows: Row[] }[] = [];
  for (const aff of AFF_ORDER) {
    const g = filtered.filter(r => r.affiliation === aff);
    if (g.length > 0) groups.push({ aff, rows: g });
  }
  const others = filtered.filter(r => !r.affiliation || !AFF_ORDER.includes(r.affiliation));
  if (others.length > 0) groups.push({ aff: "기타", rows: others });

  const isEditing = modal !== null && modal !== "create";
  const editRow = isEditing ? (modal as Row) : null;

  return (
    <>
      {/* 상단 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModal("create")}
            className="text-sm px-4 py-2 rounded-lg font-medium bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors"
          >
            + 기장 등록
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="거래처명 검색"
            autoComplete="off"
            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-[#3182F6]"
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-[#6B7684]">
          <span className="text-[11px] text-[#8B95A1] bg-[#F2F4F6] px-2 py-0.5 rounded-full">출금 체크 {checkedRows.length}/{filtered.length}건 기준</span>
          <span>총기장료: <strong className="text-[#191F28]">{totalFee.toLocaleString()}원</strong></span>
          <span>본점지급: <strong className="text-[#191F28]">{totalHQ.toLocaleString()}원</strong></span>
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
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">총기장료</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">본점지급액</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-bold text-xs text-[#191F28]">송금요청액</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">출금</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">송금</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">T/I</th>
              <th className="text-left px-3 py-3 text-[#333D4B] font-medium text-xs">비고</th>
              <th className="text-center px-3 py-3 text-[#6B7684] font-medium text-xs w-20">관리</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-[#8B95A1]">등록된 기장 정산이 없습니다</td></tr>
            ) : groups.map(group => {
              const colors = AFF_COLORS[group.aff] || { bg: "bg-[#F9FAFB]", text: "text-[#4E5968]", border: "border-[#E5E8EB]" };
              const gChecked = group.rows.filter(r => r.withdrawn);
              const gFee = gChecked.reduce((s, r) => s + r.monthlyFee, 0);
              const gHQ = gChecked.reduce((s, r) => s + r.headquarterFee, 0);
              return (
                <React.Fragment key={group.aff}>
                  <tr className={colors.bg}>
                    <td colSpan={11} className={`px-4 py-2 border-t border-b ${colors.border}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${colors.text}`}>{group.aff}</span>
                        <span className="text-[10px] text-[#8B95A1]">출금 {gChecked.length}/{group.rows.length}건</span>
                        <span className="text-[10px] text-[#8B95A1] ml-auto">
                          기장료 {gFee.toLocaleString()} / 본점 {gHQ.toLocaleString()} / 송금 {(gFee - gHQ).toLocaleString()}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const remit = row.monthlyFee - row.headquarterFee;
                    return (
                      <tr key={row.id} className="hover:bg-[#F5F9FF]/30 transition-colors border-b border-[#F2F4F6]">
                        <td className="px-4 py-2.5 text-[#191F28] font-medium cursor-pointer hover:underline" onClick={() => setModal(row)}>{row.clientName}</td>
                        <td className="px-3 py-2.5 text-center text-[#333D4B]">{row.ceoName || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-[#4E5968] text-xs">{row.assignedUserName || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center text-[#191F28]">{row.monthlyFee.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center text-[#191F28]">
                          {row.headquarterFee > 0 ? row.headquarterFee.toLocaleString() : <span className="text-[#B0B8C1]">-</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-medium ${row.withdrawn ? "text-[#191F28]" : "text-[#C4CAD2] line-through"}`} title={row.withdrawn ? "출금 체크됨 — 청구 합계 포함" : "출금 미체크 — 청구 합계 제외"}>{remit.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={row.withdrawn} onChange={() => handleToggle(row.id, "withdrawn")} disabled={isPending} className="accent-[#3182F6] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={row.remitted} onChange={() => handleToggle(row.id, "remitted")} disabled={isPending} className="accent-[#3182F6] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={row.tiIssued} onChange={() => handleToggle(row.id, "tiIssued")} disabled={isPending} className="accent-[#3182F6] w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2.5 text-[#6B7684] text-xs max-w-[200px] truncate">{row.notes || <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setModal(row)} className="text-[#8B95A1] hover:text-[#191F28] text-xs">✏️</button>
                            <button onClick={() => handleDelete(row.id)} className="text-[#B0B8C1] hover:text-[#E02E2E] text-xs">✕</button>
                          </div>
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

      {/* 등록/수정 모달 */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[#191F28]">
                {modal === "create" ? "기장 등록" : "기장 수정"}
              </h3>
              <button onClick={() => setModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">거래처명 <span className="text-[#F87171]">*</span></label>
                <input id="bk-name" type="text" defaultValue={editRow?.clientName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">대표자명</label>
                  <input id="bk-ceo" type="text" defaultValue={editRow?.ceoName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">담당자</label>
                  <input id="bk-assigned" type="text" defaultValue={editRow?.assignedUserName || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">소속</label>
                <select id="bk-aff" defaultValue={editRow?.affiliation || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]">
                  <option value="">선택</option>
                  {AFF_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">총기장료</label>
                  <input id="bk-fee" type="number" defaultValue={editRow?.monthlyFee || 0} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">본점지급액</label>
                  <input id="bk-hqfee" type="number" defaultValue={editRow?.headquarterFee || 0} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
                </div>
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">출금시작월</label>
                <input id="bk-startmonth" type="month" defaultValue={editRow?.startMonth || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" />
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">비고 (내용설명)</label>
                <input id="bk-notes" type="text" defaultValue={editRow?.notes || ""} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="내용 입력" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6]">취소</button>
              <button onClick={handleSave} disabled={isPending} className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50">
                {modal === "create" ? "등록" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
