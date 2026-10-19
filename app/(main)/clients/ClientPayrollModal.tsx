"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAYROLL_TYPES, type PayrollMonthData, type PayrollType, type CollectResult } from "@/lib/payroll-types";

/**
 * 거래처 인건비(급여) 상세 모달 — 세모리포트 '급여' 화면 구성을 따른다.
 * 데이터: GET /api/clients/[id]/payroll (PayrollMonth — 위하고 급여 엑셀에서 저장)
 * 구역: 월 선택 → 문장 요약 → 급여대상자(전체/근로/일용/사업) → 소득별 급여 현황(가로 표) → 인건비 추이(작년 vs 올해)
 * 과거분은 '드라이브에서 가져오기'로 채운다 (POST, 월 단위).
 */

type PayrollResponse = { today: string; client: { id: number; name: string; laborTypes: string | null; withholdingType: string | null }; months: PayrollMonthData[] };

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

/* ───────── 소득별 급여 현황 (가로 표) ───────── */

function TypeTable({ months, selected, onSelect }: { months: PayrollMonthData[]; selected: string; onSelect: (ym: string) => void }) {
  const byYm = new Map(months.map(m => [m.yearMonth, m]));
  const cols = Array.from({ length: 7 }, (_, i) => addMonths(selected, -i));
  const cell = (ym: string, type: PayrollType) => {
    const t = byYm.get(ym)?.types.find(x => x.incomeType === type);
    return { gross: t?.gross ?? 0, cnt: t?.headcount ?? 0, has: !!byYm.get(ym) };
  };
  const total = (ym: string) => byYm.get(ym)?.total ?? null;
  const selTotal = total(selected);
  const prevTotal = total(addMonths(selected, -1));
  const delta = selTotal && prevTotal && prevTotal.gross > 0 ? Math.round(((selTotal.gross - prevTotal.gross) / prevTotal.gross) * 100) : null;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate border-spacing-0 min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white/95 w-[110px]" />
            {cols.map((ym, i) => (
              <th key={ym} className="px-1 pb-1">
                <button type="button" onClick={() => onSelect(ym)} className={`w-[150px] rounded-t-2xl px-3 py-3 text-[14px] font-bold transition-colors ${i === 0 ? "bg-[#191F28] text-white" : "bg-[#F9FAFB] text-[#4E5968] hover:bg-[#F2F4F6]"}`}>
                  {ym.slice(0, 4)}년 {mm(ym)}월
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PAYROLL_TYPES.map(t => (
            <tr key={t.key}>
              <td className="sticky left-0 z-10 bg-white/95 px-3 py-3 text-[13px] font-bold text-[#4E5968] whitespace-nowrap border-t border-[#F2F4F6]">{t.short}</td>
              {cols.map((ym, i) => {
                const c = cell(ym, t.key);
                return (
                  <td key={ym} className={`px-4 py-3 text-right tabular-nums whitespace-nowrap border-t border-[#F2F4F6] ${i === 0 ? "bg-[#F9FAFB] font-bold text-[#191F28]" : "text-[#6B7684]"}`}>
                    <div className="text-[13px]">{c.has ? `${won(c.gross)}원` : <span className="text-[#D1D6DB]">-</span>}</div>
                    <div className="text-[11px] text-[#8B95A1]">{c.has ? `${c.cnt}명` : ""}</div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 z-10 bg-white/95 px-3 py-3 text-[13px] font-bold text-[#191F28] whitespace-nowrap border-t-2 border-[#E5E8EB]">
              총 지급
              {delta != null && <div className={`text-[12px] font-bold ${delta >= 0 ? "text-[#DC2626]" : "text-[#1B64DA]"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</div>}
            </td>
            {cols.map((ym, i) => {
              const tt = total(ym);
              return (
                <td key={ym} className={`px-4 py-3 text-right tabular-nums whitespace-nowrap border-t-2 border-[#E5E8EB] ${i === 0 ? "bg-[#F9FAFB]" : ""}`}>
                  <div className={`text-[13.5px] font-extrabold ${i === 0 ? "underline decoration-2 underline-offset-4" : "text-[#4E5968]"}`} style={i === 0 ? { color: GREEN } : undefined}>{tt ? `${won(tt.gross)}원` : <span className="text-[#D1D6DB]">-</span>}</div>
                  <div className="text-[11px] text-[#8B95A1]">{tt ? `${tt.headcount}명` : ""}</div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <div className="mt-1.5 text-right text-[10.5px] text-[#B0B8C1]">표를 좌우로 움직여 보세요 · 월을 누르면 그 달로 이동</div>
    </div>
  );
}

/* ───────── 인건비 추이 (작년 vs 올해) ───────── */

function YearTrend({ months, year, thisMonth }: { months: PayrollMonthData[]; year: number; thisMonth: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const byYm = new Map(months.map(m => [m.yearMonth, m.total.gross]));
  const cur = Array.from({ length: 12 }, (_, i) => byYm.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? null);
  const prev = Array.from({ length: 12 }, (_, i) => byYm.get(`${year - 1}-${String(i + 1).padStart(2, "0")}`) ?? null);
  const max = Math.max(1, ...cur.map(v => v ?? 0), ...prev.map(v => v ?? 0));
  const H = 240;
  let lastIdx = -1;
  cur.forEach((v, i) => { if (v != null && `${year}-${String(i + 1).padStart(2, "0")}` <= thisMonth) lastIdx = i; });
  const curSum = cur.slice(0, lastIdx + 1).reduce<number>((a, v) => a + (v ?? 0), 0);
  const prevSum = prev.slice(0, lastIdx + 1).reduce<number>((a, v) => a + (v ?? 0), 0);
  const hasPrev = prev.slice(0, lastIdx + 1).some(v => v != null);
  return (
    <div>
      <div className="text-[17px] font-bold leading-snug text-[#191F28]">
        {lastIdx < 0 ? <span className="text-[#8B95A1]">{year}년 인건비 자료가 아직 없어요</span>
          : !hasPrev ? <>{year}년 1~{lastIdx + 1}월 인건비는 <span style={{ color: GREEN }}>{won(curSum)}원</span>이에요<div className="text-[12.5px] font-medium text-[#8B95A1]">작년 자료가 없어 비교는 못 해요</div></>
          : <>지난해 대비 인건비는<br /><span style={{ color: curSum >= prevSum ? GREEN : "#1B64DA" }}>{won(Math.abs(curSum - prevSum))}원</span> {curSum >= prevSum ? "증가" : "감소"}했어요 <span className="text-[13px] font-bold text-[#8B95A1]">(1~{lastIdx + 1}월 누적)</span></>}
      </div>
      <div className="mt-3 flex items-center justify-end gap-4 text-[12px] text-[#6B7684]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#D1D6DB]" />작년</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />올해</span>
      </div>
      <div className="relative mt-2" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-[#D1D6DB]" />
        <div className="absolute inset-0 flex items-end gap-3 px-2">
          {cur.map((c, i) => {
            const p = prev[i];
            const dim = hover != null && hover !== i;
            return (
              <div key={i} className="relative flex h-full flex-1 items-end justify-center gap-[3px] cursor-crosshair" onMouseEnter={() => setHover(i)}>
                <div className="w-[42%] rounded-t-[6px] bg-[#D1D6DB] transition-all" style={{ height: p == null ? 0 : Math.max(p > 0 ? 3 : 0, (p / max) * H), opacity: dim ? 0.35 : 1 }} />
                <div className="w-[42%] rounded-t-[6px] transition-all" style={{ height: c == null ? 0 : Math.max(c > 0 ? 3 : 0, (c / max) * H), background: GREEN, opacity: dim ? 0.35 : 1 }} />
                {hover === i && (
                  <div className={`pointer-events-none absolute top-0 z-10 w-[190px] rounded-2xl border border-[#E5E8EB] bg-white/95 p-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ${i < 2 ? "left-0" : i > 9 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                    <div className="text-[12.5px] font-extrabold text-[#191F28]">{i + 1}월 인건비</div>
                    <div className="mt-1.5 flex justify-between text-[12px]"><span className="text-[#8B95A1]">{year}</span><b className="tabular-nums" style={{ color: GREEN }}>{c == null ? "-" : `${won(c)}원`}</b></div>
                    <div className="flex justify-between text-[12px]"><span className="text-[#8B95A1]">{year - 1}</span><b className="tabular-nums text-[#4E5968]">{p == null ? "-" : `${won(p)}원`}</b></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

  const diff = m && prevM ? m.total.gross - prevM.total.gross : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191F28]/35 p-2 backdrop-blur-[4px] sm:p-4" onClick={onClose}>
      <div className="glass-strong flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* 헤더 */}
        <div className="border-b border-[#F2F4F6] px-5 pt-4 pb-3 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">Payroll · 급여대장 기준</div>
              <h2 className="mt-0.5 truncate text-[20px] font-extrabold tracking-tight text-[#191F28]">
                {data?.client.name ?? clientName ?? ""} <span className="text-[#8B95A1] font-bold">인건비 상세</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowCollect(v => !v)} className={`h-8 rounded-xl border px-3 text-[12.5px] font-bold transition-colors ${showCollect ? "border-[#191F28] bg-[#191F28] text-white" : "border-[#E5E8EB] bg-white/80 text-[#4E5968] hover:bg-[#F2F4F6]"}`}>
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
          {showCollect && data && <CollectPanel clientId={clientId} thisMonth={thisMonth} onDone={onCollected} />}
          {error ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-6 text-center text-[13px] font-bold text-[#DC2626]">{error}</div>
          ) : !data ? (
            <div className="space-y-5 animate-pulse"><div className="h-20 w-2/3 rounded-2xl bg-[#F2F4F6]" /><div className="h-60 rounded-2xl bg-[#F2F4F6]" /></div>
          ) : months.length === 0 || !m || !sel ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <div className="text-[15px] font-bold text-[#4E5968]">아직 저장된 급여 자료가 없어요</div>
              <div className="text-[12.5px] text-[#8B95A1]">원천세 위멤버스 업로드가 끝나면 자동으로 쌓이고, 과거분은 위 ‘드라이브에서 가져오기’로 채울 수 있어요</div>
              {!showCollect && <button type="button" onClick={() => setShowCollect(true)} className="mt-2 h-9 rounded-xl px-4 text-[13px] font-bold text-white" style={{ background: GREEN }}>드라이브에서 가져오기</button>}
            </div>
          ) : (
            <>
              {/* 문장 요약 */}
              <section>
                <div className="text-[12px] font-medium text-[#8B95A1]">급여대장 기준</div>
                <div className="mt-1 text-[24px] font-extrabold leading-snug tracking-tight text-[#191F28]">
                  {parseInt(mm(sel))}월 직원 인건비는<br /><span style={{ color: GREEN }}>{won(m.total.gross)}원</span> 이에요.
                </div>
                <div className="mt-2 text-[14px] font-medium text-[#8B95A1]">
                  {diff == null ? "지난달 자료가 없어 비교는 못 해요." : diff === 0 ? "지난달 급여와 같아요." : <>지난달 급여에 비해 <b className={diff > 0 ? "text-[#191F28]" : "text-[#1B64DA]"}>{won(Math.abs(diff))}원 {diff > 0 ? "늘었어요" : "줄었어요"}.</b></>}
                  <span className="ml-3 text-[12.5px]">세후 합계 {won(m.total.net)}원 · {m.total.headcount}명</span>
                </div>
              </section>

              {/* 급여대상자 */}
              <section>
                <h3 className="mb-3 text-[17px] font-bold text-[#191F28]">• {parseInt(mm(sel))}월 급여대상자</h3>
                <EmployeeList key={sel} month={m} />
              </section>

              {/* 소득별 급여 현황 */}
              <section>
                <h3 className="mb-3 text-[17px] font-bold text-[#191F28]">• 소득별 급여 현황</h3>
                <TypeTable months={months} selected={sel} onSelect={setSelected} />
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
