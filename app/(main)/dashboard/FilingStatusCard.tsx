import Link from "next/link";
import type { FilingSummary } from "@/lib/filing-status";

/**
 * 홈 > 현황: 신고 현황 모아보기 — 월기장·원천세·부가세·종소세의 진행률 4칸.
 * 서버 컴포넌트(props만 받음). 데이터는 lib/filing-status.getFilingSummaries.
 */

const ICONS: Record<FilingSummary["key"], { glyph: string; gradient: string }> = {
  bookkeeping: { glyph: "📒", gradient: "gradient-blue" },
  withholding: { glyph: "🏛️", gradient: "gradient-purple" },
  vat: { glyph: "🧾", gradient: "gradient-amber" },
  incomeTax: { glyph: "📑", gradient: "gradient-emerald" },
};

function daysLeft(deadline: string | null, today: string): number | null {
  if (!deadline) return null;
  const a = new Date(deadline + "T00:00:00").getTime();
  const b = new Date(today + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
}

function deadlineChip(deadline: string | null, today: string, complete: boolean) {
  const d = daysLeft(deadline, today);
  if (d === null) return null;
  const dateLabel = `${parseInt(deadline!.slice(5, 7))}/${parseInt(deadline!.slice(8, 10))}`;
  if (complete) {
    return <span className="rounded-full bg-[#E7F7EE] px-2 py-0.5 text-[10.5px] font-bold text-[#15803D]">완료 · 마감 {dateLabel}</span>;
  }
  if (d < 0) {
    return <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">마감 {Math.abs(d)}일 지남</span>;
  }
  if (d === 0) {
    return <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">오늘 마감</span>;
  }
  const urgent = d <= 3;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${urgent ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#F2F4F6] text-[#6B7684]"}`}>
      D-{d} · {dateLabel}
    </span>
  );
}

export function FilingStatusCard({ items, today }: { items: FilingSummary[]; today: string }) {
  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#8B95A1]">Filing status</div>
          <h2 className="mt-0.5 text-[16px] font-bold tracking-tight text-[#191F28]">신고 현황 모아보기</h2>
        </div>
        <div className="text-[11.5px] text-[#8B95A1]">지금 진행 중인 기간 기준 · 내 범위 거래처</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => {
          const pct = it.total > 0 ? Math.round((it.done / it.total) * 100) : 0;
          const complete = it.total > 0 && it.done === it.total;
          const icon = ICONS[it.key];
          const visibleStages = it.stages.filter((s) => s.count > 0);
          return (
            <Link
              key={it.key}
              href={it.href}
              className="stat-card glass-strong group block rounded-2xl p-4 transition hover:-translate-y-px"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${icon.gradient} text-[16px] shadow-md`}>
                    <span aria-hidden>{icon.glyph}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-[#191F28]">{it.title}</div>
                    <div className="truncate text-[11.5px] text-[#6B7684]">{it.periodLabel}</div>
                  </div>
                </div>
                {deadlineChip(it.deadline, today, complete)}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[26px] font-bold leading-none tabular-nums text-[#191F28]">{it.done}</span>
                <span className="text-[13px] font-bold text-[#8B95A1]">/ {it.total}곳</span>
                <span className={`ml-auto text-[13px] font-bold tabular-nums ${complete ? "text-[#15803D]" : "text-[#3182F6]"}`}>{pct}%</span>
              </div>

              {/* 단계별 분포 바 */}
              <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[#191F28]/[.06]">
                {it.total > 0 &&
                  it.stages
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <div
                        key={s.key}
                        className="h-full transition-all"
                        style={{ width: `${(s.count / it.total) * 100}%`, background: s.color }}
                        title={`${s.label} ${s.count}곳`}
                      />
                    ))}
              </div>

              <div className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-1">
                {it.total === 0 ? (
                  <span className="text-[11px] text-[#B0B8C1]">대상 거래처가 없어요</span>
                ) : (
                  visibleStages.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-[#6B7684]">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.label} <b className="tabular-nums text-[#4E5968]">{s.count}</b>
                    </span>
                  ))
                )}
              </div>

              {it.note && <div className="mt-2 text-[10.5px] text-[#8B95A1]">{it.note}</div>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
