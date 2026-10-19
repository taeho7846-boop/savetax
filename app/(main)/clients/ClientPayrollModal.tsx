"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAYROLL_TYPES, type PayrollMonthData, type PayrollType, type CollectResult, type PayrollFilingMonth, type PayrollWehago } from "@/lib/payroll-types";

/**
 * 거래처 인건비(급여) 상세 모달 — 세모리포트 '급여' 화면 구성을 따른다.
 * 데이터: GET /api/clients/[id]/payroll (PayrollMonth — 위하고 급여 엑셀에서 저장)
 * 구역: 월 선택 → 문장 요약 → 급여대상자(전체/근로/일용/사업) → 소득별 급여 현황(가로 표) → 인건비 추이(작년 vs 올해)
 * 과거분은 '드라이브에서 가져오기'로 채운다 (POST, 월 단위).
 */

type PayrollResponse = {
  today: string;
  client: { id: number; name: string; laborTypes: string | null; withholdingType: string | null; halfYearTax: boolean; types: PayrollType[] };
  months: PayrollMonthData[];
  filings: PayrollFilingMonth[];
  wehago: PayrollWehago;
};

const won = (n: number) => n.toLocaleString("ko-KR");
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
const mm = (ym: string) => ym.slice(5, 7);
function pct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
const typeOf = (k: PayrollType) => PAYROLL_TYPES.find(t => t.key === k)!;
const GREEN = "#0F9D77";

type Tab = "all" | PayrollType;
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "전체" }, { key: "salary", label: "근로" }, { key: "daily", label: "일용" }, { key: "business", label: "사업" },
];

function Avatar({ name, type }: { name: string; type: PayrollType }) {
  const t = typeOf(type);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold" style={{ background: `${t.color}22`, color: t.color }}>
      {name.replace(/\s/g, "").charAt(0)}
    </div>
  );
}

/* ───────── 급여대상자 ───────── */

function EmployeeList({ month }: { month: PayrollMonthData }) {
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = month.types
    .filter(t => tab === "all" || t.incomeType === tab)
    .flatMap(t => t.employees.map(e => ({ ...e, incomeType: t.incomeType })))
    .sort((a, b) => b.gross - a.gross);
  const gross = rows.reduce((a, r) => a + r.gross, 0);
  const net = rows.reduce((a, r) => a + r.net, 0);
  return (
    <div>
      <div className="flex rounded-2xl bg-[#F2F4F6] p-1">
        {TABS.map(t => {
          const on = t.key === tab;
          const cnt = t.key === "all" ? month.total.headcount : (month.types.find(x => x.incomeType === t.key)?.headcount ?? 0);
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`flex-1 h-10 rounded-xl text-[13.5px] font-bold transition-colors ${on ? "bg-white shadow-sm text-[#191F28]" : "text-[#8B95A1] hover:text-[#4E5968]"}`}>
              {t.label}{cnt > 0 && <span className={`ml-1 text-[11px] ${on ? "text-[#4E5968]" : "text-[#B0B8C1]"}`}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-end justify-between border-b border-[#191F28]/80 pb-3">
        <div className="space-y-1">
          <div className="text-[14px] font-bold text-[#191F28]">급여 합계 <span className="text-[#6B7684]">({rows.length}명)</span></div>
          <div className="text-[14px] font-bold text-[#191F28]">세후 합계</div>
        </div>
        <div className="space-y-1 text-right">
          <div className="text-[16px] font-extrabold tabular-nums text-[#191F28]">{won(gross)}원</div>
          <div className="text-[16px] font-extrabold tabular-nums text-[#191F28]">{won(net)}원</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-[12.5px] text-[#B0B8C1]">해당 유형의 급여 대상자가 없어요</div>
      ) : (
        <ul className="divide-y divide-[#F2F4F6]">
          {rows.map(r => {
            const key = `${r.incomeType}|${r.name}`;
            const t = typeOf(r.incomeType);
            const isOpen = open === key;
            return (
              <li key={key}>
                <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-[#F9FAFB] rounded-xl px-1 transition-colors">
                  <Avatar name={r.name} type={r.incomeType} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-[#191F28]">{r.name}{r.rank && <span className="ml-1.5 text-[11px] font-medium text-[#8B95A1]">{r.rank}</span>}</div>
                    <div className="text-[11.5px]" style={{ color: t.color }}>{t.label}{r.dept ? ` · ${r.dept}` : ""}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[13px] text-[#4E5968]">급여 <b className="ml-1 text-[#191F28]">{won(r.gross)}원</b></div>
                    <div className="text-[13px] text-[#4E5968]">세후 <b className="ml-1 text-[#191F28]">{won(r.net)}원</b></div>
                  </div>
                </button>
                {isOpen && (
                  <div className="mb-2 ml-[52px] rounded-xl bg-[#F9FAFB] px-4 py-3 text-[12px] text-[#4E5968]">
                    {r.items && r.items.length > 0 ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {r.items.map(it => <span key={it.label}>{it.label} <b className="tabular-nums text-[#191F28]">{won(it.amount)}</b></span>)}
                        <span className="ml-auto">공제 <b className="tabular-nums text-[#DC2626]">-{won(r.deductions)}</b></span>
                      </div>
                    ) : r.incomeTax != null ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>소득세 <b className="tabular-nums text-[#191F28]">{won(r.incomeTax)}</b></span>
                        <span>지방소득세 <b className="tabular-nums text-[#191F28]">{won(r.localTax ?? 0)}</b></span>
                        <span className="ml-auto">공제 합계 <b className="tabular-nums text-[#DC2626]">-{won(r.deductions)}</b></span>
                      </div>
                    ) : (
                      <span>공제 <b className="tabular-nums text-[#DC2626]">-{won(r.deductions)}</b></span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────── 유형별 직원 × 월 급여 표 (세모리포트에 없는 것) ───────── */

function EmployeeMatrix({ months, type, selected, onSelect }: { months: PayrollMonthData[]; type: PayrollType; selected: string; onSelect: (ym: string) => void }) {
  const t = typeOf(type);
  const cols = [...months].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth)).map(m => m.yearMonth);
  // 직원별 월 금액 (이름 기준)
  const byName = new Map<string, Map<string, { gross: number; net: number }>>();
  for (const m of months) {
    const tm = m.types.find(x => x.incomeType === type);
    if (!tm) continue;
    for (const e of tm.employees) {
      const row = byName.get(e.name) ?? new Map();
      const cur = row.get(m.yearMonth) ?? { gross: 0, net: 0 };
      cur.gross += e.gross; cur.net += e.net;
      row.set(m.yearMonth, cur);
      byName.set(e.name, row);
    }
  }
  if (byName.size === 0) return null;
  // 정렬: 최근 지급이 있는 사람 먼저, 그다음 최근 금액 큰 순
  const names = [...byName.keys()].sort((a, b) => {
    const ra = byName.get(a)!, rb = byName.get(b)!;
    const la = cols.findIndex(c => ra.has(c)), lb = cols.findIndex(c => rb.has(c));
    if (la !== lb) return la - lb;
    return (rb.get(cols[lb])?.gross ?? 0) - (ra.get(cols[la])?.gross ?? 0);
  });
  const total = (ym: string) => names.reduce((a, n) => a + (byName.get(n)!.get(ym)?.gross ?? 0), 0);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-bold text-[#191F28]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />{t.label} · 직원별 월 급여
        </div>
        <div className="text-[11px] text-[#8B95A1]">{names.length}명 · 지급액(세전) · 칸에 마우스를 올리면 세후</div>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-separate border-spacing-0 min-w-max">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white/95 px-3 py-2 text-left text-[11px] font-bold text-[#8B95A1] w-[140px]">이름</th>
              {cols.map(ym => (
                <th key={ym} className="px-1 pb-1">
                  <button type="button" onClick={() => onSelect(ym)} className={`w-[104px] rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition-colors ${ym === selected ? "bg-[#191F28] text-white" : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"}`}>
                    {ym.slice(2, 4)}.{ym.slice(5, 7)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map(n => {
              const row = byName.get(n)!;
              return (
                <tr key={n} className="hover:bg-[#F9FAFB]">
                  <td className="sticky left-0 z-10 bg-white/95 px-3 py-2 text-[12.5px] font-bold text-[#191F28] whitespace-nowrap border-t border-[#F2F4F6]">
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold align-middle" style={{ background: `${t.color}22`, color: t.color }}>{n.replace(/\s/g, "").charAt(0)}</span>{n}
                  </td>
                  {cols.map(ym => {
                    const v = row.get(ym);
                    return (
                      <td key={ym} title={v ? `세후 ${won(v.net)}원` : undefined} className={`px-3 py-2 text-right text-[12px] tabular-nums whitespace-nowrap border-t border-[#F2F4F6] ${ym === selected ? "bg-[#F9FAFB] font-bold text-[#191F28]" : "text-[#4E5968]"}`}>
                        {v ? won(v.gross) : <span className="text-[#D1D6DB]">-</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 z-10 bg-white/95 px-3 py-2 text-[12.5px] font-extrabold text-[#191F28] whitespace-nowrap border-t-2 border-[#E5E8EB]">합계</td>
              {cols.map(ym => (
                <td key={ym} className={`px-3 py-2 text-right text-[12px] font-extrabold tabular-nums whitespace-nowrap border-t-2 border-[#E5E8EB] ${ym === selected ? "bg-[#F9FAFB]" : ""}`} style={{ color: t.color }}>
                  {total(ym) > 0 ? won(total(ym)) : <span className="text-[#D1D6DB]">-</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────── 인건비 추이 (올해 막대 + 작년 점선) ───────── */

function YearTrend({ months, year, thisMonth }: { months: PayrollMonthData[]; year: number; thisMonth: string }) {
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
  const byYm = new Map(months.map(m => [m.yearMonth, m.total.gross]));
  const cur = Array.from({ length: 12 }, (_, i) => byYm.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? null);
  const prev = Array.from({ length: 12 }, (_, i) => byYm.get(`${year - 1}-${String(i + 1).padStart(2, "0")}`) ?? null);
  const max = Math.max(1, ...cur.map(v => v ?? 0), ...prev.map(v => v ?? 0));
  const H = 240;
  const PADX = 8; // px-2
  const GAP = 12; // gap-3
  let lastIdx = -1;
  cur.forEach((v, i) => { if (v != null && `${year}-${String(i + 1).padStart(2, "0")}` <= thisMonth) lastIdx = i; });
  const curSum = cur.slice(0, lastIdx + 1).reduce<number>((a, v) => a + (v ?? 0), 0);
  const prevSum = prev.slice(0, lastIdx + 1).reduce<number>((a, v) => a + (v ?? 0), 0);
  const hasPrev = prev.slice(0, lastIdx + 1).some(v => v != null);
  const hasAnyPrev = prev.some(v => v != null);

  // 작년 점선 좌표: 열 가운데 x, 값 높이 y. 자료 없는 달은 선을 끊는다
  const colW = width > 0 ? (width - PADX * 2 - GAP * 11) / 12 : 0;
  const xOf = (i: number) => PADX + colW * i + GAP * i + colW / 2;
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
      <div className="text-[17px] font-bold leading-snug text-[#191F28]">
        {lastIdx < 0 ? <span className="text-[#8B95A1]">{year}년 인건비 자료가 아직 없어요</span>
          : !hasPrev ? <>{year}년 1~{lastIdx + 1}월 인건비는 <span style={{ color: GREEN }}>{won(curSum)}원</span>이에요<div className="text-[12.5px] font-medium text-[#8B95A1]">작년 같은 기간 자료가 없어 비교는 못 해요</div></>
          : <>지난해 같은 기간(1~{lastIdx + 1}월) 대비 인건비는<br /><span style={{ color: curSum >= prevSum ? GREEN : "#1B64DA" }}>{won(Math.abs(curSum - prevSum))}원</span> {curSum >= prevSum ? "증가" : "감소"}했어요 <span className="text-[13px] font-bold text-[#8B95A1]">({curSum >= prevSum ? "+" : ""}{pct(curSum, prevSum) ?? 0}%)</span></>}
      </div>
      <div className="mt-3 flex items-center justify-end gap-4 text-[12px] text-[#6B7684]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-[#8B95A1]" />작년 {year - 1}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />올해 {year}</span>
      </div>
      <div ref={wrapRef} className="relative mt-2" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map(g => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-[#EEF0F2]" style={{ bottom: `${g * 100}%` }}>
            <span className="-translate-y-0.5 text-[9.5px] tabular-nums text-[#C4CAD1]">{short(max * g)}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-[#D1D6DB]" />
        {/* 올해 막대 */}
        <div className="absolute inset-0 flex items-end gap-3 px-2">
          {cur.map((c, i) => {
            const p = prev[i];
            const dim = hover != null && hover !== i;
            return (
              <div key={i} className="relative flex h-full flex-1 items-end justify-center cursor-crosshair" onMouseEnter={() => setHover(i)}>
                <div className="w-[56%] rounded-t-[6px] transition-all" style={{ height: c == null ? 0 : Math.max(c > 0 ? 3 : 0, (c / max) * H), background: GREEN, opacity: dim ? 0.35 : 1 }} />
                {hover === i && (
                  <div className={`pointer-events-none absolute top-0 z-20 w-[200px] rounded-2xl border border-[#E5E8EB] bg-white/95 p-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ${i < 2 ? "left-0" : i > 9 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                    <div className="text-[12.5px] font-extrabold text-[#191F28]">{i + 1}월 인건비</div>
                    <div className="mt-1.5 flex justify-between text-[12px]"><span className="text-[#8B95A1]">{year}</span><b className="tabular-nums" style={{ color: GREEN }}>{c == null ? "-" : `${won(c)}원`}</b></div>
                    <div className="flex justify-between text-[12px]"><span className="text-[#8B95A1]">{year - 1}</span><b className="tabular-nums text-[#4E5968]">{p == null ? "-" : `${won(p)}원`}</b></div>
                    {c != null && p != null && p > 0 && (
                      <div className={`mt-1 text-right text-[11px] font-bold ${c >= p ? "text-[#DC2626]" : "text-[#1B64DA]"}`}>
                        {c >= p ? "▲" : "▼"} {won(Math.abs(c - p))}원 ({c >= p ? "+" : ""}{pct(c, p)}%)
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* 작년 점선 (겹침) */}
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
      <div className="mt-2 flex gap-3 px-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 text-[11px] tabular-nums text-[#8B95A1]">
            <span className={`h-2 w-2 rounded-full ${cur[i] != null ? "bg-[#4E5968]" : "bg-[#D1D6DB]"}`} />{i + 1}월
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── 드라이브 가져오기 ───────── */

function CollectPanel({ clientId, thisMonth, onDone }: { clientId: number; thisMonth: string; onDone: (months: PayrollMonthData[]) => void }) {
  const [range, setRange] = useState<12 | 24 | 36>(12);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; log: string[] } | null>(null);
  const stop = useRef(false);

  async function run() {
    if (busy) return;
    setBusy(true); stop.current = false;
    // 이번 달은 아직 급여 파일이 없을 수 있으니 전월부터 range 개월
    const list = Array.from({ length: range }, (_, i) => addMonths(thisMonth, -1 - i));
    const prog = { done: 0, total: list.length, log: [] as string[] };
    setProgress({ ...prog });
    let latest: PayrollMonthData[] | null = null;
    try {
      for (let i = 0; i < list.length && !stop.current; i += 3) {
        const chunk = list.slice(i, i + 3);
        const res = await fetch(`/api/clients/${clientId}/payroll`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yearMonths: chunk }),
        });
        const j = await res.json();
        if (!res.ok) { prog.log.unshift(`오류: ${j.error ?? res.status}`); break; }
        latest = j.months as PayrollMonthData[];
        for (const r of (j.results as CollectResult[])) {
          const saved = r.types.filter(t => t.status === "saved");
          const errs = r.types.filter(t => t.status === "error");
          const label = saved.length > 0
            ? `${r.yearMonth} · ${saved.map(t => `${typeOf(t.incomeType).short} ${t.headcount}명 ${short(t.gross ?? 0)}`).join(", ")}`
            : errs.length > 0 ? `${r.yearMonth} · 읽기 실패: ${errs.map(t => `${typeOf(t.incomeType).short} ${t.message ?? ""}`).join(", ")}`
            : `${r.yearMonth} · 드라이브에 급여 파일 없음 (찾은 이름: ${r.types.map(t => t.message ?? "").filter(Boolean).join(" / ") || "-"})`;
          prog.log.unshift(label);
          prog.done++;
        }
        setProgress({ ...prog, log: [...prog.log] });
      }
    } finally {
      setBusy(false);
      if (latest) onDone(latest);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2">
          <div className="text-[13px] font-bold text-[#191F28]">드라이브에서 가져오기</div>
          <div className="text-[11.5px] text-[#8B95A1]">위멤버스 버튼으로 내려받아 둔 위하고 급여 엑셀(근로·사업·일용)을 읽어 월별 인건비로 저장해요</div>
        </div>
        {([12, 24, 36] as const).map(r => (
          <button key={r} type="button" disabled={busy} onClick={() => setRange(r)} className={`h-8 rounded-lg px-3 text-[12px] font-bold border transition-colors ${range === r ? "bg-[#191F28] border-[#191F28] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"} disabled:opacity-60`}>
            최근 {r}개월
          </button>
        ))}
        {busy ? (
          <button type="button" onClick={() => { stop.current = true; }} className="ml-auto h-8 rounded-xl border border-[#E5E8EB] bg-white px-3 text-[12px] font-bold text-[#DC2626]">중지</button>
        ) : (
          <button type="button" onClick={run} className="ml-auto h-8 rounded-xl px-4 text-[12.5px] font-bold text-white hover:opacity-90" style={{ background: GREEN }}>가져오기 시작</button>
        )}
      </div>
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11.5px] text-[#6B7684]">
            <span>{busy ? "드라이브에서 읽는 중…" : "완료"}</span>
            <span className="tabular-nums">{progress.done} / {progress.total}개월</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#191F28]/[.06]"><div className="h-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%`, background: GREEN }} /></div>
          <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-[11.5px] text-[#4E5968]">
            {progress.log.map((l, i) => <li key={i} className="break-all" title={l}>{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}


/* ───────── 지난 달 급여 일괄 처리 — 원천세 페이지 '위멤버스' 버튼과 같은 순서를 월 범위로 연달아 돌린다
 *  (1) 위하고 급여 화면을 새 탭으로 열어 자료 내려받기(확장이 드라이브 5. 위멤버스에 저장 → 서버가 인건비로 즉시 저장)
 *  (2) 위멤버스 업로드(선택)  (3) 급여명세서·사업소득지급대장 생성·드라이브 저장(선택)
 * ───────── */

const WEHAGO_BASE = "https://smarta.wehago.com/#/smarta/humanresource";
function wehagoDownloadUrl(w: PayrollWehago, clientName: string, type: PayrollType, yearMonth: string): string {
  const year = yearMonth.slice(0, 4);
  const month = parseInt(yearMonth.slice(5, 7));
  const color = w.colors[year] || "#D0BA00";
  const params = `sao&cno=${w.cno}&cd_com=${w.cdCom}&gisu=${month}&yminsa=${year}&searchData=${year}0101${year}1231&color=${encodeURIComponent(color)}&companyName=${encodeURIComponent(clientName)}&companyID=${w.companyId}&taxNum=${w.taxNum}&yn_private=1&wehagoT`;
  if (type === "salary") return `${WEHAGO_BASE}/SWSA0101?${params}&autoPayslip=${month}`;
  if (type === "business") return `${WEHAGO_BASE}/SWBU0103?${params}&autoBusinessIncome=${month}`;
  return `${WEHAGO_BASE}/TWSA0107?${params}&autoDailyWorker=${month}`;
}

function WmBatchPanel({ clientId, clientName, wehago, types, thisMonth, onRefresh }: {
  clientId: number; clientName: string; wehago: PayrollWehago; types: PayrollType[]; thisMonth: string; onRefresh: () => Promise<void>;
}) {
  // 처리할 기간: 시작 연월 ~ 끝 연월 (기본: 최근 6개월, 이번 달 제외)
  const [fromYm, setFromYm] = useState(addMonths(thisMonth, -6));
  const [toYm, setToYm] = useState(addMonths(thisMonth, -1));
  const monthList = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(fromYm) || !/^\d{4}-\d{2}$/.test(toYm) || fromYm > toYm) return [] as string[];
    const out: string[] = [];
    for (let ym = toYm; ym >= fromYm && out.length < 36; ym = addMonths(ym, -1)) out.push(ym); // 최근 달부터
    return out;
  }, [fromYm, toYm]);
  const quick = (n: number) => { setFromYm(addMonths(thisMonth, -n)); setToYm(addMonths(thisMonth, -1)); };
  const [picked, setPicked] = useState<PayrollType[]>(types.filter(t => t !== "daily"));
  const [doUpload, setDoUpload] = useState(true);
  const [doDocs, setDoDocs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; log: string[] } | null>(null);
  const stop = useRef(false);
  const skip = useRef(false);

  const say = (prog: { done: number; total: number; current: string; log: string[] }, line?: string, current?: string) => {
    if (line) prog.log.unshift(line);
    if (current !== undefined) prog.current = current;
    setProgress({ ...prog, log: [...prog.log] });
  };

  async function waitForFile(ym: string, type: PayrollType, prog: { done: number; total: number; current: string; log: string[] }): Promise<"found" | "timeout" | "skip"> {
    const [year, month] = ym.split("-");
    for (let i = 0; i < 90; i++) {
      if (stop.current || skip.current) return "skip";
      try {
        const res = await fetch("/api/automation/check-file", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientName, year, month, type }),
        });
        const d = await res.json();
        if (d.exists) return "found";
      } catch { /* 다음 시도 */ }
      say(prog, undefined, `${ym} ${typeOf(type).label} · 위하고에서 내려받는 중… ${(i + 1) * 2}초 (자료 없는 달이면 '이 유형 건너뛰기')`);
      await new Promise(r => setTimeout(r, 2000));
    }
    return "timeout";
  }

  async function run() {
    if (busy || picked.length === 0 || monthList.length === 0) return;
    setBusy(true); stop.current = false;
    const list = monthList;
    const prog = { done: 0, total: list.length, current: "", log: [] as string[] };
    setProgress({ ...prog });
    try {
      for (const ym of list) {
        if (stop.current) break;
        const [year, month] = ym.split("-");
        // (1) 위하고 다운로드 — 원천세 페이지와 같이 새 탭으로 연다 (확장 content script 가 자료를 받아 서버로 보냄)
        const collected: PayrollType[] = [];
        for (const type of picked) {
          if (stop.current) break;
          skip.current = false;
          const tab = window.open(wehagoDownloadUrl(wehago, clientName, type, ym), "_blank");
          if (!tab) { say(prog, `${ym} · 팝업이 차단됐어요. 이 사이트의 팝업을 허용한 뒤 다시 시작하세요`); stop.current = true; break; }
          const r = await waitForFile(ym, type, prog);
          try { tab.close(); } catch { /* 이미 닫힘 */ }
          if (r === "found") collected.push(type);
          else say(prog, `${ym} · ${typeOf(type).label} ${r === "skip" ? "건너뜀" : "시간 초과 — 자료 없는 달로 처리"}`);
        }
        if (stop.current) break;
        if (collected.length === 0) { say(prog, `${ym} · 내려받은 자료 없음`, ""); prog.done++; say(prog); continue; }
        say(prog, `${ym} · 내려받음: ${collected.map(t => typeOf(t).label).join(", ")} (인건비 저장됨)`);
        await onRefresh();

        // (2) 위멤버스 업로드
        if (doUpload) {
          say(prog, undefined, `${ym} · 위멤버스에 업로드 중… (1~2분)`);
          try {
            const res = await fetch("/api/automation/wemembers-process", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientName, year, month, incomeTypes: collected }),
            });
            const j = await res.json();
            say(prog, j.success ? `${ym} · 위멤버스 업로드 완료` : `${ym} · 위멤버스 업로드 실패: ${j.message ?? res.status}`);
          } catch (e) { say(prog, `${ym} · 위멤버스 업로드 실패: ${String(e)}`); }
        }

        // (3) 문서 생성·드라이브 저장
        if (doDocs) {
          const docs: { docType: "payslip" | "ledger"; label: string }[] = [];
          if (collected.includes("salary")) docs.push({ docType: "payslip", label: "급여명세서" });
          if (collected.includes("business")) docs.push({ docType: "ledger", label: "사업소득지급대장" });
          for (const d of docs) {
            say(prog, undefined, `${ym} · ${d.label} 생성 중…`);
            try {
              const res = await fetch("/api/withholding/generate-doc", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, yearMonth: ym, docType: d.docType }),
              });
              if (res.ok) say(prog, `${ym} · ${d.label} 생성·드라이브 저장${res.headers.get("X-Drive-Saved") === "0" ? " (드라이브 폴더 미연결로 저장 생략)" : ""}`);
              else { const j = await res.json().catch(() => null); say(prog, `${ym} · ${d.label} 실패: ${j?.message ?? res.status}`); }
            } catch (e) { say(prog, `${ym} · ${d.label} 실패: ${String(e)}`); }
          }
        }
        prog.done++;
        say(prog, undefined, "");
      }
    } finally {
      setBusy(false);
      say(prog, undefined, stop.current ? "중지됨" : "완료");
      await onRefresh();
    }
  }

  const chip = (on: boolean, extra = "") => `h-8 rounded-lg px-3 text-[12px] font-bold border transition-colors ${on ? "bg-[#191F28] border-[#191F28] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"} disabled:opacity-40 ${extra}`;

  return (
    <div className="rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5]/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2">
          <div className="text-[13px] font-bold text-[#191F28]">지난 달 급여 일괄 처리</div>
          <div className="text-[11.5px] text-[#6B7684]">원천세 페이지의 위멤버스 버튼과 같은 순서로, 고른 달을 연달아 돌려요: 위하고 다운로드 → 드라이브 저장(인건비 자동 저장) → 위멤버스 업로드 → 명세서 생성</div>
        </div>
        {!wehago.ready && <div className="w-full rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#DC2626]">아직 쓸 수 없어요: {wehago.reason}</div>}
        <div className="flex items-center gap-1.5">
          <input type="month" value={fromYm} max={toYm} disabled={busy} onChange={e => setFromYm(e.target.value)} className="h-8 rounded-lg border border-[#D1D6DB] bg-white px-2 text-[12px] font-bold text-[#191F28] disabled:opacity-60" />
          <span className="text-[12px] text-[#8B95A1]">~</span>
          <input type="month" value={toYm} min={fromYm} max={addMonths(thisMonth, -1)} disabled={busy} onChange={e => setToYm(e.target.value)} className="h-8 rounded-lg border border-[#D1D6DB] bg-white px-2 text-[12px] font-bold text-[#191F28] disabled:opacity-60" />
          <span className="text-[11.5px] font-bold tabular-nums text-[#0B7A5C]">{monthList.length}개월</span>
        </div>
        {([3, 6, 12] as const).map(r => <button key={r} type="button" disabled={busy} onClick={() => quick(r)} className={chip(false)}>최근 {r}개월</button>)}
        <button type="button" disabled={busy} onClick={() => { setFromYm(`${parseInt(thisMonth.slice(0, 4)) - 1}-01`); setToYm(addMonths(thisMonth, -1)); }} className={chip(false)}>작년 1월부터</button>
        <span className="mx-1 text-[#D1D6DB]">|</span>
        {types.map(t => {
          const on = picked.includes(t);
          return (
            <button key={t} type="button" disabled={busy} onClick={() => setPicked(p => on ? p.filter(x => x !== t) : [...p, t])}
              className={`h-8 rounded-lg px-3 text-[12px] font-bold border transition-colors ${on ? "border-[#0F9D77] bg-[#0F9D77] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"} disabled:opacity-40`}>
              {typeOf(t).label}
            </button>
          );
        })}
        <span className="mx-1 text-[#D1D6DB]">|</span>
        <button type="button" disabled={busy} onClick={() => setDoUpload(v => !v)} className={chip(doUpload)} title="이미 위멤버스에 올린 달이면 끄세요">{doUpload ? "✓ " : ""}위멤버스 업로드</button>
        <button type="button" disabled={busy} onClick={() => setDoDocs(v => !v)} className={chip(doDocs)}>{doDocs ? "✓ " : ""}명세서·대장 생성</button>
        {busy ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => { skip.current = true; }} className="h-8 rounded-xl border border-[#E5E8EB] bg-white px-3 text-[12px] font-bold text-[#4E5968]">이 유형 건너뛰기</button>
            <button type="button" onClick={() => { stop.current = true; skip.current = true; }} className="h-8 rounded-xl border border-[#E5E8EB] bg-white px-3 text-[12px] font-bold text-[#DC2626]">중지</button>
          </div>
        ) : (
          <button type="button" disabled={!wehago.ready || picked.length === 0 || monthList.length === 0} onClick={run} className="ml-auto h-8 rounded-xl px-4 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-40" style={{ background: GREEN }}>
            {monthList.length === 0 ? "기간을 고르세요" : `${monthList.length}개월 시작`}
          </button>
        )}
      </div>
      <div className="mt-2 text-[11px] text-[#8B95A1]">위하고에 로그인된 크롬에서 실행하세요. 최근 달부터 거꾸로 진행되고, 다운로드 탭이 잠깐 열렸다 닫히며, 자료가 없는 달은 ‘이 유형 건너뛰기’를 누르면 바로 넘어가요. ‘위멤버스 업로드’를 켜 두면 내려받은 급여 엑셀이 달마다 위멤버스에 자동으로 올라가요(이미 올린 달은 끄세요).</div>
      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11.5px] text-[#6B7684]">
            <span className="truncate">{progress.current || (busy ? "진행 중…" : "")}</span>
            <span className="tabular-nums shrink-0">{progress.done} / {progress.total}개월</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#191F28]/[.06]"><div className="h-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%`, background: GREEN }} /></div>
          <ul className="mt-2 max-h-44 overflow-y-auto space-y-0.5 text-[11.5px] text-[#4E5968]">
            {progress.log.map((l, i) => <li key={i} className="break-all">{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ───────── 선택 월 신고·납부 카드 ───────── */

function FilingCard({ f }: { f: PayrollFilingMonth | null }) {
  if (!f) return <div className="rounded-3xl border border-[#E5E8EB] bg-white/60 px-5 py-4 text-[12.5px] text-[#B0B8C1]">이 달 원천세 진행 기록이 없어요</div>;
  const won0 = (n: number | null) => (n == null ? "-" : `${won(n)}원`);
  return (
    <div className="rounded-3xl border border-[#E5E8EB] bg-white/70 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-bold text-[#8B95A1]">원천세 신고 · 납부</div>
        {f.steps.length === 0 ? <span className="text-[11px] text-[#B0B8C1]">이 달 신고 없음(반기납)</span> : (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${f.statusColor}1F`, color: f.statusColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.statusColor }} />{f.statusLabel}
          </span>
        )}
      </div>
      {f.steps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f.steps.map(s => {
            const done = f.doneSteps.includes(s);
            return <span key={s} className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${done ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>{done ? "✓ " : ""}{s}</span>;
          })}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div><div className="text-[10.5px] text-[#8B95A1]">소득세</div><div className="text-[15px] font-extrabold tabular-nums text-[#191F28]">{won0(f.incomeAmount)}</div></div>
        <div><div className="text-[10.5px] text-[#8B95A1]">지방소득세</div><div className="text-[15px] font-extrabold tabular-nums text-[#191F28]">{won0(f.localAmount)}</div></div>
        <div>
          <div className="text-[10.5px] text-[#8B95A1]">전자신고</div>
          <div className="text-[12.5px] font-bold text-[#191F28]">
            {f.filingStatus == null || f.filingStatus === "none" ? <span className="text-[#B0B8C1]">-</span>
              : f.filingStatus === "submitted" ? <span className="text-[#15803D]">접수{f.reportType ? ` · ${f.reportType}` : ""}</span>
              : f.filingStatus === "error" ? <span className="text-[#DC2626]">오류</span>
              : <span className="text-[#B45309]">{f.filingStatus === "produced" ? "파일제작" : f.filingStatus === "verified" ? "검증" : f.filingStatus}</span>}
          </div>
          {f.receiptNo && <div className="text-[10.5px] tabular-nums text-[#8B95A1]">접수 {f.receiptNo}</div>}
        </div>
      </div>
    </div>
  );
}

/* ───────── 본체 ───────── */

export function ClientPayrollModal({ clientId, clientName, initialMonth, onClose, preload }: {
  clientId: number;
  clientName?: string;
  initialMonth?: string;
  onClose: () => void;
  preload?: PayrollResponse;
}) {
  const [data, setData] = useState<PayrollResponse | null>(preload ?? null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialMonth ?? null);
  const [showCollect, setShowCollect] = useState(false);
  const [showWehago, setShowWehago] = useState(false);

  useEffect(() => {
    if (preload) return;
    let alive = true;
    fetch(`/api/clients/${clientId}/payroll`, { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "불러오지 못했어요"); return j as PayrollResponse; })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "불러오지 못했어요"); });
    return () => { alive = false; };
  }, [clientId, preload]);

  useEffect(() => {
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
  const thisMonth = data?.today.slice(0, 7) ?? "9999-12";
  const selYear = sel ? parseInt(sel.slice(0, 4)) : parseInt(thisMonth.slice(0, 4));
  const years = useMemo(() => Array.from(new Set(months.map(x => x.yearMonth.slice(0, 4)))).sort(), [months]);
  const selChipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { selChipRef.current?.scrollIntoView({ inline: "center", block: "nearest" }); }, [selected, data]);
  const onCollected = useCallback((ms: PayrollMonthData[]) => { setData(d => d ? { ...d, months: ms } : d); }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${clientId}/payroll`, { cache: "no-store" });
      if (r.ok) setData(await r.json() as PayrollResponse);
    } catch { /* 무시 */ }
  }, [clientId]);

  const diff = m && prevM ? m.total.gross - prevM.total.gross : null;
  const filings = useMemo(() => data?.filings ?? [], [data]);
  const selFiling = sel ? filings.find(f => f.yearMonth === sel) ?? null : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191F28]/35 p-2 backdrop-blur-[4px] sm:p-4" onClick={onClose}>
      <div className="glass-strong flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* 헤더 */}
        <div className="border-b border-[#F2F4F6] px-5 pt-4 pb-3 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">Withholding · Payroll</div>
              <h2 className="mt-0.5 truncate text-[20px] font-extrabold tracking-tight text-[#191F28]">
                {data?.client.name ?? clientName ?? ""} <span className="text-[#8B95A1] font-bold">원천세 · 인건비 상세</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setShowWehago(v => !v); setShowCollect(false); }} className={`h-8 rounded-xl border px-3 text-[12.5px] font-bold transition-colors ${showWehago ? "border-[#0F9D77] bg-[#0F9D77] text-white" : "border-[#0F9D77] bg-white/80 text-[#0B7A5C] hover:bg-[#ECFDF5]"}`}>
                지난 달 일괄 처리
              </button>
              <button type="button" onClick={() => { setShowCollect(v => !v); setShowWehago(false); }} className={`h-8 rounded-xl border px-3 text-[12.5px] font-bold transition-colors ${showCollect ? "border-[#191F28] bg-[#191F28] text-white" : "border-[#E5E8EB] bg-white/80 text-[#4E5968] hover:bg-[#F2F4F6]"}`}>
                드라이브에서 가져오기
              </button>
              <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg leading-none text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#333D4B]" aria-label="닫기">✕</button>
            </div>
          </div>
          {months.length > 0 && sel && (
            <div className="mt-3 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {years.map(y => (
                  <div key={y} className="flex items-center gap-1">
                    <span className="mx-1 text-[11px] font-bold text-[#8B95A1]">{y}</span>
                    {months.filter(x => x.yearMonth.startsWith(y)).map(x => {
                      const on = x.yearMonth === sel;
                      return (
                        <button key={x.yearMonth} ref={on ? selChipRef : undefined} type="button" onClick={() => setSelected(x.yearMonth)} className={`h-8 rounded-lg px-2.5 text-[12px] font-bold tabular-nums transition-colors ${on ? "bg-[#191F28] text-white shadow-sm" : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"}`}>
                          {parseInt(mm(x.yearMonth))}월
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {showWehago && data && <WmBatchPanel clientId={clientId} clientName={data.client.name} wehago={data.wehago} types={data.client.types} thisMonth={thisMonth} onRefresh={refresh} />}
          {showCollect && data && <CollectPanel clientId={clientId} thisMonth={thisMonth} onDone={onCollected} />}
          {error ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-6 text-center text-[13px] font-bold text-[#DC2626]">{error}</div>
          ) : !data ? (
            <div className="space-y-5 animate-pulse"><div className="h-20 w-2/3 rounded-2xl bg-[#F2F4F6]" /><div className="h-60 rounded-2xl bg-[#F2F4F6]" /></div>
          ) : months.length === 0 || !m || !sel ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <div className="text-[15px] font-bold text-[#4E5968]">아직 저장된 급여 자료가 없어요</div>
              <div className="text-[12.5px] text-[#8B95A1]">매달 원천세 페이지에서 위멤버스 버튼을 돌리면 자동으로 쌓여요. 지난 달들은 ‘지난 달 일괄 처리’로 같은 루틴을 연달아 돌리면 돼요</div>
              {!showWehago && !showCollect && <button type="button" onClick={() => setShowWehago(true)} className="mt-2 h-9 rounded-xl px-4 text-[13px] font-bold text-white" style={{ background: GREEN }}>지난 달 일괄 처리</button>}
            </div>
          ) : (
            <>
              {/* 문장 요약 + 이 달 신고·납부 */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div>
                <div className="text-[12px] font-medium text-[#8B95A1]">급여대장 기준</div>
                <div className="mt-1 text-[24px] font-extrabold leading-snug tracking-tight text-[#191F28]">
                  {parseInt(mm(sel))}월 직원 인건비는<br /><span style={{ color: GREEN }}>{won(m.total.gross)}원</span> 이에요.
                </div>
                <div className="mt-2 text-[14px] font-medium text-[#8B95A1]">
                  {diff == null ? "지난달 자료가 없어 비교는 못 해요." : diff === 0 ? "지난달 급여와 같아요." : <>지난달 급여에 비해 <b className={diff > 0 ? "text-[#191F28]" : "text-[#1B64DA]"}>{won(Math.abs(diff))}원 {diff > 0 ? "늘었어요" : "줄었어요"}.</b></>}
                  <span className="ml-3 text-[12.5px]">세후 합계 {won(m.total.net)}원 · {m.total.headcount}명</span>
                </div>
              </div>
              <FilingCard f={selFiling} />
              </section>

              {/* 급여대상자 */}
              <section>
                <h3 className="mb-3 text-[17px] font-bold text-[#191F28]">• {parseInt(mm(sel))}월 급여대상자</h3>
                <EmployeeList key={sel} month={m} />
              </section>

              {/* 유형별 직원 × 월 */}
              <section>
                <h3 className="mb-3 text-[17px] font-bold text-[#191F28]">• 직원별 월 급여 <span className="text-[13px] font-medium text-[#8B95A1]">소득유형별 · 가로로 움직여 보세요</span></h3>
                <div className="space-y-4">
                  {PAYROLL_TYPES.map(t => <EmployeeMatrix key={t.key} months={months} type={t.key} selected={sel} onSelect={setSelected} />)}
                </div>
              </section>

              {/* 인건비 추이 */}
              <section>
                <h3 className="mb-3 text-[17px] font-bold text-[#191F28]">• 인건비 추이 <span className="text-[13px] font-medium text-[#8B95A1]">{selYear}년 vs {selYear - 1}년</span></h3>
                <YearTrend months={months} year={selYear} thisMonth={thisMonth} />
              </section>

              <div className="flex items-center justify-between pb-1 text-[11px] text-[#B0B8C1]">
                <span>위하고 급여자료 엑셀(근로·사업·일용) 기준 · 지급액 = 세전, 세후 = 차인지급액</span>
                <span>{m.types.map(t => `${typeOf(t.incomeType).short} ${t.sourceFile ? "파일 있음" : "-"}`).join(" · ")}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
