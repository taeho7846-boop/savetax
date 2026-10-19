"use client";

import { useEffect, useRef, useState } from "react";
import type { PnlData, PnlPeriod, PnlBreakdown } from "@/lib/client-profile";

/**
 * 손익 구역 — 매출(A) − 매입(B) − 인건비(C) = 손익. 세모리포트 '손익' 화면 구성을 따른다.
 * 접힘: 올해 누적 금액 + 작년 같은 달까지 비교. 펼침: 기간(올해 누적 ↔ 월별)을 ‹ › 로 넘기며 건수·평균·유형별 내역.
 * 데이터: ClientProfile.pnl (lib/client-profile) — 매출·매입은 세모리포트 공급가액, 인건비는 급여대장 지급액(세전).
 */

const won = (n: number) => n.toLocaleString("ko-KR");
/** 1억 1,054만원 / 6,788만원 / -320만원 */
function eokMan(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const man = Math.round(a / 1e4);
  if (man >= 1e4) {
    const eok = Math.floor(man / 1e4), rest = man % 1e4;
    return `${sign}${eok}억${rest > 0 ? ` ${rest.toLocaleString("ko-KR")}만` : ""}원`;
  }
  return `${sign}${man.toLocaleString("ko-KR")}만원`;
}
const manOnly = (n: number) => `${n < 0 ? "-" : ""}${Math.round(Math.abs(n) / 1e4).toLocaleString("ko-KR")}만원`;

const COLORS = {
  sale: { main: "#0F9D77", soft: "#ECFDF5", text: "#047857" },
  buy: { main: "#F5A623", soft: "#FFF8E8", text: "#B45309" },
  pay: { main: "#B06BF3", soft: "#F8F0FF", text: "#7C3AED" },
  profit: { main: "#1B8CFF", soft: "#EEF5FF", text: "#1B64DA" },
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></svg>
  );
}

function Minus() {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E5E8EB] text-[#8B95A1]"><span className="h-[3px] w-3.5 rounded bg-[#8B95A1]" /></div>;
}

/** 기간 선택: ‹ 올해 누적매출 › */
function PeriodNav({ label, canPrev, canNext, onPrev, onNext }: { label: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button type="button" disabled={!canPrev} onClick={onPrev} className="text-[#B0B8C1] hover:text-[#4E5968] disabled:opacity-30" aria-label="이전">‹</button>
      <span className="text-[13.5px] font-bold text-[#191F28]">{label}</span>
      <button type="button" disabled={!canNext} onClick={onNext} className="text-[#B0B8C1] hover:text-[#4E5968] disabled:opacity-30" aria-label="다음">›</button>
    </div>
  );
}

function SummaryBox({ rows, soft, text }: { rows: { k: string; v: string }[]; soft: string; text: string }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 space-y-1.5" style={{ background: soft }}>
      {rows.map(r => (
        <div key={r.k} className="flex items-center justify-between text-[12.5px]">
          <span className="font-bold text-[#4E5968]">{r.k}</span>
          <span className="font-bold tabular-nums" style={{ color: text }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function ItemRows({ items, unit }: { items: PnlBreakdown[]; unit: "건" | "명" }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map(it => (
        <li key={it.key} className="flex items-center justify-between text-[12.5px]">
          <span className="text-[#4E5968]">{it.label}<span className="ml-0.5 text-[#8B95A1]">({it.count}{unit})</span></span>
          <span className={`tabular-nums ${it.amount > 0 ? "font-bold text-[#191F28]" : "text-[#B0B8C1]"}`}>{won(it.amount)}원</span>
        </li>
      ))}
    </ul>
  );
}

/** 평균(월/일) 표기 */
function avgLabel(p: PnlPeriod, amount: number): string {
  if (p.days) return `일 ${manOnly(Math.round(amount / p.days))}`;
  const m = Math.max(1, p.months);
  return `월 ${manOnly(Math.round(amount / m))}`;
}


/* ───────── 손익 추이: 월별(올해 막대 + 작년 선) · 누적(올해·작년 선 + 연말 예상 점선) ───────── */

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const BLUE = "#1B8CFF", GREY = "#B0B8C1";

function Tip({ i, rows, title }: { i: number; rows: { label: string; color: string; value: number | null }[]; title: string }) {
  return (
    <div className={`pointer-events-none absolute top-0 z-20 w-[190px] rounded-xl bg-[#191F28] p-2.5 text-white shadow-lg ${i < 2 ? "left-0" : i > 9 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
      <div className="text-[12px] font-extrabold">{title}</div>
      {rows.map(r => (
        <div key={r.label} className="mt-1 flex items-center justify-between text-[11.5px]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.label}</span>
          <b className="tabular-nums">{r.value == null ? "-" : `${won(r.value)}원`}</b>
        </div>
      ))}
    </div>
  );
}

function ProfitTrend({ pnl }: { pnl: PnlData }) {
  const year = pnl.year;
  const byKey = new Map(pnl.months.map(m => [m.key, m]));
  const key = (y: number, i: number) => `${y}-${String(i + 1).padStart(2, "0")}`;
  const cur = Array.from({ length: 12 }, (_, i) => byKey.get(key(year, i))?.profit ?? null);
  const prev = Array.from({ length: 12 }, (_, i) => byKey.get(key(year - 1, i))?.profit ?? null);
  const through = pnl.throughMonth ? parseInt(pnl.throughMonth.slice(5, 7)) : 0;
  const ytd = pnl.ytd.profit;
  const n = Math.max(0, pnl.ytd.months);
  const avgCur = n > 0 ? Math.round(ytd / n) : null;
  const projected = n > 0 ? Math.round((ytd / n) * 12) : null;
  const prevYtd = pnl.prevYtd?.profit ?? null;
  const prevAvg = pnl.prevYtd && pnl.prevYtd.months > 0 ? Math.round(pnl.prevYtd.profit / pnl.prevYtd.months) : null;

  // 누적
  const cumOf = (arr: (number | null)[]) => { let acc = 0; let seen = false; return arr.map(v => { if (v == null) return seen ? null : null; seen = true; acc += v; return acc; }); };
  const cumCur = cumOf(cur), cumPrev = cumOf(prev);
  const lastIdx = cur.reduce<number>((a, v, i) => (v != null ? i : a), -1);
  const proj: (number | null)[] = Array.from({ length: 12 }, (_, i) => (lastIdx >= 0 && i >= lastIdx && avgCur != null ? (cumCur[lastIdx] ?? 0) + avgCur * (i - lastIdx) : null));

  const [hl, setHl] = useState<number | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const { ref: leftRef, width: leftW } = useWidth();
  const { ref: rightRef, width: rightW } = useWidth();
  const H = 190, PADL = 8, PADR = 8, GAP = 8;

  function scale(vals: (number | null)[][]) {
    const all = vals.flat().filter((v): v is number => v != null);
    const max = Math.max(0, ...all), min = Math.min(0, ...all);
    const span = max - min || 1;
    return { max, min, y: (v: number) => (max - v) / span * H };
  }
  const sL = scale([cur, prev]);
  const sR = scale([cumCur, cumPrev, proj]);
  const xOf = (w: number, i: number) => { const colW = (w - PADL - PADR - GAP * 11) / 12; return PADL + colW * i + GAP * i + colW / 2; };
  const pathOf = (w: number, vals: (number | null)[], y: (v: number) => number) => {
    const segs: string[] = []; let seg: string[] = [];
    vals.forEach((v, i) => { if (v == null) { if (seg.length) segs.push(seg.join(" ")); seg = []; return; } seg.push(`${xOf(w, i).toFixed(1)},${y(v).toFixed(1)}`); });
    if (seg.length) segs.push(seg.join(" "));
    return segs;
  };
  const colW = (w: number) => (w - PADL - PADR - GAP * 11) / 12;
  const diff = prevYtd == null ? null : ytd - prevYtd;

  return (
    <div className="mt-6">
      <div className="text-[11.5px] font-medium text-[#8B95A1]">지난해와 비교하기</div>
      <div className="mt-1 text-[20px] font-extrabold leading-snug tracking-tight text-[#191F28]">
        {through > 0 ? <>{String(through).padStart(2, "0")}월말 기준 누적손익은 <span style={{ color: ytd < 0 ? "#DC2626" : BLUE }}>{eokMan(ytd)}</span>이에요.</> : <span className="text-[#8B95A1]">올해 손익 자료가 아직 없어요</span>}
      </div>
      {projected != null && <div className="mt-1 text-[13px] font-bold text-[#8B95A1]">올해 손익 예상은 {eokMan(projected)}이에요. <span className="font-medium">(월평균 × 12)</span></div>}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 연간 손익추이 */}
        <div>
          <div className="text-[14px] font-bold text-[#191F28]">• 연간 손익추이</div>
          <div className="mt-1.5 text-[14px] font-bold leading-snug text-[#191F28]">
            {diff == null ? <span className="text-[#8B95A1] font-medium">작년 같은 기간 자료가 없어 비교는 못 해요</span>
              : <>올해 {String(through).padStart(2, "0")}월까지 손익 합계는<br />작년 같은 기간보다 <span style={{ color: BLUE }}>{eokMan(Math.abs(diff))}</span> {diff >= 0 ? "증가했어요" : "감소했어요"}</>}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#8B95A1]">
            <div className="space-y-0.5"><div>작년 평균: {prevAvg == null ? "-" : manOnly(prevAvg)}</div><div>올해 평균: {avgCur == null ? "-" : manOnly(avgCur)}</div></div>
            <div className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: GREY }} />작년</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BLUE }} />올해</span></div>
          </div>
          <div ref={leftRef} className="relative mt-2" style={{ height: H }} onMouseLeave={() => setHl(null)}>
            {leftW > 0 && (
              <svg className="absolute inset-0" width={leftW} height={H} viewBox={`0 0 ${leftW} ${H}`}>
                <line x1={0} x2={leftW} y1={sL.y(0)} y2={sL.y(0)} stroke="#8B95A1" strokeWidth={1} />
                {cur.map((v, i) => v == null ? null : (
                  <rect key={i} x={xOf(leftW, i) - colW(leftW) * 0.3} width={colW(leftW) * 0.6} y={Math.min(sL.y(0), sL.y(v))} height={Math.max(2, Math.abs(sL.y(v) - sL.y(0)))} rx={3} fill={BLUE} opacity={hl != null && hl !== i ? 0.35 : 1} />
                ))}
                {pathOf(leftW, prev, sL.y).map((d, k) => <polyline key={k} points={d} fill="none" stroke={GREY} strokeWidth={2} strokeLinejoin="round" />)}
                {prev.map((v, i) => v == null ? null : <circle key={i} cx={xOf(leftW, i)} cy={sL.y(v)} r={3} fill={GREY} />)}
              </svg>
            )}
            <div className="absolute inset-0 flex" style={{ paddingLeft: PADL, paddingRight: PADR, gap: GAP }}>
              {cur.map((_, i) => (
                <div key={i} className="relative flex-1 cursor-crosshair" onMouseEnter={() => setHl(i)}>
                  {hl === i && <Tip i={i} title={`${i + 1}월`} rows={[{ label: "작년", color: GREY, value: prev[i] }, { label: "올해", color: BLUE, value: cur[i] }]} />}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex" style={{ paddingLeft: PADL, paddingRight: PADR, gap: GAP }}>{Array.from({ length: 12 }, (_, i) => <div key={i} className="flex-1 text-center text-[10.5px] text-[#8B95A1]">{i + 1}월</div>)}</div>
        </div>

        {/* 누적 손익추이 */}
        <div>
          <div className="text-[14px] font-bold text-[#191F28]">• 누적 손익추이</div>
          <div className="mt-1.5 text-[14px] font-bold leading-snug text-[#191F28]">
            {through > 0 ? <>{String(through).padStart(2, "0")}월까지 총 손익은<br /><span style={{ color: BLUE }}>{won(ytd)}원</span> 입니다.</> : <span className="text-[#8B95A1] font-medium">자료 없음</span>}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#8B95A1]">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: BLUE }} />예상</span>
            <div className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: GREY }} />작년</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: BLUE }} />올해</span></div>
          </div>
          <div ref={rightRef} className="relative mt-2" style={{ height: H }} onMouseLeave={() => setHr(null)}>
            {rightW > 0 && (
              <svg className="absolute inset-0" width={rightW} height={H} viewBox={`0 0 ${rightW} ${H}`}>
                {sR.min < 0 && <line x1={0} x2={rightW} y1={sR.y(0)} y2={sR.y(0)} stroke="#D1D6DB" strokeWidth={1} />}
                {pathOf(rightW, cumPrev, sR.y).map((d, k) => <polyline key={`p${k}`} points={d} fill="none" stroke={GREY} strokeWidth={2} strokeLinejoin="round" />)}
                {cumPrev.map((v, i) => v == null ? null : <circle key={`pc${i}`} cx={xOf(rightW, i)} cy={sR.y(v)} r={3} fill={GREY} />)}
                {pathOf(rightW, proj, sR.y).map((d, k) => <polyline key={`j${k}`} points={d} fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />)}
                {pathOf(rightW, cumCur, sR.y).map((d, k) => <polyline key={`c${k}`} points={d} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinejoin="round" />)}
                {cumCur.map((v, i) => v == null ? null : <circle key={`cc${i}`} cx={xOf(rightW, i)} cy={sR.y(v)} r={3.5} fill={BLUE} />)}
              </svg>
            )}
            <div className="absolute inset-0 flex" style={{ paddingLeft: PADL, paddingRight: PADR, gap: GAP }}>
              {cumCur.map((_, i) => (
                <div key={i} className="relative flex-1 cursor-crosshair" onMouseEnter={() => setHr(i)}>
                  {hr === i && <Tip i={i} title={`1월 ~ ${i + 1}월 누적`} rows={[{ label: "작년", color: GREY, value: cumPrev[i] }, { label: cumCur[i] == null ? "올해(예상)" : "올해", color: BLUE, value: cumCur[i] ?? proj[i] }]} />}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex" style={{ paddingLeft: PADL, paddingRight: PADR, gap: GAP }}>{Array.from({ length: 12 }, (_, i) => <div key={i} className="flex-1 text-center text-[10.5px] text-[#8B95A1]">{i + 1}월</div>)}</div>
        </div>
      </div>
    </div>
  );
}

export function PnlSection({ pnl, onOpenLedger, onOpenPayroll }: { pnl: PnlData; onOpenLedger?: (ym?: string) => void; onOpenPayroll?: (ym?: string) => void }) {
  const [open, setOpen] = useState(false);
  const periods: PnlPeriod[] = [pnl.ytd, ...pnl.months];
  const [idx, setIdx] = useState(0);
  const cur = periods[Math.min(idx, periods.length - 1)] ?? pnl.ytd;
  const isYtd = cur.key === "ytd";
  const through = pnl.throughMonth ? parseInt(pnl.throughMonth.slice(5, 7)) : null;
  const prevSub = (v: number | null) => through == null ? "작년 자료 없음" : v == null ? `작년 ${String(through).padStart(2, "0")}월까지 자료 없음` : `작년 ${String(through).padStart(2, "0")}월까지 ${eokMan(v)}`;
  const navLabel = (what: string) => (isYtd ? `올해 누적${what}` : `${cur.label} ${what}`);
  const nav = { canPrev: idx > 0, canNext: idx < periods.length - 1, onPrev: () => setIdx(i => Math.max(0, i - 1)), onNext: () => setIdx(i => Math.min(periods.length - 1, i + 1)) };
  const monthYm = isYtd ? undefined : cur.key;

  const cards = [
    {
      key: "sale", title: "매출(A)", c: COLORS.sale, total: pnl.ytd.sale.supply, prev: pnl.prevYtd?.sale.supply ?? null,
      detail: (
        <>
          <PeriodNav label={navLabel("매출")} {...nav} />
          <SummaryBox soft={COLORS.sale.soft} text={COLORS.sale.text} rows={[
            { k: `총 ${cur.sale.count}건`, v: `${won(cur.sale.supply)}원` },
            { k: "평균 객단가", v: cur.sale.count > 0 ? `약 ${won(Math.round(cur.sale.supply / cur.sale.count))}원` : "-" },
            { k: "평균매출", v: avgLabel(cur, cur.sale.supply) },
          ]} />
          <ItemRows items={cur.sale.items} unit="건" />
          {onOpenLedger && <button type="button" onClick={() => onOpenLedger(monthYm)} className="mt-3 w-full rounded-lg bg-[#F2F4F6] py-1.5 text-[11.5px] font-bold text-[#4E5968] hover:bg-[#E5E8EB]">매출·매입 상세 →</button>}
        </>
      ),
    },
    {
      key: "buy", title: "매입(B)", c: COLORS.buy, total: pnl.ytd.buy.supply, prev: pnl.prevYtd?.buy.supply ?? null,
      detail: (
        <>
          <PeriodNav label={navLabel("매입")} {...nav} />
          <SummaryBox soft={COLORS.buy.soft} text={COLORS.buy.text} rows={[
            { k: `총 ${cur.buy.count}건`, v: `${won(cur.buy.supply)}원` },
            { k: "평균매입", v: avgLabel(cur, cur.buy.supply) },
          ]} />
          <ItemRows items={cur.buy.items} unit="건" />
          {onOpenLedger && <button type="button" onClick={() => onOpenLedger(monthYm)} className="mt-3 w-full rounded-lg bg-[#F2F4F6] py-1.5 text-[11.5px] font-bold text-[#4E5968] hover:bg-[#E5E8EB]">매출·매입 상세 →</button>}
        </>
      ),
    },
    {
      key: "pay", title: "인건비(C)", c: COLORS.pay, total: pnl.ytd.payroll.gross, prev: pnl.prevYtd?.payroll.gross ?? null,
      detail: (
        <>
          <PeriodNav label={navLabel("인건비")} {...nav} />
          <SummaryBox soft={COLORS.pay.soft} text={COLORS.pay.text} rows={[
            { k: `총 ${cur.payroll.headcount}명`, v: `${won(cur.payroll.gross)}원` },
          ]} />
          <ItemRows items={cur.payroll.items} unit="명" />
          {onOpenPayroll && <button type="button" onClick={() => onOpenPayroll(monthYm)} className="mt-3 w-full rounded-lg bg-[#F2F4F6] py-1.5 text-[11.5px] font-bold text-[#4E5968] hover:bg-[#E5E8EB]">원천세·인건비 상세 →</button>}
        </>
      ),
    },
  ];

  const profitRate = cur.sale.supply > 0 ? Math.round((cur.profit / cur.sale.supply) * 100) : null;

  return (
    <div>
      {/* A − B − C */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
        {cards.map((card, i) => (
          <div key={card.key} className="contents">
            {i > 0 && <div className="hidden self-center lg:block"><Minus /></div>}
            <div className="overflow-hidden rounded-2xl border bg-white/80" style={{ borderColor: card.c.main }}>
              <button type="button" onClick={() => setOpen(o => !o)} className="w-full px-4 pt-3.5 pb-3 text-left" style={open ? { background: card.c.main } : undefined}>
                <div className={`text-[15px] font-extrabold ${open ? "text-white" : ""}`} style={open ? undefined : { color: card.c.main }}>{card.title}</div>
                <div className={`mt-1 text-[22px] font-extrabold leading-none tracking-tight tabular-nums ${open ? "text-white" : "text-[#191F28]"}`}>{eokMan(card.total)}</div>
                <div className={`mt-1.5 text-[11.5px] ${open ? "text-white/85" : "text-[#8B95A1]"}`}>{prevSub(card.prev)}</div>
              </button>
              {open && <div className="px-4 pb-3">{card.detail}</div>}
              <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-center py-1.5 text-[#8B95A1] hover:text-[#4E5968]" aria-label={open ? "접기" : "펼치기"}>
                <Chevron open={open} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* = */}
      <div className="my-3 border-t-2 border-dashed border-[#D1D6DB]" />
      <div className="flex justify-center"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E5E8EB]"><span className="flex flex-col gap-[3px]"><span className="h-[3px] w-3.5 rounded bg-[#8B95A1]" /><span className="h-[3px] w-3.5 rounded bg-[#8B95A1]" /></span></div></div>

      {/* 손익 */}
      <div className="mt-3 overflow-hidden rounded-2xl border bg-white/80" style={{ borderColor: COLORS.profit.main }}>
        <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-start justify-between px-5 pt-3.5 pb-3 text-left" style={open ? { background: COLORS.profit.main } : undefined}>
          <div className={`text-[16px] font-extrabold ${open ? "text-white" : ""}`} style={open ? undefined : { color: COLORS.profit.main }}>손익(A-B-C)</div>
          <div className="text-right">
            <div className={`text-[24px] font-extrabold leading-none tracking-tight tabular-nums ${open ? "text-white" : pnl.ytd.profit < 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>{eokMan(pnl.ytd.profit)}</div>
            <div className={`mt-1.5 text-[11.5px] ${open ? "text-white/85" : "text-[#8B95A1]"}`}>{prevSub(pnl.prevYtd ? pnl.prevYtd.profit : null)}</div>
          </div>
        </button>
        {open && (
          <div className="px-5 pb-3">
            <PeriodNav label={navLabel("손익")} {...nav} />
            <SummaryBox soft={COLORS.profit.soft} text={COLORS.profit.text} rows={[
              { k: "손익", v: `약 ${won(cur.profit)}원` },
              { k: "평균손익", v: avgLabel(cur, cur.profit) },
            ]} />
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              <li className="flex justify-between"><span className="text-[#4E5968]">매출</span><b className="tabular-nums text-[#191F28]">{won(cur.sale.supply)}원</b></li>
              <li className="flex justify-between"><span className="text-[#4E5968]">매입</span><b className="tabular-nums text-[#191F28]">{won(cur.buy.supply)}원</b></li>
              <li className="flex justify-between"><span className="text-[#4E5968]">인건비</span><b className="tabular-nums text-[#191F28]">{won(cur.payroll.gross)}원</b></li>
              <li className="flex justify-between"><span className="font-bold text-[#191F28]">평균 이익률</span><b className="tabular-nums text-[#191F28]">{profitRate == null ? "-" : `약 ${profitRate}%`}</b></li>
            </ul>
            <div className="mt-1 text-[10.5px] text-[#B0B8C1]">*손익/매출 = 매출 중 남는 이익의 비율 · 매출·매입은 세모리포트 공급가액, 인건비는 급여대장 지급액(세전) 기준</div>
          </div>
        )}
        <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-center py-1.5 text-[#8B95A1] hover:text-[#4E5968]" aria-label={open ? "접기" : "펼치기"}>
          <Chevron open={open} />
        </button>
      </div>

      <ProfitTrend pnl={pnl} />
    </div>
  );
}
