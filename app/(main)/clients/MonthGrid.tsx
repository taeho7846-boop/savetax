"use client";

/**
 * 연도별 줄로 놓은 월 선택기 — 거래처 프로필 상세 모달(매출·매입, 원천세·인건비) 공용.
 *  2026  1월 2월 … 12월
 *  2025  1월 2월 … 12월
 * 자료가 있는 달만 누를 수 있고, 선택한 달은 진하게.
 */
export function MonthGrid({ available, selected, onSelect }: { available: string[]; selected: string; onSelect: (ym: string) => void }) {
  const set = new Set(available);
  const years = Array.from(new Set(available.map(ym => ym.slice(0, 4)))).sort((a, b) => b.localeCompare(a)); // 최근 연도 먼저
  if (years.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {years.map(y => (
        <div key={y} className="flex items-center gap-1 overflow-x-auto">
          <span className="w-10 shrink-0 text-[11.5px] font-bold text-[#8B95A1]">{y}</span>
          {Array.from({ length: 12 }, (_, i) => {
            const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
            const has = set.has(ym);
            const on = ym === selected;
            return (
              <button
                key={ym}
                type="button"
                disabled={!has}
                onClick={() => onSelect(ym)}
                className={`h-8 w-[52px] shrink-0 rounded-lg text-[12px] font-bold tabular-nums transition-colors ${
                  on ? "bg-[#191F28] text-white shadow-sm" : has ? "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]" : "bg-transparent text-[#D1D6DB]"
                }`}
              >
                {i + 1}월
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
