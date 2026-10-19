"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 연도 비교 차트 — 올해 1~12월 막대 + 작년 같은 월 점선(겹침). 거래처 프로필(매출·매입)에서 쓴다.
 * cur/prev: 1~12월 값(없으면 null). 작년 자료가 없는 달은 선이 끊긴다.
 */
const won = (n: number) => n.toLocaleString("ko-KR");
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

export function YearBarLineChart({ year, cur, prev, color, label, height = 180, onClickMonth }: {
  year: number;
  cur: (number | null)[];
  prev: (number | null)[];
  color: string;
  label: string;
  height?: number;
  onClickMonth?: (ym: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const PADL = 34, PADR = 4, GAP = 6; // pl-[34px] pr-1 gap-1.5
  const max = Math.max(1, ...cur.map(v => v ?? 0), ...prev.map(v => v ?? 0));
  const colW = width > 0 ? (width - PADL - PADR - GAP * 11) / 12 : 0;
  const xOf = (i: number) => PADL + colW * i + GAP * i + colW / 2;
  const yOf = (v: number) => H - (v / max) * H;
  const segments: string[] = [];
  let seg: string[] = [];
  prev.forEach((v, i) => {
    if (v == null) { if (seg.length) segments.push(seg.join(" ")); seg = []; return; }
    seg.push(`${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
  });
  if (seg.length) segments.push(seg.join(" "));
  const hasAnyPrev = prev.some(v => v != null);
  const ymOf = (i: number) => `${year}-${String(i + 1).padStart(2, "0")}`;

  return (
    <div>
      <div ref={wrapRef} className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map(g => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-[#EEF0F2]" style={{ bottom: `${g * 100}%` }}>
            <span className="-translate-y-0.5 text-[9.5px] tabular-nums text-[#C4CAD1]">{short(max * g)}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[#D1D6DB]" />
        <div className="absolute inset-0 flex items-end gap-1.5 pl-[34px] pr-1">
          {cur.map((c, i) => {
            const p = prev[i];
            const dim = hover != null && hover !== i;
            return (
              <div
                key={i}
                className={`relative flex h-full flex-1 items-end justify-center ${onClickMonth && c != null ? "cursor-pointer" : "cursor-crosshair"}`}
                onMouseEnter={() => setHover(i)}
                onClick={() => { if (c != null) onClickMonth?.(ymOf(i)); }}
                title={onClickMonth && c != null ? "누르면 이 달 상세" : undefined}
              >
                <div className="w-[58%] rounded-t-[4px] transition-all" style={{ height: c == null ? 0 : Math.max(c > 0 ? 2 : 0, (c / max) * H), background: color, opacity: dim ? 0.35 : 1 }} />
                {hover === i && (
                  <div className={`pointer-events-none absolute top-0 z-20 w-[190px] rounded-2xl border border-[#E5E8EB] bg-white/95 p-2.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ${i < 2 ? "left-0" : i > 9 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                    <div className="text-[12px] font-extrabold text-[#191F28]">{i + 1}월 {label}</div>
                    <div className="mt-1 flex justify-between text-[11.5px]"><span className="text-[#8B95A1]">{year}</span><b className="tabular-nums" style={{ color }}>{c == null ? "-" : `${won(c)}원`}</b></div>
                    <div className="flex justify-between text-[11.5px]"><span className="text-[#8B95A1]">{year - 1}</span><b className="tabular-nums text-[#4E5968]">{p == null ? "-" : `${won(p)}원`}</b></div>
                    {c != null && p != null && p > 0 && (
                      <div className={`mt-0.5 text-right text-[10.5px] font-bold ${c >= p ? "text-[#DC2626]" : "text-[#1B64DA]"}`}>
                        {c >= p ? "▲" : "▼"} {won(Math.abs(c - p))}원 ({c >= p ? "+" : ""}{Math.round(((c - p) / p) * 100)}%)
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hasAnyPrev && width > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-10" width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
            {segments.map((pts, k) => (
              <polyline key={k} points={pts} fill="none" stroke="#6B7684" strokeWidth={2} strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {prev.map((v, i) => v == null ? null : (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={hover === i ? 4.5 : 3} fill="#fff" stroke="#6B7684" strokeWidth={2} />
            ))}
          </svg>
        )}
      </div>
      <div className="mt-1 flex gap-1.5 pl-[34px] pr-1">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="flex-1 text-center text-[9.5px] tabular-nums text-[#8B95A1]">{i + 1}월</div>)}
      </div>
    </div>
  );
}
