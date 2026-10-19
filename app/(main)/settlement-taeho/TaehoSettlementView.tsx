"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  copyRecurringExpenses,
  createTaehoExpense,
  deleteTaehoExpense,
  updateTaehoExpense,
  type ExpenseInput,
} from "@/app/actions/taeho-settlement";
import { askConfirm, notify } from "@/components/ui/Dialog";
import type { ExpenseRow, RevenueItem, RevenueSource, TaehoSettlementData } from "@/lib/taeho-settlement";
import { SERIES, TaehoTrendChart } from "./TaehoTrendChart";

const won = (n: number) => n.toLocaleString("ko-KR");
const ymLabel = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(5)}`;
const ymKo = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;

function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SOURCE_CHIP: Record<RevenueSource, { label: string; cls: string }> = {
  client: { label: "채권관리", cls: "bg-[#E8F3FF] text-[#1B64DA]" },
  pulled: { label: "빼온", cls: "bg-[#FFFBEB] text-[#B45309]" },
  oneoff: { label: "단건", cls: "bg-[#F3E8FF] text-[#7E22CE]" },
};

export function TaehoSettlementView({
  data,
  participants,
  canEdit,
  viewerName,
}: {
  data: TaehoSettlementData;
  participants: { id: number; name: string }[];
  canEdit: boolean;
  viewerName: string;
}) {
  const router = useRouter();
  const { participant, statement: st, prev, year } = data;
  const ym = st.yearMonth;
  const uq = participants.length > 1 ? `&u=${participant.id}` : "";
  const href = (m: string) => `/settlement-taeho?ym=${m}${uq}`;
  const thisYM = (() => {
    const d = new Date(Date.now() + 9 * 3600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const yearProfit = year.reduce((s, p) => s + p.profit, 0);
  const yearRevenue = year.reduce((s, p) => s + p.revenue, 0);

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#8B95A1] font-medium">
            {participant.name} 월 손익계산서 · 공급대가(부가세 포함) 기준 · 수수료율 기장료 {participant.feeRate}% / 단건 {participant.oneoffRate}%
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">세무회계태호 정산</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && participants.length > 1 && (
            <div className="glass rounded-xl px-1 h-10 flex items-center gap-0.5">
              {participants.map((p) => (
                <Link
                  key={p.id}
                  href={`/settlement-taeho?ym=${ym}&u=${p.id}`}
                  className={`px-3 h-8 rounded-lg text-[12.5px] font-bold flex items-center transition ${
                    p.id === participant.id ? "bg-[#3182F6] text-white" : "text-[#6B7684] hover:bg-white/60 hover:text-[#191F28]"
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
            <Link href={href(shiftYM(ym, -1))} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="전월">◀</Link>
            <span className="text-[13.5px] font-bold text-[#191F28] min-w-[88px] text-center tabular-nums">{ymLabel(ym)}</span>
            <Link href={href(shiftYM(ym, 1))} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="익월">▶</Link>
          </div>
          {ym !== thisYM && (
            <Link href={href(thisYM)} className="glass-strong rounded-xl h-10 px-3.5 flex items-center text-[12.5px] font-bold text-[#6B7684] hover:text-[#191F28] transition">
              이번 달
            </Link>
          )}
        </div>
      </div>

      {/* KPI 3장 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="매출" value={st.revenue.total} prev={prev?.revenue} color={SERIES.revenue.color} caption={`기장료 ${won(st.revenue.bookkeeping)} · 단건 ${won(st.revenue.oneoff)}`} />
        <StatCard label="비용" value={st.cost.total} prev={prev?.cost} color={SERIES.cost.color} inverse caption={`수수료 ${won(st.cost.feeTotal)} · 공통비용 ${won(st.cost.expenseShareTotal)}`} />
        <HeroCard label={`${participant.name} 입금액`} value={st.profit} prev={prev?.profit} caption={`${ymKo(ym)} 이익 = 매출 − 비용`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4 items-start">
        {/* 손익계산서 */}
        <section className="glass-strong rounded-3xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-bold text-[#191F28]">손익계산서</div>
              <div className="text-[11.5px] text-[#8B95A1] mt-0.5">{ymKo(ym)} · {participant.name} · 단위: 원 (부가세 포함)</div>
            </div>
            <span className="text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] rounded-full px-2.5 py-1">
              {canEdit ? "대표 편집 가능" : `${viewerName} 조회`}
            </span>
          </div>

          <div className="px-6 pb-6">
            {/* 매출 */}
            <SectionTitle color={SERIES.revenue.color}>매출</SectionTitle>
            {st.revenue.items.map((item) => (
              <RevenueLine key={item.key} item={item} />
            ))}
            <TotalLine label="매출 합계" value={st.revenue.total} />

            {/* 비용 */}
            <SectionTitle color={SERIES.cost.color} className="mt-6">비용</SectionTitle>
            <GroupLabel>수수료 (대표 몫)</GroupLabel>
            <PlainLine
              indent
              label={<>기장료 매출 <span className="text-[#8B95A1]">{won(st.revenue.bookkeeping)} × {participant.feeRate}%</span></>}
              value={st.cost.feeBookkeeping}
            />
            <PlainLine
              indent
              label={<>단건 매출 <span className="text-[#8B95A1]">{won(st.revenue.oneoff)} × {participant.oneoffRate}%</span></>}
              value={st.cost.feeOneoff}
            />
            <SubtotalLine label="수수료 소계" value={st.cost.feeTotal} />

            <GroupLabel className="mt-4">
              공통비용 <span className="font-medium text-[#8B95A1]">{participant.name} 부담분</span>
            </GroupLabel>
            <ExpenseBlock
              ym={ym}
              rows={st.cost.expenses}
              canEdit={canEdit}
              canCopyRecurring={data.canCopyRecurring}
              participantName={participant.name}
            />
            <SubtotalLine label="공통비용 소계" value={st.cost.expenseShareTotal} />
            <TotalLine label="비용 합계" value={st.cost.total} />

            {/* 이익 */}
            <div className="mt-6 pt-4 border-t-2 border-[#191F28]/80">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[15px] font-bold text-[#191F28]">이익</div>
                  <div className="text-[11.5px] text-[#8B95A1] mt-0.5">= {participant.name}에게 입금할 금액</div>
                </div>
                <div className={`text-[30px] leading-none font-bold tabular-nums tracking-tight ${st.profit < 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>
                  {won(st.profit)}<span className="text-[16px] ml-0.5 text-[#6B7684] font-bold">원</span>
                </div>
              </div>
              {st.profit < 0 && (
                <div className="mt-3 text-[11.5px] text-[#DC2626] bg-[#FEF2F2] rounded-xl px-3 py-2">
                  비용이 매출보다 커서 이익이 마이너스예요. 공통비용 항목이나 출금·수납 체크를 확인해 주세요.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 우측: 추이 + 대표 수취 요약 */}
        <div className="space-y-4">
          <section className="glass rounded-3xl p-5 stat-card">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-[14px] font-bold text-[#191F28]">{ym.slice(0, 4)}년 월별 추이</div>
                <div className="text-[11.5px] text-[#8B95A1] mt-0.5">막대를 누르면 그 달로 이동해요</div>
              </div>
              <div className="flex items-center gap-3">
                {(["revenue", "cost", "profit"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#6B7684]">
                    <span className={`inline-block ${k === "profit" ? "w-3 h-[2px] rounded-full" : "w-2.5 h-2.5 rounded-[3px]"}`} style={{ background: SERIES[k].color }} />
                    {SERIES[k].label}
                  </span>
                ))}
              </div>
            </div>
            <TaehoTrendChart points={year} selected={ym} upTo={thisYM} onSelect={(m) => router.push(href(m))} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label={`${ym.slice(0, 4)}년 누계 매출`} value={yearRevenue} />
              <MiniStat label={`${ym.slice(0, 4)}년 누계 입금액`} value={yearProfit} strong />
            </div>
          </section>

          <section className="glass rounded-3xl p-5 stat-card">
            <div className="text-[13px] font-bold text-[#191F28] mb-3">대표 수취 요약</div>
            <div className="space-y-2">
              <KV label="수수료 합계" value={st.cost.feeTotal} hint={`기장료 ${won(st.cost.feeBookkeeping)} + 단건 ${won(st.cost.feeOneoff)}`} />
              <KV label="공통비용 대표 부담분" value={st.cost.expenseOwnerTotal} hint={`전체 ${won(st.cost.expenseGrossTotal)} 중 ${participant.name} 부담 ${won(st.cost.expenseShareTotal)}`} />
            </div>
            <div className="mt-3 pt-3 border-t border-[#E5E8EB]/70 text-[11px] text-[#8B95A1] leading-relaxed">
              모든 금액은 공급대가(부가세 포함) 기준이에요. 채권관리 수납 체크, Savetax 정산의 출금 체크가 바뀌면 이 화면에 바로 반영됩니다.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── 카드 ───────────────────────── */

function DeltaPill({ value, prev, inverse }: { value: number; prev?: number; inverse?: boolean }) {
  if (prev === undefined) return null;
  const diff = value - prev;
  if (diff === 0) return <span className="text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] rounded-full px-2 py-0.5">전월과 동일</span>;
  const good = inverse ? diff < 0 : diff > 0;
  const pctText = prev !== 0 ? ` (${Math.abs(Math.round((diff / Math.abs(prev)) * 100))}%)` : "";
  return (
    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums ${good ? "text-[#15803D] bg-[#E7F7EE]" : "text-[#DC2626] bg-[#FEF2F2]"}`} title="전월 대비">
      {diff > 0 ? "▲" : "▼"} {won(Math.abs(diff))}{pctText}
    </span>
  );
}

function StatCard({ label, value, prev, color, caption, inverse }: { label: string; value: number; prev?: number; color: string; caption: string; inverse?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5 stat-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-bold text-[#6B7684]">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </div>
        <DeltaPill value={value} prev={prev} inverse={inverse} />
      </div>
      <div className="text-[26px] font-bold text-[#191F28] mt-2 tracking-tight tabular-nums">
        {won(value)}<span className="text-[15px] ml-0.5 text-[#6B7684]">원</span>
      </div>
      <div className="text-[11.5px] text-[#8B95A1] mt-1 truncate">{caption}</div>
    </div>
  );
}

function HeroCard({ label, value, prev, caption }: { label: string; value: number; prev?: number; caption: string }) {
  return (
    <div className="rounded-2xl p-5 gradient-blue text-white shadow-lg shadow-[#3182F6]/30 stat-card relative overflow-hidden">
      <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute right-10 -bottom-10 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between">
        <div className="text-[12px] font-bold text-white/85">{label}</div>
        {prev !== undefined && (
          <span className="text-[11px] font-bold bg-white/20 rounded-full px-2 py-0.5 tabular-nums">
            {value - prev === 0 ? "전월과 동일" : `${value - prev > 0 ? "▲" : "▼"} ${won(Math.abs(value - prev))}`}
          </span>
        )}
      </div>
      <div className="relative text-[32px] font-bold mt-2 tracking-tight tabular-nums leading-none">
        {won(value)}<span className="text-[16px] ml-1 text-white/80">원</span>
      </div>
      <div className="relative text-[11.5px] text-white/75 mt-2">{caption}</div>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white/60 border border-[#E5E8EB]/60 px-3.5 py-2.5">
      <div className="text-[11px] text-[#8B95A1] font-medium">{label}</div>
      <div className={`text-[15px] font-bold tabular-nums mt-0.5 ${strong ? "text-[#191F28]" : "text-[#4E5968]"}`}>{won(value)}원</div>
    </div>
  );
}

function KV({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[12.5px] text-[#4E5968] font-medium">{label}</div>
        {hint && <div className="text-[11px] text-[#8B95A1] mt-0.5">{hint}</div>}
      </div>
      <div className="text-[14px] font-bold text-[#191F28] tabular-nums whitespace-nowrap">{won(value)}원</div>
    </div>
  );
}

/* ───────────────────────── 손익계산서 줄 ───────────────────────── */

function SectionTitle({ children, color, className = "" }: { children: ReactNode; color: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 pb-2 mb-1 border-b border-[#E5E8EB]/80 ${className}`}>
      <span className="w-1.5 h-4 rounded-full" style={{ background: color }} />
      <span className="text-[13.5px] font-bold text-[#191F28]">{children}</span>
    </div>
  );
}

function GroupLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pl-3 pt-2 pb-1 text-[12.5px] font-bold text-[#4E5968] ${className}`}>{children}</div>;
}

function PlainLine({ label, value, indent }: { label: ReactNode; value: number; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${indent ? "pl-7" : "pl-3"}`}>
      <div className="text-[12.5px] text-[#4E5968]">{label}</div>
      <div className="text-[13px] font-medium text-[#191F28] tabular-nums">{won(value)}</div>
    </div>
  );
}

function SubtotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 pl-7 mt-0.5 border-t border-dashed border-[#E5E8EB]">
      <div className="text-[12px] font-bold text-[#6B7684]">{label}</div>
      <div className="text-[13px] font-bold text-[#4E5968] tabular-nums">{won(value)}</div>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 pl-3 mt-1 border-t border-[#191F28]/40">
      <div className="text-[13px] font-bold text-[#191F28]">{label}</div>
      <div className="text-[15px] font-bold text-[#191F28] tabular-nums">{won(value)}</div>
    </div>
  );
}

function RevenueLine({ item }: { item: RevenueItem }) {
  const [open, setOpen] = useState(false);
  const count = item.rows.length;
  return (
    <div>
      <button
        type="button"
        onClick={() => count > 0 && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 py-2 pl-3 pr-1 rounded-xl text-left transition ${count > 0 ? "hover:bg-white/70 cursor-pointer" : "cursor-default"}`}
        title={item.hint}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] text-[#8B95A1] transition-transform ${open ? "rotate-90" : ""} ${count === 0 ? "opacity-0" : ""}`}>▶</span>
          <span className="text-[13px] font-medium text-[#191F28]">{item.label}</span>
          <span className={`text-[10.5px] font-bold rounded-full px-1.5 py-0.5 ${count > 0 ? SOURCE_CHIP[item.key].cls : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>{count}건</span>
        </div>
        <div className={`text-[13.5px] font-bold tabular-nums ${count > 0 ? "text-[#191F28]" : "text-[#B0B8C1]"}`}>{won(item.total)}</div>
      </button>
      {open && count > 0 && (
        <div className="ml-7 mr-1 mb-2 rounded-2xl bg-white/60 border border-[#E5E8EB]/60 overflow-hidden">
          {item.rows.map((r, i) => (
            <div key={`${r.name}-${r.yearMonth}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[#F2F4F6] last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12.5px] text-[#191F28] truncate">{r.name}</span>
                <span className="text-[10.5px] text-[#8B95A1] tabular-nums">{ymLabel(r.yearMonth)}</span>
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${SOURCE_CHIP[r.source].cls}`}>{SOURCE_CHIP[r.source].label}</span>
                {r.note && <span className="text-[10.5px] text-[#8B95A1] truncate" title={r.note}>{r.note}</span>}
              </div>
              <div className="text-[12.5px] font-bold text-[#191F28] tabular-nums whitespace-nowrap">{won(r.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 공통비용 (인라인 편집) ───────────────────────── */

type Draft = { label: string; amount: string; shareRate: string; recurring: boolean; note: string };
const emptyDraft = (): Draft => ({ label: "", amount: "", shareRate: "50", recurring: true, note: "" });
const toDraft = (r: ExpenseRow): Draft => ({ label: r.label, amount: String(r.amount), shareRate: String(r.shareRate), recurring: r.recurring, note: r.note ?? "" });
const fromDraft = (d: Draft): ExpenseInput => ({
  label: d.label,
  amount: Number(String(d.amount).replace(/[^\d-]/g, "")) || 0,
  shareRate: Number(d.shareRate) || 0,
  recurring: d.recurring,
  note: d.note || null,
});

function ExpenseBlock({
  ym,
  rows,
  canEdit,
  canCopyRecurring,
  participantName,
}: {
  ym: string;
  rows: ExpenseRow[];
  canEdit: boolean;
  canCopyRecurring: boolean;
  participantName: string;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(id: number | "new", draft: Draft) {
    const input = fromDraft(draft);
    if (!input.label.trim()) { notify("항목명을 입력하세요"); return; }
    startTransition(async () => {
      try {
        if (id === "new") await createTaehoExpense(ym, input);
        else await updateTaehoExpense(id, input);
        setEditing(null);
        notify("저장됐어요");
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "저장 실패 — 대표만 수정할 수 있어요", { type: "error" });
      }
    });
  }

  async function remove(r: ExpenseRow) {
    if (!(await askConfirm(`'${r.label}' 항목을 삭제할까요?`))) return;
    startTransition(async () => {
      try {
        await deleteTaehoExpense(r.id);
        notify("삭제됐어요");
      } catch {
        notify("삭제 실패", { type: "error" });
      }
    });
  }

  function copyPrev() {
    startTransition(async () => {
      try {
        const n = await copyRecurringExpenses(ym);
        notify(n > 0 ? `전월 반복 항목 ${n}개를 가져왔어요` : "가져올 항목이 없어요");
      } catch {
        notify("가져오기 실패", { type: "error" });
      }
    });
  }

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      {rows.length === 0 && editing !== "new" && (
        <div className="ml-7 mr-1 my-1 rounded-2xl border border-dashed border-[#D1D6DB] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] text-[#8B95A1]">이번 달 공통비용 항목이 없어요{canEdit ? "." : ". 대표가 입력하면 여기에 표시돼요."}</div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {canCopyRecurring && (
                <button type="button" onClick={copyPrev} className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] rounded-lg px-3 py-1.5 hover:bg-[#D6E8FF] transition">
                  전월 반복 항목 가져오기
                </button>
              )}
              <button type="button" onClick={() => setEditing("new")} className="text-[12px] font-bold text-[#4E5968] bg-white rounded-lg px-3 py-1.5 border border-[#E5E8EB] hover:bg-[#F9FAFB] transition">
                + 직접 추가
              </button>
            </div>
          )}
        </div>
      )}

      {rows.map((r) =>
        editing === r.id ? (
          <ExpenseEditor key={r.id} initial={toDraft(r)} onSave={(d) => save(r.id, d)} onCancel={() => setEditing(null)} participantName={participantName} />
        ) : (
          <div key={r.id} className="group flex items-center justify-between gap-3 py-1.5 pl-7 pr-1 rounded-xl hover:bg-white/70 transition">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[12.5px] text-[#191F28] truncate">{r.label}</span>
              {r.recurring && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#F2F4F6] text-[#6B7684]" title="매월 반복 항목">반복</span>}
              <span className="text-[11px] text-[#8B95A1] tabular-nums whitespace-nowrap">전체 {won(r.amount)} × {r.shareRate}%</span>
              {r.note && <span className="text-[10.5px] text-[#8B95A1] truncate" title={r.note}>{r.note}</span>}
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              {canEdit && (
                <span className="hidden group-hover:flex items-center gap-1">
                  <button type="button" onClick={() => setEditing(r.id)} className="text-[11px] font-bold text-[#3182F6] px-1.5 py-0.5 rounded hover:bg-[#E8F3FF]">수정</button>
                  <button type="button" onClick={() => remove(r)} className="text-[11px] font-bold text-[#DC2626] px-1.5 py-0.5 rounded hover:bg-[#FEF2F2]">삭제</button>
                </span>
              )}
              <span className="text-[13px] font-medium text-[#191F28] tabular-nums">{won(r.share)}</span>
            </div>
          </div>
        )
      )}

      {editing === "new" && (
        <ExpenseEditor initial={emptyDraft()} onSave={(d) => save("new", d)} onCancel={() => setEditing(null)} participantName={participantName} />
      )}

      {canEdit && rows.length > 0 && editing !== "new" && (
        <button type="button" onClick={() => setEditing("new")} className="ml-7 mt-1 text-[11.5px] font-bold text-[#3182F6] hover:underline">
          + 항목 추가
        </button>
      )}
    </div>
  );
}

function ExpenseEditor({ initial, onSave, onCancel, participantName }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void; participantName: string }) {
  const [d, setD] = useState<Draft>(initial);
  const amount = Number(String(d.amount).replace(/[^\d]/g, "")) || 0;
  const share = Math.round((amount * (Number(d.shareRate) || 0)) / 100);
  const input = "border border-[#E5E8EB] bg-white rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#3182F6]";
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(d); }}
      className="ml-7 mr-1 my-1.5 rounded-2xl bg-white/80 border border-[#A3CAFD] p-3 space-y-2"
    >
      <div className="grid grid-cols-[1.4fr_1fr_0.6fr] gap-2">
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">항목명</span>
          <input autoFocus value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="예) 사무실 임차료" className={`${input} w-full`} />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">전체 금액 (부가세 포함)</span>
          <input inputMode="numeric" value={d.amount === "" ? "" : won(amount)} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className={`${input} w-full text-right tabular-nums`} />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">{participantName} 부담 %</span>
          <input type="number" min={0} max={100} value={d.shareRate} onChange={(e) => setD({ ...d, shareRate: e.target.value })} className={`${input} w-full text-right tabular-nums`} />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="메모 (선택)" className={`${input} flex-1 min-w-[140px]`} />
        <label className="flex items-center gap-1.5 text-[12px] text-[#4E5968] cursor-pointer select-none">
          <input type="checkbox" checked={d.recurring} onChange={(e) => setD({ ...d, recurring: e.target.checked })} className="accent-[#3182F6] w-3.5 h-3.5" />
          매월 반복
        </label>
        <span className="text-[12px] text-[#6B7684] tabular-nums ml-auto">
          부담분 <b className="text-[#191F28]">{won(share)}원</b>
        </span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onCancel} className="text-[12px] font-bold text-[#6B7684] px-3 py-1.5 rounded-lg hover:bg-[#F2F4F6]">취소</button>
          <button type="submit" className="text-[12px] font-bold text-white bg-[#3182F6] px-3.5 py-1.5 rounded-lg hover:bg-[#1B64DA]">저장</button>
        </div>
      </div>
    </form>
  );
}
