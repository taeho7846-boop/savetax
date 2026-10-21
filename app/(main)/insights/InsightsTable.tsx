"use client";

import { useMemo, useState, useTransition } from "react";
import { ClientLink } from "@/app/(main)/clients/ClientLink";
import { SINCERE_GROUPS, type InsightsData, type InsightRow, type SincereGroup } from "@/lib/insights-types";
import { setSincereGroup } from "@/app/actions/insights";
import { notify } from "@/components/ui/Dialog";
import { calcAdjustmentFee } from "@/lib/adjustment-fee";

/**
 * 거래처 인사이트 표 — 성실신고확인대상 달성률.
 * 연간 달성률 = 올해 누적 매출 ÷ 기준, 월 달성률 = 월평균 매출 ÷ (기준÷12). 월 달성률 100% 이상이면 이 속도면 연말에 기준을 넘는다.
 */

const won = (n: number) => n.toLocaleString("ko-KR");
function eokMan(n: number): string {
  const sign = n < 0 ? "-" : "";
  const man = Math.round(Math.abs(n) / 1e4);
  if (man >= 1e4) { const eok = Math.floor(man / 1e4), rest = man % 1e4; return `${sign}${eok}억${rest > 0 ? ` ${rest.toLocaleString("ko-KR")}만` : ""}`; }
  return `${sign}${man.toLocaleString("ko-KR")}만`;
}

type Filter = "all" | "danger" | "warn" | "safe" | "unknown" | "nodata";
const FILTERS: { key: Filter; label: string; desc: string }[] = [
  { key: "all", label: "전체", desc: "" },
  { key: "danger", label: "위험", desc: "월 달성률 100% 이상 · 이 속도면 연말에 기준 초과" },
  { key: "warn", label: "주의", desc: "월 달성률 80~100%" },
  { key: "safe", label: "여유", desc: "월 달성률 80% 미만" },
  { key: "unknown", label: "그룹 미지정", desc: "업종 그룹을 추정하지 못한 개인사업자 · 직접 지정하세요" },
  { key: "nodata", label: "자료 없음", desc: "세모리포트 매출 자료가 없는 곳 · 매입매출 수집 필요" },
];

function level(r: InsightRow): Filter {
  if (r.clientType === "corporate") return "safe";
  if (!r.hasLedger) return "nodata";
  if (!r.group) return "unknown";
  if (r.paceRate == null) return "nodata";
  if (r.paceRate >= 100) return "danger";
  if (r.paceRate >= 80) return "warn";
  return "safe";
}
// 헤더 정렬 — 클릭: 기본 방향 → 반대 방향 → 해제(위험순). null은 방향과 무관하게 맨 아래
type SortKey = "biz" | "group" | "ytd" | "proj" | "annual" | "pace" | "prev" | "margin" | "fee";
type SortDir = "asc" | "desc";
type Column = { key: string; label: string; align: "left" | "right" | "center"; sort?: SortKey; defaultDir?: SortDir; title?: string };
const GROUP_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };
function sortValue(r: InsightRow & { fee: number | null }, key: SortKey): number | string | null {
  switch (key) {
    case "biz": { const t = [r.bizCategory, r.bizItem].filter(Boolean).join(" / "); return t || null; }
    case "group": return r.group ? GROUP_ORDER[r.group] : null;
    case "ytd": return r.hasLedger ? r.ytdSale : null;
    case "proj": return r.projectedSale ?? r.avgSale;
    case "annual": return r.annualRate;
    case "pace": return r.paceRate;
    case "prev": return r.saleDeltaPct;
    case "margin": return r.hasLedger ? r.profit : null;
    case "fee": return r.fee;
  }
}

const LEVEL_COLOR: Record<Filter, string> = { all: "#8B95A1", danger: "#DC2626", warn: "#F59E0B", safe: "#10B981", unknown: "#8B95A1", nodata: "#D1D6DB" };

function RateBar({ pct, color }: { pct: number | null; color: string }) {
  if (pct == null) return <span className="text-[#B0B8C1]">-</span>;
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-[64px] overflow-hidden rounded-full bg-[#F2F4F6]">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <b className="w-[46px] text-right tabular-nums text-[12px]" style={{ color }}>{pct.toFixed(1)}%</b>
    </div>
  );
}

export function InsightsTable({ data, canEdit }: { data: InsightsData; canEdit: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [onlyIndiv, setOnlyIndiv] = useState(true);
  const [groups, setGroups] = useState<Record<number, SincereGroup | null>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [, startTransition] = useTransition();

  // 그룹을 바꾸면 달성률도 즉시 다시 계산 (서버 저장은 백그라운드)
  const rows = useMemo(() => data.rows.map(r => {
    const g = r.id in groups ? groups[r.id] : (r.groupSource === "set" ? r.group : null);
    const group = g ?? (r.groupSource === "guess" ? r.group : null);
    if (group === r.group) return r;
    const threshold = group ? SINCERE_GROUPS[group].threshold : null;
    const isIndiv = r.clientType !== "corporate";
    return {
      ...r, group, groupSource: g ? "set" as const : (group ? "guess" as const : null), threshold,
      annualRate: isIndiv && threshold && r.hasLedger ? Math.round((r.ytdSale / threshold) * 1000) / 10 : null,
      paceRate: isIndiv && threshold && r.avgSale != null ? Math.round((r.avgSale / (threshold / 12)) * 1000) / 10 : null,
    };
  }), [data.rows, groups]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, danger: 0, warn: 0, safe: 0, unknown: 0, nodata: 0 };
    for (const r of rows) { if (onlyIndiv && r.clientType === "corporate") continue; c.all++; c[level(r)]++; }
    return c;
  }, [rows, onlyIndiv]);

  // 예상 조정료 = 연말 추정 매출(없으면 누적 매출)을 조정 보수표에 적용 (개인·법인 표 구분)
  const visible = useMemo(() => {
    const list = rows
      .filter(r => (!onlyIndiv || r.clientType !== "corporate") && (filter === "all" || level(r) === filter) && (!q || r.name.includes(q) || (r.assignedUser ?? "").includes(q)))
      .map(r => ({ ...r, fee: r.hasLedger ? calcAdjustmentFee(r.projectedSale ?? r.ytdSale, r.clientType) : null }));
    const order: Record<Filter, number> = { danger: 0, warn: 1, safe: 2, unknown: 3, nodata: 4, all: 5 };
    if (!sort) {
      return list.sort((a, b) => {
        const la = order[level(a)], lb = order[level(b)];
        if (la !== lb) return la - lb;
        return (b.paceRate ?? -1) - (a.paceRate ?? -1);
      });
    }
    const { key, dir } = sort;
    const m = dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const va = sortValue(a, key), vb = sortValue(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb), "ko") * m;
      return (va - vb) * m;
    });
  }, [rows, filter, q, onlyIndiv, sort]);

  const feeTotal = useMemo(() => visible.reduce((acc, r) => (r.fee != null ? { sum: acc.sum + r.fee, n: acc.n + 1 } : acc), { sum: 0, n: 0 }), [visible]);

  function clickSort(col: Column) {
    if (!col.sort) return;
    const def = col.defaultDir ?? "desc";
    setSort(prev => {
      if (!prev || prev.key !== col.sort) return { key: col.sort!, dir: def };
      if (prev.dir === def) return { key: col.sort!, dir: def === "asc" ? "desc" : "asc" };
      return null;
    });
  }

  function changeGroup(r: InsightRow, v: string) {
    if (!canEdit) return;
    const g = (v === "A" || v === "B" || v === "C") ? v : null;
    setGroups(prev => ({ ...prev, [r.id]: g }));
    startTransition(async () => {
      try { await setSincereGroup(r.id, g); } catch (e) { notify(e instanceof Error ? e.message : "저장 실패"); }
    });
  }

  const through = `${parseInt(data.throughMonth.slice(5, 7))}월`;
  const columns: Column[] = [
    { key: "name", label: "거래처", align: "left" },
    { key: "biz", label: "업종", align: "center", sort: "biz", defaultDir: "asc" },
    { key: "group", label: "그룹 · 기준", align: "center", sort: "group", defaultDir: "asc", title: "A → B → C 순으로 묶어 보기" },
    { key: "ytd", label: `1~${through} 누적 매출`, align: "right", sort: "ytd" },
    { key: "proj", label: "월평균 · 연말 추정", align: "right", sort: "proj" },
    { key: "annual", label: "연간 달성률", align: "center", sort: "annual" },
    { key: "pace", label: "월 달성률", align: "center", sort: "pace" },
    { key: "prev", label: "전년 동기", align: "right", sort: "prev" },
    { key: "margin", label: "손익 · 이익률", align: "right", sort: "margin", title: "손익 금액 기준 정렬" },
    { key: "fee", label: "예상 조정료", align: "right", sort: "fee", title: "연말 추정 매출을 조정 보수표(개인·법인)에 적용한 금액 · 공급가액" },
    { key: "docs", label: "자료", align: "center" },
  ];

  return (
    <div className="space-y-4">
      <section className="glass rounded-3xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#8B95A1]">Client insights</div>
            <h1 className="mt-0.5 text-[20px] font-extrabold tracking-tight text-[#191F28]">성실신고확인대상 달성률</h1>
            <div className="mt-1 text-[12.5px] text-[#6B7684]">
              {data.year}년 1~{through} 누적 매출(세모리포트 공급가액) 기준 · <b className="text-[#191F28]">월 달성률</b> = 월평균 매출 ÷ (기준 ÷ 12), 100%를 넘으면 이 속도로는 연말에 기준을 넘어요
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {(Object.keys(SINCERE_GROUPS) as SincereGroup[]).map(k => (
              <span key={k} className="rounded-lg bg-[#F2F4F6] px-2 py-1 text-[#4E5968]"><b className="text-[#191F28]">{k}</b> {SINCERE_GROUPS[k].label} · <b>{eokMan(SINCERE_GROUPS[k].threshold)}원</b></span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTERS.map(f => {
            const on = filter === f.key;
            const n = counts[f.key];
            return (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} title={f.desc}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors ${on ? "border-[#191F28] bg-[#191F28] text-white" : "border-[#E5E8EB] bg-white/80 text-[#4E5968] hover:bg-[#F2F4F6]"}`}>
                {f.key !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[f.key] }} />}
                {f.label}<span className={`tabular-nums ${on ? "text-white/70" : "text-[#8B95A1]"}`}>{n}</span>
              </button>
            );
          })}
          <label className="ml-2 inline-flex items-center gap-1.5 text-[12px] text-[#4E5968]">
            <input type="checkbox" checked={onlyIndiv} onChange={e => setOnlyIndiv(e.target.checked)} className="accent-[#3182F6]" />개인사업자만
          </label>
          <div className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#F5E8FF] px-3 text-[12px] text-[#6B21A8]" title="지금 표시 중인 거래처의 예상 조정료 합계 (필터·검색 반영, 공급가액)">
            예상 조정료 합계 <b className="tabular-nums text-[#7C3AED]">{won(feeTotal.sum)}원</b>
            <span className="text-[#A78BFA]">· {feeTotal.n}곳</span>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="거래처·담당 검색" className="ml-auto h-8 w-[200px] rounded-lg border border-[#E5E8EB] bg-white/80 px-3 text-[12.5px] outline-none focus:border-[#3182F6]" />
        </div>
      </section>

      <section className="glass overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-white/60">
                {columns.map(col => {
                  const active = !!col.sort && sort?.key === col.sort;
                  return (
                    <th key={col.key} className={`px-3 py-2.5 text-[11px] font-bold whitespace-nowrap ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${active ? "text-[#191F28]" : "text-[#8B95A1]"}`}>
                      {col.sort ? (
                        <button type="button" onClick={() => clickSort(col)} title={col.title ?? "클릭: 정렬 · 다시 클릭: 반대 방향 · 한 번 더: 해제"}
                          className={`inline-flex items-center gap-1 rounded-md px-1 -mx-1 transition-colors hover:bg-[#F2F4F6] hover:text-[#191F28] ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                          {col.label}
                          <span className={`text-[9px] leading-none ${active ? "text-[#3182F6]" : "text-[#D1D6DB]"}`}>{active ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </button>
                      ) : col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={11} className="py-12 text-center text-[13px] text-[#B0B8C1]">해당하는 거래처가 없어요</td></tr>
              )}
              {visible.map(r => {
                const lv = level(r);
                const color = LEVEL_COLOR[lv];
                return (
                  <tr key={r.id} className="border-t border-[#F2F4F6] hover:bg-white/60">
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <ClientLink clientId={r.id} className="text-[13px] font-bold text-[#191F28] hover:text-[#3182F6] hover:underline">{r.name}</ClientLink>
                        {r.clientType === "corporate" && <span className="rounded-md bg-[#F5E8FF] px-1.5 py-0.5 text-[10px] font-bold text-[#7C3AED]">법인</span>}
                      </div>
                      <div className="text-[11px] text-[#8B95A1]">{r.assignedUser ?? "-"}</div>
                    </td>
                    <td className="max-w-[170px] truncate px-3 py-2.5 border-t border-[#F2F4F6] text-[12px] text-[#4E5968]" title={[r.bizCategory, r.bizItem].filter(Boolean).join(" / ")}>
                      {[r.bizCategory, r.bizItem].filter(Boolean).join(" / ") || <span className="text-[#B0B8C1]">업태·종목 미입력</span>}
                      {r.bizType && <span className="ml-1 text-[10.5px] text-[#8B95A1]">({r.bizType})</span>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6]">
                      {r.clientType === "corporate" ? <span className="text-[12px] text-[#B0B8C1]">해당 없음</span> : (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <select
                            value={r.groupSource === "set" ? (r.group ?? "") : ""}
                            disabled={!canEdit}
                            onChange={e => changeGroup(r, e.target.value)}
                            className={`h-7 rounded-lg border px-1.5 text-[12px] font-bold ${r.groupSource === "set" ? "border-[#191F28] text-[#191F28]" : "border-[#E5E8EB] text-[#6B7684]"} bg-white disabled:opacity-60`}
                            title="성실신고 업종 그룹 (비우면 업태·업종코드로 자동 추정)"
                          >
                            <option value="">{r.group ? `자동 · ${r.group} ${SINCERE_GROUPS[r.group].short}` : "자동 · 추정 불가"}</option>
                            {(Object.keys(SINCERE_GROUPS) as SincereGroup[]).map(k => <option key={k} value={k}>{k} {SINCERE_GROUPS[k].short} · {eokMan(SINCERE_GROUPS[k].threshold)}</option>)}
                          </select>
                          {r.threshold && <span className="text-[11px] tabular-nums text-[#8B95A1]">{eokMan(r.threshold)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] text-right tabular-nums text-[12.5px] font-bold text-[#191F28] whitespace-nowrap">
                      {r.hasLedger ? `${won(r.ytdSale)}원` : <span className="font-medium text-[#B0B8C1]">자료 없음</span>}
                      {r.hasLedger && r.dataMonths < r.periodMonths && <div className="text-[10.5px] font-medium text-[#B45309]">{r.dataMonths}/{r.periodMonths}개월만 있음</div>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] text-right tabular-nums text-[12px] text-[#4E5968] whitespace-nowrap">
                      {r.avgSale == null ? "-" : <>월 {eokMan(r.avgSale)}<div className="text-[10.5px] text-[#8B95A1]">연말 추정 {eokMan(r.projectedSale ?? 0)}</div></>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6]"><RateBar pct={r.annualRate} color="#3182F6" /></td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6]"><RateBar pct={r.paceRate} color={lv === "danger" ? "#DC2626" : lv === "warn" ? "#F59E0B" : "#10B981"} /></td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] text-right tabular-nums text-[12px]">
                      {r.saleDeltaPct == null ? <span className="text-[#B0B8C1]">-</span> : <span className={`font-bold ${r.saleDeltaPct >= 0 ? "text-[#DC2626]" : "text-[#1B64DA]"}`}>{r.saleDeltaPct >= 0 ? "+" : ""}{r.saleDeltaPct}%</span>}
                      {r.prevSale != null && <div className="text-[10.5px] text-[#8B95A1]">작년 {eokMan(r.prevSale)}</div>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] text-right tabular-nums text-[12px] whitespace-nowrap">
                      {r.hasLedger ? <>
                        <span className={`font-bold ${r.profit < 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>{eokMan(r.profit)}</span>
                        <div className="text-[10.5px] text-[#8B95A1]">{r.marginPct != null ? `이익률 ${r.marginPct}%` : "이익률 -"}</div>
                      </> : <span className="text-[#B0B8C1]">-</span>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6] text-right tabular-nums text-[12px] whitespace-nowrap">
                      {r.fee == null ? <span className="text-[#B0B8C1]">-</span> : <>
                        <span className="font-bold text-[#7C3AED]">{won(r.fee)}원</span>
                        <div className="text-[10.5px] text-[#8B95A1]">{r.projectedSale != null ? "연말 추정" : "누적"} 기준</div>
                      </>}
                    </td>
                    <td className="px-3 py-2.5 border-t border-[#F2F4F6]">
                      <div className="flex items-center gap-1" title={`세모리포트 ${r.hasLedger ? "있음" : "없음"} · 급여대장 ${r.hasPayroll ? "있음" : "없음"}`}>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.hasLedger ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>세모</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.hasPayroll ? "bg-[#E8F3FF] text-[#1B64DA]" : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>급여</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11px] text-[#8B95A1]">
          그룹 기준: A 15억 · B 7.5억 · C 5억 (성실신고확인대상 업종별 수입금액). 자동 추정은 업태·종목·홈택스 업종코드 앞 두 자리로 판단하니, 애매한 거래처는 그룹을 직접 지정하세요. 손익 = 매출 − 매입 − 급여대장 인건비. 예상 조정료 = 연말 추정 매출 × 조정 보수표(개인·법인 구분, 공급가액 기준) — 신고 매출 확정 후 종소세 페이지에서 최종 확인.
        </div>
      </section>
    </div>
  );
}
