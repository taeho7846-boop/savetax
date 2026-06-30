"use client";

import { useState, useTransition } from "react";
import {
  createSupply,
  updateSupply,
  toggleSupplyParticipant,
  deleteSupply,
  toggleSupplySettled,
} from "@/app/actions/settlement-supply";
import { SUPPLY_PEOPLE, computeNet, type SupplyItem } from "@/lib/settlement-supply";

const PEOPLE = SUPPLY_PEOPLE as readonly string[];

export function SupplyTable({
  items,
  yearMonth,
  settledMap,
}: {
  items: SupplyItem[];
  yearMonth: string;
  settledMap: Record<string, boolean>;
}) {
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<"create" | SupplyItem | null>(null);

  // 폼 상태 (추가/수정 공용)
  const editRow = modal !== null && modal !== "create" ? (modal as SupplyItem) : null;
  const [fItem, setFItem] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fPayer, setFPayer] = useState<string>(PEOPLE[0]);
  const [fChannel, setFChannel] = useState("");
  const [fParts, setFParts] = useState<Set<string>>(new Set(PEOPLE));

  function openCreate() {
    setFItem("");
    setFAmount("");
    setFPayer(PEOPLE[0]);
    setFChannel("");
    setFParts(new Set(PEOPLE)); // 기본: 전원 분배
    setModal("create");
  }

  function openEdit(it: SupplyItem) {
    setFItem(it.item);
    setFAmount(String(it.amount));
    setFPayer(it.payer);
    setFChannel(it.channel || "");
    setFParts(new Set(it.participants));
    setModal(it);
  }

  // 결제자 변경 → 결제자 자동 체크
  function changePayer(p: string) {
    setFPayer(p);
    setFParts((prev) => new Set(prev).add(p));
  }

  function toggleFormPart(p: string) {
    setFParts((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleSave() {
    const item = fItem.trim();
    if (!item) { alert("항목을 입력하세요"); return; }
    const amount = parseInt(fAmount || "0") || 0;
    const participants = PEOPLE.filter((p) => fParts.has(p));
    if (participants.length === 0) { alert("분배 대상을 한 명 이상 체크하세요"); return; }
    const channel = fChannel.trim() || undefined;

    if (modal === "create") {
      startTransition(async () => {
        await createSupply({ yearMonth, item, amount, payer: fPayer, channel, participants });
        setModal(null);
      });
    } else if (editRow) {
      startTransition(async () => {
        await updateSupply(editRow.id, { item, amount, payer: fPayer, channel: channel ?? null });
        setModal(null);
      });
    }
  }

  function handleToggle(id: number, person: string) {
    startTransition(() => toggleSupplyParticipant(id, person));
  }

  function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(() => deleteSupply(id));
  }

  function handleSettled(person: string) {
    startTransition(() => toggleSupplySettled(yearMonth, person));
  }

  // 정산 계산
  const net = computeNet(items);
  const totalAmount = items.reduce((s, r) => s + r.amount, 0);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={openCreate}
          className="text-sm px-4 py-2 rounded-lg font-medium bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors"
        >
          + 항목 추가
        </button>
        <div className="text-sm text-[#6B7684]">
          이번 달 합계: <strong className="text-[#191F28]">{fmt(totalAmount)}원</strong> · {items.length}건
        </div>
      </div>

      {/* 입력표 */}
      <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
            <tr>
              <th className="text-left px-4 py-3 text-[#333D4B] font-bold text-xs">항목</th>
              <th className="text-right px-3 py-3 text-[#333D4B] font-medium text-xs">금액</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">결제자</th>
              <th className="text-center px-3 py-3 text-[#333D4B] font-medium text-xs">결제채널</th>
              <th className="px-1 py-3 text-center text-[10px] text-[#8B95A1] font-bold border-l border-[#E5E8EB]" colSpan={PEOPLE.length}>
                분배 (체크한 사람끼리 N분의 1)
              </th>
              <th className="text-center px-2 py-3 text-[#6B7684] font-medium text-xs w-10">삭제</th>
            </tr>
            <tr className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
              <th colSpan={4}></th>
              {PEOPLE.map((p, i) => (
                <th key={p} className={`px-1 py-1.5 text-center text-[11px] font-semibold text-[#4E5968] ${i === 0 ? "border-l border-[#E5E8EB]" : ""}`}>
                  {p}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5 + PEOPLE.length} className="text-center py-12 text-[#8B95A1]">등록된 비품정산이 없습니다</td></tr>
            ) : items.map((it) => {
              const set = new Set(it.participants);
              return (
                <tr key={it.id} className="hover:bg-[#F5F9FF]/30 transition-colors border-b border-[#F2F4F6]">
                  <td className="px-4 py-2.5 text-[#191F28] font-medium cursor-pointer hover:underline" onClick={() => openEdit(it)}>
                    {it.item}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#191F28] tabular-nums cursor-pointer hover:underline" onClick={() => openEdit(it)}>
                    {fmt(it.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[#333D4B] cursor-pointer hover:underline" onClick={() => openEdit(it)}>
                    {it.payer}
                  </td>
                  <td className="px-3 py-2.5 text-center text-[#6B7684] text-xs cursor-pointer hover:underline" onClick={() => openEdit(it)}>
                    {it.channel || <span className="text-[#B0B8C1]">-</span>}
                  </td>
                  {PEOPLE.map((p, i) => (
                    <td key={p} className={`px-1 py-2.5 text-center ${i === 0 ? "border-l border-[#F2F4F6]" : ""}`}>
                      <input
                        type="checkbox"
                        checked={set.has(p)}
                        onChange={() => handleToggle(it.id, p)}
                        disabled={isPending}
                        className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                        title={`${p} 분배 ${set.has(p) ? "포함" : "제외"}`}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-center">
                    <button onClick={() => handleDelete(it.id)} className="text-[#B0B8C1] hover:text-[#E02E2E] text-xs">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 월별 정산 요약 */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-[#191F28]">이번 달 정산 요약</h3>
          <span className="text-xs text-[#8B95A1]">＋ 받을 돈 · － 낼 돈</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {PEOPLE.map((p) => {
            const v = net[p] || 0;
            const isReceive = v > 0;
            const isPay = v < 0;
            const done = !!settledMap[p];
            return (
              <div
                key={p}
                className={`rounded-xl border p-3 ${
                  done
                    ? "bg-[#F2F4F6] border-[#E5E8EB] opacity-70"
                    : isReceive
                    ? "bg-[#F1FBF4] border-[#BBF7D0]"
                    : isPay
                    ? "bg-[#FEF2F2] border-[#FECACA]"
                    : "bg-[#F9FAFB] border-[#E5E8EB]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-bold text-[#191F28]">{p}</span>
                  <label className="flex items-center gap-1 text-[10px] text-[#6B7684] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => handleSettled(p)}
                      disabled={isPending}
                      className="accent-[#15803D] w-3.5 h-3.5 cursor-pointer"
                    />
                    완료
                  </label>
                </div>
                <div className={`text-[16px] font-extrabold tabular-nums ${
                  done ? "text-[#8B95A1] line-through" : isReceive ? "text-[#15803D]" : isPay ? "text-[#E02E2E]" : "text-[#8B95A1]"
                }`}>
                  {v === 0 ? "0원" : `${isReceive ? "+" : "−"}${fmt(Math.abs(v))}원`}
                </div>
                <div className="text-[10.5px] text-[#8B95A1] mt-0.5">
                  {v === 0 ? "정산 없음" : isReceive ? "받을 돈" : "낼 돈"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-[#191F28]">{modal === "create" ? "비품정산 추가" : "비품정산 수정"}</h3>
              <button onClick={() => setModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">항목 <span className="text-[#F87171]">*</span></label>
                <input value={fItem} onChange={(e) => setFItem(e.target.value)} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="예: A4용지, 커피, 생수" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">금액</label>
                  <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} type="number" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1">결제자</label>
                  <select value={fPayer} onChange={(e) => changePayer(e.target.value)} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]">
                    {PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-[#6B7684] block mb-1">결제채널</label>
                <input value={fChannel} onChange={(e) => setFChannel(e.target.value)} className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]" placeholder="예: 법인카드, 김태호 개인카드, 현금" />
              </div>
              {modal === "create" && (
                <div>
                  <label className="text-sm text-[#6B7684] block mb-1.5">분배 대상 (체크한 사람끼리 N분의 1)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PEOPLE.map((p) => {
                      const on = fParts.has(p);
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => toggleFormPart(p)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            on
                              ? "bg-[#3182F6] text-white border-[#3182F6]"
                              : "bg-white text-[#6B7684] border-[#E5E8EB] hover:border-[#3182F6]"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-[#8B95A1] mt-1.5">
                    선택 {fParts.size}명 · 1인당 {fParts.size > 0 ? Math.round((parseInt(fAmount || "0") || 0) / fParts.size).toLocaleString() : 0}원
                  </div>
                </div>
              )}
              {modal !== "create" && (
                <p className="text-[11px] text-[#8B95A1]">분배 대상은 표에서 체크박스로 바로 수정할 수 있어요.</p>
              )}
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
