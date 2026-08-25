"use client";

import Link from "next/link";
import { useState } from "react";

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
  assignedUserName: string | null;
  dueDay: number;
  isLongTerm: boolean;
};

type Tab = "current" | "long";

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const active = clients.filter((c) => !c.postponedUntil);
  const longTerm = active.filter((c) => c.isLongTerm);
  const current = active.filter((c) => !c.isLongTerm);

  // 장기미수가 있으면 그쪽을 먼저 보여준다 (세무사가 직접 관리해야 하는 건)
  const [tab, setTab] = useState<Tab>(longTerm.length > 0 ? "long" : "current");

  const rows = tab === "long" ? longTerm : current;
  const totalAmount = rows.reduce((s, c) => s + c.totalUnpaid, 0);
  const display = rows.slice(0, 16);
  const remaining = rows.length - display.length;

  const TABS: { key: Tab; label: string; count: number; hint: string; accent: string }[] = [
    { key: "current", label: "당월미수", count: current.length, hint: "직원 관리 — 1개월치 밀린 거래처", accent: "#D97706" },
    { key: "long", label: "장기미수", count: longTerm.length, hint: "세무사 관리 — 2개월치 이상 밀린 거래처", accent: "#DC2626" },
  ];

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">미수납</h2>
          {totalAmount > 0 && (
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: tab === "long" ? "#DC2626" : "#D97706" }}
            >
              {totalAmount.toLocaleString()}원
            </span>
          )}
        </div>
        <Link href="/receivables" className="text-[13px] text-[#3182F6] font-semibold hover:text-[#1B64DA]">
          자세히 →
        </Link>
      </div>

      {/* 당월 / 장기 탭 */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.hint}
              className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                on ? "text-white" : "bg-white/60 text-[#6B7684] hover:bg-white/80"
              }`}
              style={on ? { background: t.accent } : undefined}
            >
              {t.label}
              <span
                className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                  on ? "bg-white/25" : "bg-[#F2F4F6] text-[#8B95A1]"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">
            {tab === "long" ? "장기미수 거래처가 없습니다" : "당월미수 거래처가 없습니다"}
          </div>
          <div className="text-[12px] text-[#8B95A1] mt-1">깔끔하네요</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
            {display.map((client) => (
              <Link
                key={client.id}
                href="/receivables"
                className={`rounded-2xl p-3 transition-colors block ${
                  client.isLongTerm
                    ? "bg-rose-50/70 hover:bg-rose-50"
                    : "bg-white/60 hover:bg-white/80"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <div className="text-[13px] font-semibold text-[#191F28] truncate">
                    {client.name}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {client.isLongTerm && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#B91C1C]">
                        {client.unpaidMonths.length}개월
                      </span>
                    )}
                    {client.cmsStatus === "none" && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                        CMS
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="text-[14px] font-bold tabular-nums"
                  style={{ color: client.isLongTerm ? "#DC2626" : "#D97706" }}
                >
                  {client.totalUnpaid.toLocaleString()}원
                </div>
                <div className="text-[10.5px] text-[#6B7684] mt-0.5 truncate">
                  {client.unpaidMonths.map((m) => `${parseInt(m.split("-")[1])}월`).join(", ")}
                  <span className="text-[#B0B8C1]"> · {client.dueDay}일 출금</span>
                  {client.assignedUserName && <span className="text-[#B0B8C1]"> · {client.assignedUserName}</span>}
                </div>
              </Link>
            ))}
          </div>
          {remaining > 0 && (
            <Link
              href="/receivables"
              className="block mt-3 text-center text-[12px] text-[#6B7684] hover:text-[#3182F6] font-[500]"
            >
              +{remaining}건 더 보기 →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
