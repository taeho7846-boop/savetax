"use client";

import Link from "next/link";
import { useState } from "react";

type Bucket = "current" | "prev" | "long";

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
  bucket: Bucket;
};

/** 구간별 색상 — 당월(경고 약) → 전월(경고 강) → 장기(위험) */
const TONE: Record<Bucket, { accent: string; row: string; badge: string }> = {
  current: { accent: "#D97706", row: "bg-white/60 hover:bg-white/80", badge: "bg-[#FEF3C7] text-[#92400E]" },
  prev: { accent: "#EA580C", row: "bg-orange-50/60 hover:bg-orange-50", badge: "bg-[#FFEDD5] text-[#C2410C]" },
  long: { accent: "#DC2626", row: "bg-rose-50/70 hover:bg-rose-50", badge: "bg-[#FEE2E2] text-[#B91C1C]" },
};

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const active = clients.filter((c) => !c.postponedUntil);
  const groups: Record<Bucket, UnpaidClient[]> = {
    current: active.filter((c) => c.bucket === "current"),
    prev: active.filter((c) => c.bucket === "prev"),
    long: active.filter((c) => c.bucket === "long"),
  };

  const TABS: { key: Bucket; label: string; hint: string }[] = [
    { key: "current", label: "당월미수", hint: "직원 관리 — 이번 달분만 밀린 거래처" },
    { key: "prev", label: "전월미수", hint: "직원 관리 — 지난 달분만 밀린 거래처" },
    { key: "long", label: "장기미수", hint: "세무사 관리 — 2개월치 이상 밀렸거나 오래 묵은 거래처" },
  ];

  // 급한 구간부터 열어준다 (장기 → 전월 → 당월)
  const [tab, setTab] = useState<Bucket>(
    groups.long.length > 0 ? "long" : groups.prev.length > 0 ? "prev" : "current"
  );

  // 사수별 서브탭 (null = 전체)
  const [owner, setOwner] = useState<string | null>(null);

  const tabRows = groups[tab];
  const tone = TONE[tab];

  // 현재 구간에 실제로 건이 있는 사수만 노출 — 건수 많은 순
  const ownerCounts = new Map<string, number>();
  tabRows.forEach((c) => {
    const k = c.assignedUserName ?? "미배정";
    ownerCounts.set(k, (ownerCounts.get(k) ?? 0) + 1);
  });
  const ownerOptions = [...ownerCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")
  );

  // 탭을 옮겨 선택한 사수가 없어지면 자동으로 전체
  const activeOwner = owner && ownerCounts.has(owner) ? owner : null;

  const rows = activeOwner
    ? tabRows.filter((c) => (c.assignedUserName ?? "미배정") === activeOwner)
    : tabRows;

  const totalAmount = rows.reduce((s, c) => s + c.totalUnpaid, 0);
  const display = rows.slice(0, 16);
  const remaining = rows.length - display.length;

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">미수납</h2>
          {totalAmount > 0 && (
            <span className="text-[13px] font-bold tabular-nums" style={{ color: tone.accent }}>
              {totalAmount.toLocaleString()}원
            </span>
          )}
        </div>
        <Link href="/receivables" className="text-[13px] text-[#3182F6] font-semibold hover:text-[#1B64DA]">
          자세히 →
        </Link>
      </div>

      {/* 당월 / 전월 / 장기 탭 */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => {
          const on = tab === t.key;
          const count = groups[t.key].length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.hint}
              className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-1.5 text-[12.5px] font-bold transition ${
                on ? "text-white" : "bg-white/60 text-[#6B7684] hover:bg-white/80"
              }`}
              style={on ? { background: TONE[t.key].accent } : undefined}
            >
              {t.label}
              <span
                className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                  on ? "bg-white/25" : "bg-[#F2F4F6] text-[#8B95A1]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 사수별 서브탭 — 사수가 2명 이상일 때만 */}
      {ownerOptions.length > 1 && (
        <div className="flex gap-1 mb-3 flex-wrap items-center">
          <span className="text-[10.5px] font-bold text-[#B0B8C1] mr-0.5">사수</span>
          <button
            onClick={() => setOwner(null)}
            className={`rounded-xl px-2.5 py-1 text-[11.5px] font-bold transition ${
              activeOwner === null
                ? "bg-[#191F28] text-white"
                : "bg-white/60 text-[#6B7684] hover:bg-white/80"
            }`}
          >
            전체 <span className="tabular-nums opacity-70">{tabRows.length}</span>
          </button>
          {ownerOptions.map(([name, count]) => {
            const on = activeOwner === name;
            return (
              <button
                key={name}
                onClick={() => setOwner(on ? null : name)}
                className={`rounded-xl px-2.5 py-1 text-[11.5px] font-bold transition ${
                  on ? "bg-[#191F28] text-white" : "bg-white/60 text-[#6B7684] hover:bg-white/80"
                }`}
              >
                {name} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">
            {activeOwner ? `${activeOwner} 담당 ` : ""}{TABS.find((t) => t.key === tab)?.label} 거래처가 없습니다
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
                className={`rounded-2xl p-3 transition-colors block ${tone.row}`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <div className="text-[13px] font-semibold text-[#191F28] truncate">
                    {client.name}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {client.unpaidMonths.length > 1 && (
                      <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${tone.badge}`}>
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
                <div className="text-[14px] font-bold tabular-nums" style={{ color: tone.accent }}>
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
