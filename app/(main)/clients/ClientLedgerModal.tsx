"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LedgerDetailMonth, LedgerCategory } from "@/lib/semo-ledger";
import { MonthGrid } from "@/app/(main)/clients/MonthGrid";

/**
 * 거래처 매출·매입 상세 모달 — 거래처 프로필의 '월별 매출·매입' 영역에서 연다.
 * 데이터: GET /api/clients/[id]/ledger (세모리포트 고객 매입매출장 월별 요약, 증빙 유형별 포함)
 * 구역: 월 선택 → 문장형 요약 → 증빙 유형별 표(매출/매입) → 최근 12개월 추이 표 → 작년 vs 올해 막대
 */

type LedgerResponse = { today: string; client: { id: number; name: string; clientType: string; taxationType: string | null }; months: LedgerDetailMonth[] };

const SALE = "#10B981";
const BUY = "#F59E0B";
const won = (n: number) => n.toLocaleString("ko-KR");
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
/** ISO → "M/D HH:mm" (KST, 로케일 무관) */
function fmtKst(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
const ymKo = (ym: string) => `${ym.slice(0, 4)}년 ${parseInt(ym.slice(5, 7))}월`;
const mKo = (ym: string) => `${parseInt(ym.slice(5, 7))}월`;
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
function pct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/* ───────── 작은 부품 ───────── */

function Delta({ cur, prev, suffix = "" }: { cur: number; prev: number | null | undefined; suffix?: string }) {
  if (prev == null) return <span className="text-[#B0B8C1]">비교 자료 없음</span>;
  const diff = cur - prev;
  const p = pct(cur, prev);
  if (diff === 0) return <span className="text-[#8B95A1]">변동 없음{suffix}</span>;
  const up = diff > 0;
  return (
    <span className={up ? "text-[#DC2626]" : "text-[#1B64DA]"}>
      {up ? "▲" : "▼"} {won(Math.abs(diff))}원{p != null ? ` (${up ? "+" : ""}${p}%)` : ""}{suffix}
    </span>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 border border-[#E5E8EB] px-4 py-3">
      <div className="text-[11px] font-bold text-[#8B95A1]">{label}</div>
      <div className="mt-1 text-[19px] font-extrabold tabular-nums leading-none tracking-tight" style={{ color: color ?? "#191F28" }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] tabular-nums text-[#6B7684]">{sub}</div>}
    </div>
  );
}

/* ───────── 증빙 유형별 표 ───────── */

function CategoryTable({ title, color, cats, totalSupply, totalVat, totalCount }: {
  title: string; color: string; cats: LedgerCategory[]; totalSupply: number; totalVat: number; totalCount: number;
}) {
  const rows = cats.filter(c => c.count > 0 || c.supply > 0 || c.vat > 0);
  const max = Math.max(1, ...rows.map(r => r.supply));
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-center gap-2 text-[14px] font-bold text-[#191F28]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{title}
        </div>
        <div className="text-[11.5px] text-[#8B95A1]">{totalCount}건 · 공급가액 <b className="text-[#191F28]">{won(totalSupply)}</b>원</div>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#B0B8C1]">이 달 {title} 자료가 없어요</div>
      ) : (
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left text-[10.5px] font-bold text-[#8B95A1]">증빙 유형</th>
              <th className="px-2 py-1.5 text-right text-[10.5px] font-bold text-[#8B95A1]">건수</th>
              <th className="px-2 py-1.5 text-right text-[10.5px] font-bold text-[#8B95A1]">공급가액</th>
              <th className="px-2 py-1.5 text-right text-[10.5px] font-bold text-[#8B95A1]">세액</th>
              <th className="px-2 py-1.5 text-right text-[10.5px] font-bold text-[#8B95A1]">합계</th>
              <th className="px-2 py-1.5 text-right text-[10.5px] font-bold text-[#8B95A1] w-[90px]">비중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const share = totalSupply > 0 ? Math.round((r.supply / totalSupply) * 100) : 0;
              return (
                <tr key={r.key} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-2 py-2 text-[12.5px] font-bold text-[#333D4B] whitespace-nowrap border-t border-[#F2F4F6]">
                    {r.label}{r.noVat && <span className="ml-1 text-[10px] font-medium text-[#8B95A1]">세액 없음</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-[#4E5968] border-t border-[#F2F4F6]">{r.count}</td>
                  <td className="px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#191F28] border-t border-[#F2F4F6]">{won(r.supply)}</td>
                  <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-[#4E5968] border-t border-[#F2F4F6]">{r.noVat ? <span className="text-[#B0B8C1]">-</span> : won(r.vat)}</td>
                  <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-[#4E5968] border-t border-[#F2F4F6]">{won(r.total)}</td>
                  <td className="px-2 py-2 border-t border-[#F2F4F6]">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="h-1.5 w-12 rounded-full bg-[#F2F4F6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.supply / max) * 100}%`, background: color }} /></div>
                      <span className="w-8 text-right text-[11px] tabular-nums text-[#6B7684]">{share}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="px-2 py-2 text-[12.5px] font-extrabold text-[#191F28] border-t-2 border-[#E5E8EB]">합계</td>
              <td className="px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#191F28] border-t-2 border-[#E5E8EB]">{totalCount}</td>
              <td className="px-2 py-2 text-right text-[12.5px] font-extrabold tabular-nums text-[#191F28] border-t-2 border-[#E5E8EB]">{won(totalSupply)}</td>
              <td className="px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#191F28] border-t-2 border-[#E5E8EB]">{won(totalVat)}</td>
              <td className="px-2 py-2 text-right text-[12.5px] font-bold tabular-nums text-[#191F28] border-t-2 border-[#E5E8EB]">{won(totalSupply + totalVat)}</td>
              <td className="border-t-2 border-[#E5E8EB]" />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ───────── 최근 12개월 추이 표 (세모리포트식 가로 표) ───────── */

function TrendTable({ months, selected, onSelect }: { months: LedgerDetailMonth[]; selected: string; onSelect: (ym: string) => void }) {
  const byYm = new Map(months.map(m => [m.yearMonth, m]));
  const cols = Array.from({ length: 12 }, (_, i) => addMonths(selected, -i));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ left: 0 }); }, [selected]);
  const rows: { label: string; get: (m: LedgerDetailMonth | undefined) => React.ReactNode; strong?: boolean }[] = [
    { label: "매출 공급가액", get: m => m ? won(m.saleSupply) : "-", strong: true },
    { label: "매출 건수", get: m => m ? `${m.saleCount}건` : "-" },
    { label: "매입 공급가액", get: m => m ? won(m.buySupply) : "-", strong: true },
    { label: "매입 건수", get: m => m ? `${m.buyCount}건` : "-" },
    { label: "매입률", get: m => m && m.saleSupply > 0 ? `${Math.round((m.buySupply / m.saleSupply) * 100)}%` : "-" },
    { label: "매출 − 매입", get: m => m ? <span className={m.saleSupply - m.buySupply >= 0 ? "" : "text-[#DC2626]"}>{won(m.saleSupply - m.buySupply)}</span> : "-", strong: true },
  ];
  return (
    <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate border-spacing-0 min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white/95 px-3 py-2 text-left text-[11px] font-bold text-[#8B95A1] w-[120px]">항목</th>
            {cols.map((ym, i) => (
              <th key={ym} className="px-1 py-1">
                <button
                  type="button"
                  onClick={() => onSelect(ym)}
                  className={`w-[118px] rounded-xl px-2 py-2 text-[12px] font-bold transition-colors ${i === 0 ? "bg-[#191F28] text-white" : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"}`}
                >
                  {ym.slice(0, 4)}년 {ym.slice(5, 7)}월
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td className="sticky left-0 z-10 bg-white/95 px-3 py-2 text-[12px] font-bold text-[#4E5968] whitespace-nowrap border-t border-[#F2F4F6]">{r.label}</td>
              {cols.map((ym, i) => (
                <td key={ym} className={`px-3 py-2 text-right text-[12.5px] tabular-nums whitespace-nowrap border-t border-[#F2F4F6] ${i === 0 ? "bg-[#E8F3FF]/50 font-bold text-[#191F28]" : r.strong ? "font-bold text-[#333D4B]" : "text-[#6B7684]"}`}>
                  {r.get(byYm.get(ym))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 text-right text-[10.5px] text-[#B0B8C1]">표를 좌우로 움직여 보세요 · 월을 누르면 그 달로 이동</div>
    </div>
  );
}

/* ───────── 추이: 선택한 달까지 최근 12개월 막대 + 각 달의 1년 전 점선 (같은 자리에 겹쳐 비교) ───────── */

function YearCompare({ months, endYm, mode }: { months: LedgerDetailMonth[]; endYm: string; mode: "sale" | "buy" }) {
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
  const byYm = new Map(months.map(m => [m.yearMonth, m]));
  const val = (ym: string) => { const m = byYm.get(ym); return m ? (mode === "sale" ? m.saleSupply : m.buySupply) : null; };
  const cols = Array.from({ length: 12 }, (_, i) => addMonths(endYm, -11 + i));
  const cur = cols.map(ym => val(ym));
  const prev = cols.map(ym => val(addMonths(ym, -12)));
  const max = Math.max(1, ...cur.map(v => v ?? 0), ...prev.map(v => v ?? 0));
  const color = mode === "sale" ? SALE : BUY;
  const H = 220;
  const PADL = 36, PADR = 4, GAP = 8; // pl-9 pr-1 gap-2
  const label = mode === "sale" ? "매출" : "매입";
  const curSum = cur.reduce<number>((a, v) => a + (v ?? 0), 0);
  const pairs = cols.map((_, i) => [cur[i], prev[i]] as const).filter(([c, p]) => c != null && p != null) as [number, number][];
  const curPaired = pairs.reduce((a, [c]) => a + c, 0);
  const prevPaired = pairs.reduce((a, [, p]) => a + p, 0);
  const hasAnyPrev = prev.some(v => v != null);
  const rangeLabel = `${cols[0].slice(2, 4)}.${parseInt(cols[0].slice(5, 7))}~${cols[11].slice(2, 4)}.${parseInt(cols[11].slice(5, 7))}`;

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

  return (
    <div>
      <div className="mb-3 text-[15px] font-bold leading-snug text-[#191F28]">
        최근 12개월({rangeLabel}) {label}은 <b style={{ color }}>{won(curSum)}원</b>이에요.
        {pairs.length > 0 ? (
          <span className="ml-1">1년 전 같은 달과 비교하면({pairs.length}개월) <b style={{ color: curPaired >= prevPaired ? "#DC2626" : "#1B64DA" }}>{won(Math.abs(curPaired - prevPaired))}원 {curPaired >= prevPaired ? "증가" : "감소"}</b>{pct(curPaired, prevPaired) != null && <span className="ml-1 text-[13px] font-bold text-[#8B95A1]">({curPaired >= prevPaired ? "+" : ""}{pct(curPaired, prevPaired)}%)</span>}</span>
        ) : (
          <span className="ml-1 text-[#8B95A1] font-medium">1년 전 자료가 없어 비교는 못 해요.</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-4 text-[11px] text-[#6B7684]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-[#8B95A1]" />1년 전 같은 달</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />최근 12개월</span>
      </div>
      <div ref={wrapRef} className="relative mt-2" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map(g => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-[#EEF0F2]" style={{ bottom: `${g * 100}%` }}>
            <span className="-translate-y-0.5 text-[9.5px] tabular-nums text-[#C4CAD1]">{short(max * g)}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[#D1D6DB]" />
        <div className="absolute inset-0 flex items-end gap-2 pl-9 pr-1">
          {cols.map((ym, i) => {
            const c = cur[i], p = prev[i];
            const dim = hover != null && hover !== i;
            const prevYm = addMonths(ym, -12);
            return (
              <div key={ym} className="relative flex h-full flex-1 items-end justify-center cursor-crosshair" onMouseEnter={() => setHover(i)}>
                <div className="w-[56%] rounded-t-[4px] transition-all" style={{ height: c == null ? 0 : Math.max(c > 0 ? 2 : 0, (c / max) * H), background: color, opacity: dim ? 0.35 : 1 }} />
                {hover === i && (
                  <div className={`pointer-events-none absolute top-0 z-20 w-[210px] rounded-2xl border border-[#E5E8EB] bg-white/95 p-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ${i < 2 ? "left-0" : i > 9 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                    <div className="text-[12.5px] font-extrabold text-[#191F28]">{ym.slice(0, 4)}년 {parseInt(ym.slice(5, 7))}월 {label}</div>
                    <div className="mt-1.5 flex justify-between text-[12px]"><span className="text-[#8B95A1]">{ym.slice(0, 4)}.{ym.slice(5, 7)}</span><b className="tabular-nums" style={{ color }}>{c == null ? "-" : `${won(c)}원`}</b></div>
                    <div className="flex justify-between text-[12px]"><span className="text-[#8B95A1]">{prevYm.slice(0, 4)}.{prevYm.slice(5, 7)}</span><b className="tabular-nums text-[#4E5968]">{p == null ? "-" : `${won(p)}원`}</b></div>
                    {c != null && p != null && p > 0 && <div className="mt-1 text-right text-[11px] font-bold"><Delta cur={c} prev={p} /></div>}
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
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={hover === i ? 5 : 3.5} fill="#fff" stroke="#6B7684" strokeWidth={2} />
            ))}
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex gap-2 pl-9 pr-1">
        {cols.map((ym, i) => {
          const m = parseInt(ym.slice(5, 7));
          return <div key={ym} className="flex-1 text-center text-[10.5px] tabular-nums text-[#8B95A1]">{m === 1 || i === 0 ? <span><b className="text-[#4E5968]">{ym.slice(2, 4)}.</b>{m}월</span> : `${m}월`}</div>;
        })}
      </div>
    </div>
  );
}

/* ───────── 본체 ───────── */

export function ClientLedgerModal({ clientId, clientName, initialMonth, onClose, preload }: {
  clientId: number;
  clientName?: string;
  /** 처음 보여줄 달 "YYYY-MM" (없으면 가장 최근 달) */
  initialMonth?: string;
  onClose: () => void;
  /** 받아둔 데이터 (테스트용) */
  preload?: LedgerResponse;
}) {
  const [data, setData] = useState<LedgerResponse | null>(preload ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialMonth ?? null);
  const [mode, setMode] = useState<"sale" | "buy">("sale");

  useEffect(() => {
    if (preload) return;
    let alive = true;
    fetch(`/api/clients/${clientId}/ledger`, { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "불러오지 못했어요"); return j as LedgerResponse; })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "불러오지 못했어요"); });
    return () => { alive = false; };
  }, [clientId, preload]);

  useEffect(() => {
    // 캡처 단계에서 잡고 즉시 전파를 막아, 뒤에 있는 프로필 모달의 Esc 처리까지 가지 않게 한다
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const months = useMemo(() => data?.months ?? [], [data]);
  const byYm = useMemo(() => new Map(months.map(m => [m.yearMonth, m])), [months]);
  const latest = months.length ? months[months.length - 1].yearMonth : null;
  const sel = selected && byYm.has(selected) ? selected : latest;
  const m = sel ? byYm.get(sel) ?? null : null;
  const prevM = sel ? byYm.get(addMonths(sel, -1)) ?? null : null;
  const yoyM = sel ? byYm.get(addMonths(sel, -12)) ?? null : null;
  const rate = m && m.saleSupply > 0 ? Math.round((m.buySupply / m.saleSupply) * 100) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191F28]/35 p-2 backdrop-blur-[4px] sm:p-4" onClick={onClose}>
      <div
        className="glass-strong flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* 헤더 + 월 선택 */}
        <div className="border-b border-[#F2F4F6] px-5 pt-4 pb-3 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">Monthly ledger · 세모리포트 고객 매입매출장</div>
              <h2 className="mt-0.5 truncate text-[20px] font-extrabold tracking-tight text-[#191F28]">
                {data?.client.name ?? clientName ?? ""} <span className="text-[#8B95A1] font-bold">매출 · 매입 상세</span>
              </h2>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg leading-none text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#333D4B]" aria-label="닫기">✕</button>
          </div>
          {months.length > 0 && sel && <MonthGrid available={months.map(x => x.yearMonth)} selected={sel} onSelect={setSelected} />}
        </div>

        {/* 본문 */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {error ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-6 text-center text-[13px] font-bold text-[#DC2626]">{error}</div>
          ) : !data ? (
            <div className="space-y-5 animate-pulse">
              <div className="h-16 w-2/3 rounded-2xl bg-[#F2F4F6]" />
              <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-[#F2F4F6]" />)}</div>
              <div className="h-60 rounded-2xl bg-[#F2F4F6]" />
            </div>
          ) : months.length === 0 || !m || !sel ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
              <div className="text-[15px] font-bold text-[#4E5968]">세모리포트 월별 매출·매입 데이터가 아직 없어요</div>
              <div className="text-[12.5px] text-[#8B95A1]">기장대리 페이지의 ‘매입매출 수집’을 실행하면 사업자번호로 매칭돼 채워져요</div>
            </div>
          ) : (
            <>
              {/* 문장형 요약 */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl bg-[#ECFDF5]/70 border border-[#D1FAE5] px-6 py-5">
                  <div className="text-[11.5px] font-bold text-[#047857]">세모리포트 기준 · 매출 공급가액</div>
                  <div className="mt-1.5 text-[22px] font-extrabold leading-snug tracking-tight text-[#191F28]">
                    {ymKo(sel)} 매출은 <span style={{ color: SALE }}>{won(m.saleSupply)}원</span>이에요.
                  </div>
                  <div className="mt-2 text-[13px] font-bold text-[#4E5968]">
                    지난달보다 <Delta cur={m.saleSupply} prev={prevM?.saleSupply} />
                    <span className="mx-2 text-[#D1D6DB]">|</span>
                    작년 {mKo(sel)}보다 <Delta cur={m.saleSupply} prev={yoyM?.saleSupply} />
                  </div>
                </div>
                <div className="rounded-3xl bg-[#FFFBEB]/80 border border-[#FDE68A] px-6 py-5">
                  <div className="text-[11.5px] font-bold text-[#B45309]">세모리포트 기준 · 매입 공급가액</div>
                  <div className="mt-1.5 text-[22px] font-extrabold leading-snug tracking-tight text-[#191F28]">
                    {ymKo(sel)} 매입은 <span style={{ color: BUY }}>{won(m.buySupply)}원</span>이에요.
                  </div>
                  <div className="mt-2 text-[13px] font-bold text-[#4E5968]">
                    지난달보다 <Delta cur={m.buySupply} prev={prevM?.buySupply} />
                    <span className="mx-2 text-[#D1D6DB]">|</span>
                    매입률 <span className={rate != null && rate > 100 ? "text-[#DC2626]" : "text-[#191F28]"}>{rate == null ? "-" : `${rate}%`}</span>
                  </div>
                </div>
              </section>

              {/* 숫자 상자 */}
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <StatBox label="매출 공급가액" value={short(m.saleSupply)} color={SALE} sub={`${won(m.saleSupply)}원`} />
                <StatBox label="매출 세액" value={short(m.saleVat)} sub={`${won(m.saleVat)}원`} />
                <StatBox label="매출 건수" value={`${m.saleCount}건`} sub={m.saleCount > 0 ? `건당 ${won(Math.round(m.saleSupply / m.saleCount))}원` : undefined} />
                <StatBox label="매출 합계(세포함)" value={short(m.saleTotal)} sub={`${won(m.saleTotal)}원`} />
                <StatBox label="매입 공급가액" value={short(m.buySupply)} color={BUY} sub={`${won(m.buySupply)}원`} />
                <StatBox label="매입 세액" value={short(m.buyVat)} sub={`${won(m.buyVat)}원`} />
                <StatBox label="매입 건수" value={`${m.buyCount}건`} sub={m.buyCount > 0 ? `건당 ${won(Math.round(m.buySupply / m.buyCount))}원` : undefined} />
                <StatBox label="매출세액 − 매입세액" value={short(m.saleVat - m.buyVat)} color={m.saleVat - m.buyVat >= 0 ? "#191F28" : "#1B64DA"} sub="참고용 · 공제 제외 전" />
              </section>

              {/* 증빙 유형별 */}
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">By document type</div>
                    <h3 className="mt-0.5 text-[15px] font-bold tracking-tight text-[#191F28]">{ymKo(sel)} 증빙 유형별</h3>
                  </div>
                  <div className="text-[11px] text-[#8B95A1]">비중은 공급가액 기준</div>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <CategoryTable title="매출" color={SALE} cats={m.sale} totalSupply={m.saleSupply} totalVat={m.saleVat} totalCount={m.saleCount} />
                  <CategoryTable title="매입" color={BUY} cats={m.buy} totalSupply={m.buySupply} totalVat={m.buyVat} totalCount={m.buyCount} />
                </div>
              </section>

              {/* 최근 12개월 추이 표 */}
              <section className="glass rounded-2xl p-4">
                <div className="mb-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">Monthly trend</div>
                  <h3 className="mt-0.5 text-[15px] font-bold tracking-tight text-[#191F28]">최근 12개월 매출·매입 현황</h3>
                </div>
                <TrendTable months={months} selected={sel} onSelect={setSelected} />
              </section>

              {/* 작년 vs 올해 */}
              <section className="glass rounded-2xl p-4">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">Year over year</div>
                    <h3 className="mt-0.5 text-[15px] font-bold tracking-tight text-[#191F28]">최근 12개월 추이 · 1년 전 같은 달과 겹쳐 비교</h3>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl bg-[#F2F4F6] p-1">
                    {(["sale", "buy"] as const).map(k => (
                      <button key={k} type="button" onClick={() => setMode(k)} className={`h-7 rounded-lg px-3 text-[12px] font-bold transition-colors ${mode === k ? "bg-white shadow-sm text-[#191F28]" : "text-[#8B95A1] hover:text-[#4E5968]"}`}>
                        {k === "sale" ? "매출" : "매입"}
                      </button>
                    ))}
                  </div>
                </div>
                <YearCompare months={months} endYm={sel} mode={mode} />
              </section>

              <div className="flex items-center justify-between pb-1 text-[11px] text-[#B0B8C1]">
                <span>세모리포트 고객 매입매출장 · 공급가액 기준 · 홈택스 자료 반영 시점에 따라 실제 신고 수치와 다를 수 있어요</span>
                <span>마지막 수집 {fmtKst(m.collectedAt)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
