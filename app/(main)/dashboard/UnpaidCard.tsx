"use client";

import { useState } from "react";

type UnpaidClient = {
  id: number;
  name: string;
  phone: string | null;
  monthlyFee: number;
  unpaidMonths: string[];
  totalUnpaid: number;
};

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? clients : clients.slice(0, 8);
  const totalAmount = clients.reduce((s, c) => s + c.totalUnpaid, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">💸</span>
        <h2 className="font-medium text-gray-700">미수납</h2>
        {clients.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{clients.length}</span>
        )}
        {totalAmount > 0 && (
          <span className="ml-auto text-xs text-red-500 font-medium">{totalAmount.toLocaleString()}원</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {clients.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">미수납 거래처가 없습니다</div>
        ) : (
          <>
            {display.map(client => (
              <div key={client.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{client.name}</div>
                  <div className="text-[10px] text-red-400 mt-0.5">
                    {client.unpaidMonths.map(m => `${parseInt(m.split("-")[1])}월`).join(", ")} 미수납
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-red-600">{client.totalUnpaid.toLocaleString()}원</span>
                  <button
                    onClick={() => alert("솔라피 연동 후 활성화됩니다")}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-yellow-400 text-gray-900 font-bold hover:bg-yellow-500"
                  >
                    카카오톡독촉
                  </button>
                </div>
              </div>
            ))}
            {clients.length > 8 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                {expanded ? "접기" : `+${clients.length - 8}개 더 보기`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
