"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthPoint } from "@/lib/taeho-settlement";

/** 시리즈 색 — 매출(파랑)·비용(주황)·이익(초록). 색약 분리 검증 통과(ΔE 9.2) */
export const SERIES = {
  revenue: { key: "revenue", label: "매출", color: "#3182F6" },
  cost: { key: "cost", label: "비용", color: "#EB6834" },
  profit: { key: "profit", label: "이익", color: "#1BAF7A" },
} as const;

const won = (n: number) => n.toLocaleString("ko-KR");

function fmtAxis(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(v / 10_000)}만`;
}

type TooltipPayload = { dataKey?: string | number; value?: number | string; color?: string };

function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string | number }) {
  if (!active || !payload || payload.length === 0) return null;
  const get = (k: string) => Number(payload.find((p) => p.dataKey === k)?.value ?? 0);
  return (
    <div className="glass-strong rounded-2xl px-3.5 py-3 shadow-xl min-w-[170px]">
      <div className="text-[11px] font-bold text-[#8B95A1] mb-2">{label}</div>
      {(["revenue", "cost", "profit"] as const).map((k) => (
        <div key={k} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[12px] text-[#4E5968]">
            <span className="w-2 h-2 rounded-full" style={{ background: SERIES[k].color }} />
            {SERIES[k].label}
          </span>
          <span className={`text-[12.5px] font-bold tabular-nums ${k === "profit" ? "text-[#191F28]" : "text-[#4E5968]"}`}>
            {won(get(k))}원
          </span>
        </div>
      ))}
    </div>
  );
}

export function TaehoTrendChart({
  points,
  selected,
  upTo,
  onSelect,
}: {
  points: MonthPoint[];
  selected: string;
  /** 이 달 이후(미래)는 이익선을 그리지 않는다 */
  upTo?: string;
  onSelect?: (ym: string) => void;
}) {
  const data = points.map((p) => ({
    ...p,
    profit: upTo && p.yearMonth > upTo ? null : p.profit,
    label: `${Number(p.yearMonth.slice(5))}월`,
    fullLabel: `${p.yearMonth.slice(0, 4)}년 ${Number(p.yearMonth.slice(5))}월`,
  }));
  const hasAny = points.some((p) => p.revenue !== 0 || p.cost !== 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
          barCategoryGap="28%"
          barGap={2}
          onClick={(state) => {
            const idx = (state as { activeTooltipIndex?: number | string | null } | null)?.activeTooltipIndex;
            if (idx == null || idx === "") return;
            const ym = points[Number(idx)]?.yearMonth;
            if (ym && onSelect) onSelect(ym);
          }}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#8B95A1" }}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10.5, fill: "#B0B8C1" }}
            tickFormatter={fmtAxis}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "rgba(49,130,246,0.06)" }}
            content={<GlassTooltip />}
            labelFormatter={(_, p) => (p?.[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel ?? ""}
          />
          <Bar dataKey="revenue" name={SERIES.revenue.label} fill={SERIES.revenue.color} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.yearMonth} fillOpacity={d.yearMonth === selected ? 1 : 0.45} />
            ))}
          </Bar>
          <Bar dataKey="cost" name={SERIES.cost.label} fill={SERIES.cost.color} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.yearMonth} fillOpacity={d.yearMonth === selected ? 1 : 0.45} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="profit"
            name={SERIES.profit.label}
            stroke={SERIES.profit.color}
            strokeWidth={2}
            dot={{ r: 3.5, strokeWidth: 2, stroke: "#fff", fill: SERIES.profit.color }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {!hasAny && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[12px] text-[#8B95A1] bg-white/70 rounded-full px-3 py-1">올해 집계된 금액이 아직 없어요</span>
        </div>
      )}
    </div>
  );
}
