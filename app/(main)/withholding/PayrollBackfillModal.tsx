"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PayrollBackfillRun } from "@/lib/payroll-types";

/**
 * 과거 인건비 일괄 수집 — 위하고 '월별급상여수당지급현황'(SWSA0105)을 거래처·연도별로 최소화 창에서 차례로 열어
 * 직원×월 지급액·공제액을 받아 PayrollMonth 에 채운다. (크롬 확장 content-wehago-payroll-year.js + /api/payroll/backfill)
 * 진행 상태는 서버(AppConfig)에 있어서 이 창을 닫았다 다시 열어도 이어서 보인다.
 */

type ClientLite = {
  id: number;
  name: string;
  laborTypes: string | null;
  wehagoCno: string | null;
  wehagoCdCom: string | null;
  wehagoColors: string | null;
};

const WEHAGO_BASE = "https://smarta.wehago.com/#/smarta/humanresource";

function extCall<T = { ok: boolean; error?: string }>(type: string, payload?: Record<string, unknown>, timeoutMs = 4000): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(null); return; }
    const id = `app${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "savetax-ext" || d.id !== id) return;
      window.removeEventListener("message", onMsg); clearTimeout(t);
      resolve(d as T);
    };
    const t = setTimeout(() => { window.removeEventListener("message", onMsg); resolve(null); }, timeoutMs);
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "savetax-app", id, type, payload: payload || {} }, "*");
  });
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PayrollBackfillButton({ clients, wehagoCompanyId, wehagoTaxNum }: { clients: ClientLite[]; wehagoCompanyId: string; wehagoTaxNum: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="위하고 월별급상여수당지급현황을 거래처마다 자동 조회해 과거 월별 인건비(직원별 세전·세후)를 채웁니다"
        className="text-xs px-3 py-1.5 rounded-lg font-medium border border-[#C4B5FD] text-[#6D28D9] bg-[#F5F3FF] hover:bg-[#EDE9FE]"
      >
        과거 인건비 일괄 수집
      </button>
      {open && <PayrollBackfillModal clients={clients} wehagoCompanyId={wehagoCompanyId} wehagoTaxNum={wehagoTaxNum} onClose={() => setOpen(false)} />}
    </>
  );
}

function PayrollBackfillModal({ clients, wehagoCompanyId, wehagoTaxNum, onClose }: { clients: ClientLite[]; wehagoCompanyId: string; wehagoTaxNum: string; onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([thisYear - 1, thisYear]);
  const [onlySalary, setOnlySalary] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [limit, setLimit] = useState<number | null>(null); // 시험 실행: 앞에서 N곳만
  const [run, setRun] = useState<PayrollBackfillRun | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targets = useMemo(() => {
    const list = clients.filter(c => c.wehagoCno && c.wehagoCdCom && (!onlySalary || (c.laborTypes ?? "").includes("근로소득")));
    return limit ? list.slice(0, limit) : list;
  }, [clients, onlySalary, limit]);
  const noWehago = useMemo(() => clients.filter(c => !c.wehagoCno || !c.wehagoCdCom).length, [clients]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll/backfill", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { run: PayrollBackfillRun | null };
      setRun(data.run);
      return data.run;
    } catch { return null; }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 진행 중이면 2초마다 갱신 (서버 상태 기준이라 창을 닫았다 열어도 이어짐)
  const inProgress = !!run && !run.finishedAt;
  useEffect(() => {
    if (!inProgress) return;
    let stopped = false;
    const tick = async () => { if (stopped) return; await load(); timer.current = setTimeout(tick, 2000); };
    timer.current = setTimeout(tick, 2000);
    return () => { stopped = true; if (timer.current) clearTimeout(timer.current); };
  }, [inProgress, load]);

  function buildUrl(c: ClientLite, year: number) {
    const color = (() => { try { const m = JSON.parse(c.wehagoColors || "{}"); return m[String(year)] || "#D0BA00"; } catch { return "#D0BA00"; } })();
    const q = [
      "sao", `cno=${c.wehagoCno}`, `cd_com=${c.wehagoCdCom}`, "gisu=1", `yminsa=${year}`, `searchData=${year}0101${year}1231`,
      `color=${color}`, `companyName=${encodeURIComponent(c.name)}`, `companyID=${wehagoCompanyId}`, `taxNum=${wehagoTaxNum}`, "yn_private=1", "wehagoT",
      "stPayrollYear=1", `clientId=${c.id}`, `origin=${encodeURIComponent(window.location.origin)}`, `overwrite=${overwrite ? 1 : 0}`,
    ].join("&");
    return `${WEHAGO_BASE}/SWSA0105?${q}`;
  }

  async function start() {
    if (years.length === 0) { setError("연도를 하나 이상 고르세요"); return; }
    if (targets.length === 0) { setError("대상 거래처가 없습니다 (위하고 연동정보가 있는 거래처만 가능)"); return; }
    if (!wehagoCompanyId) { setError("설정에 위하고 아이디(companyID)가 없습니다"); return; }
    setError(null);
    setLaunching(true);
    try {
      const ping = await extCall<{ ok: boolean; version?: string }>("ping", {}, 1500);
      if (!ping?.ok) { setError("SaveTax 크롬 확장 프로그램이 필요합니다. 확장을 4.60 이상으로 업데이트한 뒤 다시 시도하세요."); return; }
      const v = parseFloat(ping.version || "0");
      if (v < 4.6) { setError(`확장 프로그램 버전이 낮습니다 (${ping.version}). chrome://extensions 에서 새로고침해 4.60 이상으로 올려주세요.`); return; }

      const urls: string[] = [];
      for (const c of targets) for (const y of [...years].sort()) urls.push(buildUrl(c, y));
      const res = await fetch("/api/payroll/backfill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "start", total: urls.length, years: years.map(String) }),
      });
      if (!res.ok) { setError("시작 기록에 실패했습니다"); return; }
      await load();
      const opened = await extCall("open-hidden", { urls, sequential: true });
      if (!opened?.ok) { setError("확장이 위하고 창을 열지 못했습니다: " + (opened?.error ?? "응답 없음")); await stop(); }
    } finally {
      setLaunching(false);
    }
  }

  async function stop() {
    await fetch("/api/payroll/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase: "finish" }) });
    await load();
  }

  const pct = run && run.total > 0 ? Math.min(100, Math.round((run.done / run.total) * 100)) : 0;
  const estMin = Math.ceil((targets.length * years.length * 12) / 60);

  return (
    <div className="fixed inset-0 bg-[#191F28]/25 backdrop-blur-[3px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-strong rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F2F4F6]">
          <div>
            <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">Payroll backfill</div>
            <h2 className="text-lg font-bold text-[#191F28] mt-0.5">과거 인건비 일괄 수집</h2>
          </div>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
            <div className="text-[13px] text-[#4E5968] leading-relaxed">
              위하고 <b>급여관리 &gt; 월별급상여수당지급현황</b>을 거래처마다 최소화 창으로 열어 조회하고, 직원별 월 지급액(세전)·공제액을 받아
              인건비(근로소득)에 채웁니다. 거래처 한 곳의 1년치가 10초 안팎이고, 끝날 때까지 크롬을 켜 두면 됩니다. 이미 있는 달은 기본으로 건너뜁니다.
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-[#6B7684] mr-1">연도</span>
              {[thisYear - 2, thisYear - 1, thisYear].map(y => {
                const on = years.includes(y);
                return (
                  <button key={y} type="button" disabled={inProgress}
                    onClick={() => setYears(prev => on ? prev.filter(v => v !== y) : [...prev, y].sort())}
                    className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border transition-colors ${on ? "bg-[#6D28D9] border-[#6D28D9] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"} disabled:opacity-60`}>
                    {y}년
                  </button>
                );
              })}
              <span className="text-[12px] font-bold text-[#6B7684] ml-3 mr-1">대상</span>
              {[{ v: 3, l: "시험 3곳" }, { v: 20, l: "20곳" }, { v: null, l: "전체" }].map(o => (
                <button key={String(o.v)} type="button" disabled={inProgress} onClick={() => setLimit(o.v)}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border transition-colors ${limit === o.v ? "bg-[#191F28] border-[#191F28] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"} disabled:opacity-60`}>
                  {o.l}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#4E5968]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={onlySalary} disabled={inProgress} onChange={e => setOnlySalary(e.target.checked)} className="accent-[#6D28D9]" />
                인건비 유형에 근로소득이 있는 거래처만
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer" title="켜면 이미 저장된 달도 위하고 값으로 덮어씁니다 (엑셀로 받은 지급 항목 내역은 사라짐)">
                <input type="checkbox" checked={overwrite} disabled={inProgress} onChange={e => setOverwrite(e.target.checked)} className="accent-[#DC2626]" />
                이미 있는 달도 덮어쓰기
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-[12px] text-[#6B7684]">
                대상 <b className="text-[#191F28]">{targets.length}곳</b> × {years.length}년 = {targets.length * years.length}페이지 · 약 {estMin}분
                {noWehago > 0 && <span className="ml-2 text-[#B45309]">위하고 연동정보 없음 {noWehago}곳 제외</span>}
              </div>
              {inProgress ? (
                <button type="button" onClick={stop} className="text-[12.5px] font-bold px-4 py-2 rounded-xl border border-[#FECACA] text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2]">
                  중단 표시 (열린 창은 끝까지 진행)
                </button>
              ) : (
                <button type="button" onClick={start} disabled={launching}
                  className="bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-[13px] font-bold px-5 py-2 rounded-xl transition-colors disabled:opacity-60">
                  {launching ? "여는 중…" : "수집 시작"}
                </button>
              )}
            </div>
            {error && <div className="mt-3 text-[12.5px] text-[#DC2626] bg-[#FEF2F2] rounded-lg px-3 py-2">{error}</div>}
          </div>

          {run && (
            <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-bold text-[#191F28]">
                  {inProgress ? "진행 중" : "마지막 수집"}
                  <span className="ml-2 text-[11.5px] font-medium text-[#8B95A1]">
                    {fmtTime(run.startedAt)}{run.finishedAt ? ` ~ ${fmtTime(run.finishedAt)}` : ""} · {run.years.join(", ")}년
                  </span>
                </div>
                <div className="text-[12px] font-bold tabular-nums text-[#6D28D9]">{run.done} / {run.total}페이지</div>
              </div>
              <div className="mt-2.5 h-2 w-full rounded-full bg-[#191F28]/[.06] overflow-hidden">
                <div className="h-full bg-[#6D28D9] transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="저장한 달" value={run.saved} tone="text-[#6D28D9]" />
                <Stat label="이미 있어 건너뜀" value={run.skipped} tone="text-[#8B95A1]" />
                <Stat label="실패" value={run.failed.length} tone={run.failed.length ? "text-[#DC2626]" : "text-[#8B95A1]"} />
              </div>
              {run.failed.length > 0 && (
                <details className="mt-3" open={!inProgress}>
                  <summary className="text-[12px] font-bold text-[#6B7684] cursor-pointer">실패 {run.failed.length}건</summary>
                  <ul className="mt-2 max-h-44 overflow-y-auto text-[12px] text-[#4E5968] space-y-0.5">
                    {run.failed.map((f, i) => (
                      <li key={i} className="flex justify-between gap-3 px-2 py-1 rounded hover:bg-[#F9FAFB]">
                        <span className="truncate"><b className="text-[#191F28]">{f.name}</b> {f.year}년</span>
                        <span className="text-[#DC2626] shrink-0 truncate max-w-[60%]" title={f.error}>{f.error}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-[#F9FAFB] py-2">
      <div className={`text-[18px] font-bold tabular-nums leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-[#8B95A1]">{label}</div>
    </div>
  );
}
