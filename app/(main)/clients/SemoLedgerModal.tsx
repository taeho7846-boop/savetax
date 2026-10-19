"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEMO_LEDGER_PAGE, type SemoLedgerRun } from "@/lib/semo-ledger";

/**
 * 세모리포트 '고객 매입매출장' 월별 매입매출 자동 수집.
 * 크롬 확장(content-semoreport.js)이 세모리포트 JSON을 읽어 /api/semo-ledger/import 로 보낸다.
 * 이 화면은 (1) 확장 확인 → (2) 세모리포트 화면을 최소화 창으로 열기 → (3) 진행 상태를 2초마다 조회.
 */

type Status = {
  run: SemoLedgerRun | null;
  stored: { clients: number; months: { yearMonth: string; clients: number }[]; latestCollectedAt: string | null };
};

// 확장 프로그램 다리: content-savetax-app.js 가 window.postMessage 로 응답 (없으면 null)
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

export function SemoLedgerCollectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#0F9D77] text-[#0B7A5C] text-sm px-4 py-2 rounded-lg hover:bg-[#0F9D77] hover:text-white transition-colors flex items-center gap-1.5"
        title="세모리포트 고객 매입매출장 월별 요약을 자동으로 가져옵니다"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
        </svg>
        매입매출 수집
      </button>
      {open && <SemoLedgerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SemoLedgerModal({ onClose }: { onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([thisYear, thisYear - 1]);
  const [status, setStatus] = useState<Status | null>(null);
  const [launching, setLaunching] = useState(false);
  const [watching, setWatching] = useState(false);   // 수집 시작 후 진행 상태 추적 중
  const [error, setError] = useState<string | null>(null);
  const launchedAt = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/semo-ledger/import", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as Status;
      setStatus(data);
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 진행 추적: 시작 뒤 run.startedAt 이 갱신되고 finishedAt 이 찍힐 때까지 2초마다 조회 (최대 5분)
  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const s = await load();
      const run = s?.run;
      const started = run ? new Date(run.startedAt).getTime() : 0;
      const fresh = started >= launchedAt.current - 5000;
      if (fresh && run?.finishedAt) { setWatching(false); return; }
      if (Date.now() - launchedAt.current > 5 * 60 * 1000) {
        setWatching(false);
        setError(fresh ? "5분이 지나도 끝나지 않았습니다. 세모리포트 창이 열려 있는지 확인하세요." : "세모리포트 창에서 수집이 시작되지 않았습니다. 세모리포트 로그인 상태와 확장 프로그램을 확인하세요.");
        return;
      }
      timer.current = setTimeout(tick, 2000);
    };
    timer.current = setTimeout(tick, 1500);
    return () => { stopped = true; if (timer.current) clearTimeout(timer.current); };
  }, [watching, load]);

  async function start() {
    if (years.length === 0) { setError("연도를 하나 이상 고르세요"); return; }
    setError(null);
    setLaunching(true);
    try {
      const ping = await extCall<{ ok: boolean; version?: string }>("ping", {}, 1500);
      if (!ping?.ok) {
        setError("SaveTax 크롬 확장 프로그램이 필요합니다. 확장을 설치·업데이트(4.59 이상)한 뒤 다시 시도하세요.");
        return;
      }
      const url = `${SEMO_LEDGER_PAGE}#autoSemoLedger=1&years=${years.join(",")}&origin=${encodeURIComponent(window.location.origin)}`;
      launchedAt.current = Date.now();
      const res = await extCall("open-hidden", { urls: [url] });
      if (!res?.ok) {
        // 숨긴 창을 못 열면 새 탭으로 (확장 content script 는 그대로 동작)
        const w = window.open(url, "_blank");
        if (!w) { setError("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해주세요."); return; }
      }
      setWatching(true);
    } finally {
      setLaunching(false);
    }
  }

  const run = status?.run ?? null;
  const runFresh = run ? new Date(run.startedAt).getTime() >= launchedAt.current - 5000 : false;
  const inProgress = watching;
  const pct = run && run.total > 0 ? Math.min(100, Math.round((run.done / run.total) * 100)) : 0;
  const months = status?.stored.months ?? [];

  return (
    <div className="fixed inset-0 bg-[#191F28]/25 backdrop-blur-[3px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-strong rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F2F4F6]">
          <div>
            <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">SEMO REPORT</div>
            <h2 className="text-lg font-bold text-[#191F28] mt-0.5">월별 매입매출 수집</h2>
          </div>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 설정 + 시작 */}
          <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
            <div className="text-[13px] text-[#4E5968] leading-relaxed">
              세모리포트 <b>고객 분석 &gt; 고객 매입매출장</b>의 월별 요약(매출·매입 건수, 합계, 공급가액, 세액, 증빙 유형별 내역)을
              거래처 전체에 대해 자동으로 읽어와 사업자번호로 매칭해 저장합니다. 거래처의 업종코드·업태가 비어 있으면 세모리포트 값으로 채웁니다.
              크롬에 세모리포트가 로그인돼 있어야 합니다.
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-[#6B7684] mr-1">수집 연도</span>
              {[thisYear, thisYear - 1, thisYear - 2].map(y => {
                const on = years.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={inProgress}
                    onClick={() => setYears(prev => on ? prev.filter(v => v !== y) : [...prev, y].sort((a, b) => b - a))}
                    className={`px-3 py-1.5 rounded-lg text-[12.5px] font-bold border transition-colors ${
                      on ? "bg-[#0F9D77] border-[#0F9D77] text-white" : "bg-white border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"
                    } disabled:opacity-60`}
                  >
                    {y}년
                  </button>
                );
              })}
              <button
                type="button"
                onClick={start}
                disabled={launching || inProgress}
                className="ml-auto bg-[#0F9D77] hover:bg-[#0B7A5C] text-white text-[13px] font-bold px-5 py-2 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {inProgress ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />수집 중…</>
                ) : launching ? "여는 중…" : "수집 시작"}
              </button>
            </div>
            {error && <div className="mt-3 text-[12.5px] text-[#DC2626] bg-[#FEF2F2] rounded-lg px-3 py-2">{error}</div>}
          </div>

          {/* 진행 상태 */}
          {run && (runFresh || !inProgress) && (
            <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-bold text-[#191F28]">
                  {inProgress ? "진행 중" : run.finishedAt ? "마지막 수집" : "이전 수집 (미완료)"}
                  <span className="ml-2 text-[11.5px] font-medium text-[#8B95A1]">
                    {fmtTime(run.startedAt)}{run.finishedAt ? ` ~ ${fmtTime(run.finishedAt)}` : ""} · {run.years.join(", ")}년
                  </span>
                </div>
                <div className="text-[12px] font-bold tabular-nums text-[#0B7A5C]">{run.done} / {run.total}곳</div>
              </div>
              <div className="mt-2.5 h-2 w-full rounded-full bg-[#191F28]/[.06] overflow-hidden">
                <div className="h-full bg-[#0F9D77] transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="매칭 저장" value={run.matched} tone="text-[#0B7A5C]" />
                <Stat label="월 데이터" value={run.rows} tone="text-[#3182F6]" />
                <Stat label="미매칭" value={run.unmatched.length} tone={run.unmatched.length ? "text-[#DC2626]" : "text-[#8B95A1]"} />
              </div>
              {run.error && <div className="mt-3 text-[12px] text-[#B45309] bg-[#FFFBEB] rounded-lg px-3 py-2">{run.error}</div>}
              {run.unmatched.length > 0 && (
                <details className="mt-3">
                  <summary className="text-[12px] font-bold text-[#6B7684] cursor-pointer">
                    미매칭 {run.unmatched.length}곳 — 세모리포트에는 있지만 내 범위 거래처에서 사업자번호를 못 찾음
                  </summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto text-[12px] text-[#4E5968] space-y-0.5">
                    {run.unmatched.map((u, i) => (
                      <li key={i} className="flex justify-between gap-3 px-2 py-1 rounded hover:bg-[#F9FAFB]">
                        <span className="truncate">{u.name}</span>
                        <span className="tabular-nums text-[#8B95A1] shrink-0">{u.bizNo.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* 저장 현황 */}
          <div className="rounded-2xl border border-[#E5E8EB] bg-white/70 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-bold text-[#191F28]">저장된 데이터</div>
              <div className="text-[11.5px] text-[#8B95A1]">
                거래처 {status?.stored.clients ?? 0}곳 · 최근 수집 {fmtTime(status?.stored.latestCollectedAt)}
              </div>
            </div>
            {months.length === 0 ? (
              <div className="mt-3 text-[12.5px] text-[#B0B8C1]">아직 수집된 월별 데이터가 없어요</div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {months.map(m => (
                  <span key={m.yearMonth} className="text-[11px] px-2 py-1 rounded-md bg-[#F2F4F6] text-[#4E5968] tabular-nums">
                    {m.yearMonth} <b className="text-[#191F28]">{m.clients}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
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
