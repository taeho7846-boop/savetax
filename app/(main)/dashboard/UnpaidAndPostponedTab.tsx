"use client";

import { useState } from "react";
import { UnpaidCard } from "./UnpaidCard";
import { ClockIcon } from "@/components/icons";

type UnpaidClient = {
  id: number;
  name: string;
  phone: string | null;
  monthlyFee: number;
  affiliation: string | null;
  unpaidMonths: string[];
  totalUnpaid: number;
  postponedUntil: string | null;
  postponeNote: string | null;
  cmsStatus: string;
  paymentMethod: string;
  assignedUserName: string | null;
  dueDay: number;
  bucket: "current" | "prev" | "long";
};

type PostponedItem = {
  commissionId: number;
  clientName: string;
  until: string;
  note: string;
  type: string;
};

export function UnpaidAndPostponedTab({
  unpaidClients,
  postponedItems,
}: {
  unpaidClients: UnpaidClient[];
  postponedItems: PostponedItem[];
}) {
  const [tab, setTab] = useState<"unpaid" | "postponed">("unpaid");

  return (
    <div>
      {/* 탭 스위처 */}
      <div className="inline-flex gap-0.5 mb-3 p-1 bg-[#F2F4F6] rounded-[10px]">
        <button
          onClick={() => setTab("unpaid")}
          className={`px-4 py-1.5 text-[13px] rounded-[8px] transition-all inline-flex items-center gap-1.5 ${
            tab === "unpaid"
              ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              : "text-[#6B7684] hover:text-[#191F28] font-[500]"
          }`}
        >
          미수납
          {unpaidClients.filter(c => !c.postponedUntil).length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 rounded-full ${
              tab === "unpaid" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#E5E8EB] text-[#6B7684]"
            }`}>
              {unpaidClients.filter(c => !c.postponedUntil).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("postponed")}
          className={`px-4 py-1.5 text-[13px] rounded-[8px] transition-all inline-flex items-center gap-1.5 ${
            tab === "postponed"
              ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              : "text-[#6B7684] hover:text-[#191F28] font-[500]"
          }`}
        >
          미루기
          {postponedItems.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 rounded-full ${
              tab === "postponed" ? "bg-[#FFFBEB] text-[#D97706]" : "bg-[#E5E8EB] text-[#6B7684]"
            }`}>
              {postponedItems.length}
            </span>
          )}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "unpaid" ? (
        <UnpaidCard clients={unpaidClients} />
      ) : (
        <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-3 border-b border-[#F2F4F6] flex items-center gap-2">
            <ClockIcon width={14} height={14} className="text-[#4E5968]" />
            <h2 className="font-bold text-[13px] text-[#191F28]">미루기</h2>
            {postponedItems.length > 0 && (
              <span className="bg-[#F59E0B] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {postponedItems.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-[#F2F4F6]">
            {postponedItems.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-[13px] text-[#4E5968] font-[500]">미룬 업무가 없어요</div>
                <div className="text-[11px] text-[#8B95A1] mt-1">깔끔하게 유지되고 있어요</div>
              </div>
            ) : postponedItems.map(item => (
              <div key={item.commissionId} className="px-5 py-3 flex items-center gap-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  item.type === "해피콜" ? "bg-[#E8F3FF] text-[#0049BC]" : "bg-[#FFFBEB] text-[#92400e]"
                }`}>{item.type}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-[500] text-[#191F28] truncate">{item.clientName}</div>
                  {item.note && <div className="text-[10px] text-[#8B95A1] truncate">{item.note}</div>}
                </div>
                <span className="text-[11px] text-[#D97706] font-bold whitespace-nowrap">{item.until}까지</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
