"use client";

// 상단 우측 '국세청 변동' 알림 버튼 — 매일 새벽 국세청 상태조회 결과가 우리 거래처 등록값과 다를 때 여기에 쌓인다.
// 항목마다 '반영'(등록값을 국세청 값으로 변경) / '확인'(닫기만) 처리. 관리자는 '지금 점검'으로 즉시 재조회.
import { useEffect, useRef, useState } from "react";
import { resolveNtsAlert } from "@/app/actions/nts";

type Alert = {
  id: number;
  kind: "taxType" | "status" | "unregistered" | string;
  before: string;
  after: string;
  afterCode: string | null;
  detail: string | null;
  detectedAt: string;
  client: { id: number; name: string; ceoName: string | null; clientType: string };
};

type LastCheck = { at: string; checked: number; created: number; autoResolved: number; skipped: number; error?: string } | null;

type Payload = { alerts: Alert[]; lastCheck: LastCheck; canCheck: boolean };

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  taxType: { label: "과세유형", cls: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]" },
  status: { label: "휴·폐업", cls: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]" },
  unregistered: { label: "미등록", cls: "bg-[#F9FAFB] text-[#6B7684] border-[#D1D6DB]" },
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd} ${hh}:${mi}`;
}

function canApply(a: Alert) {
  return a.kind === "taxType" || (a.kind === "status" && a.afterCode === "03");
}

export function NtsAlertBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refetch() {
    fetch("/api/nts/alerts")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: Payload) => setData(d))
      .catch(() => {});
  }

  useEffect(() => { refetch(); }, []);
  useEffect(() => { if (open) refetch(); }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function cancelClose() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  }

  async function handle(a: Alert, action: "apply" | "dismiss") {
    setBusyId(a.id);
    setMsg(null);
    try {
      await resolveNtsAlert(a.id, action);
      setData(d => (d ? { ...d, alerts: d.alerts.filter(x => x.id !== a.id) } : d));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function checkNow() {
    setChecking(true);
    setMsg(null);
    try {
      const r = await fetch("/api/nts/check", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "점검에 실패했습니다.");
      setMsg(`점검 완료 · ${j.checked}곳 조회 · 새 알림 ${j.created}건`);
      refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "점검에 실패했습니다.");
    } finally {
      setChecking(false);
    }
  }

  const alerts = data?.alerts ?? [];
  const count = alerts.length;

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition border border-[#E5E8EB]/70 bg-white/40 hover:bg-white/60 ${
          count > 0 ? "text-[#DC2626]" : "text-[#6B7684] hover:text-[#3182F6]"
        }`}
        title={count > 0 ? `국세청 변동 ${count}건` : "국세청 변동 알림"}
      >
        {/* 방패 + 체크: 국세청 등록정보 확인 */}
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
          {count > 0 ? <path d="M12 9v4M12 16.5h.01" /> : <path d="m9 12 2 2 4-4" />}
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#DC2626] text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(440px,calc(100vw-2rem))] max-h-[600px] overflow-y-auto glass-strong rounded-2xl shadow-2xl z-40 p-3">
          <div className="px-2 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-bold text-[#191F28]">국세청 변동</div>
              {count > 0 && (
                <span className="text-[11px] text-[#DC2626] font-bold bg-[#DC2626]/10 px-2 py-0.5 rounded-full">{count}건</span>
              )}
            </div>
            {data?.canCheck && (
              <button
                type="button"
                onClick={checkNow}
                disabled={checking}
                className="text-[11px] font-bold text-[#3182F6] hover:bg-[#3182F6]/10 px-2 py-1 rounded-lg transition disabled:opacity-50"
              >
                {checking ? "점검 중…" : "지금 점검"}
              </button>
            )}
          </div>
          <div className="px-2 pb-2 text-[11px] text-[#8B95A1]">
            {data?.lastCheck
              ? data.lastCheck.error
                ? <span className="text-[#DC2626]">마지막 점검 실패 · {fmtDateTime(data.lastCheck.at)} · {data.lastCheck.error}</span>
                : <>마지막 점검 {fmtDateTime(data.lastCheck.at)} · {data.lastCheck.checked}곳 조회{data.lastCheck.skipped > 0 ? ` · 번호 없음 ${data.lastCheck.skipped}곳` : ""}</>
              : "아직 점검한 적이 없습니다 (매일 새벽 자동 점검)"}
          </div>
          {msg && <div className="mx-2 mb-2 text-[11.5px] text-[#191F28] bg-white/70 rounded-lg px-3 py-2">{msg}</div>}
          <div className="h-px bg-white/40 mb-1" />

          {count === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-[#8B95A1]">
              국세청 등록정보와 모두 일치합니다
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {alerts.map(a => {
                const k = KIND_LABEL[a.kind] ?? KIND_LABEL.unregistered;
                const busy = busyId === a.id;
                return (
                  <li key={a.id} className="rounded-xl bg-white/60 hover:bg-white/80 transition px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center border rounded-md px-1.5 py-px text-[10.5px] font-bold ${k.cls}`}>{k.label}</span>
                          <a href={`/clients?q=${encodeURIComponent(a.client.name)}`} className="text-[13px] font-bold text-[#191F28] hover:text-[#3182F6] truncate">
                            {a.client.name}
                          </a>
                          {a.client.ceoName && <span className="text-[11px] text-[#8B95A1]">{a.client.ceoName}</span>}
                        </div>
                        <div className="mt-1 text-[12px] text-[#4E5968]">
                          {a.kind === "unregistered" ? (
                            <>등록된 번호 <span className="font-semibold tabular-nums">{a.before}</span>가 국세청에 없습니다</>
                          ) : (
                            <>
                              <span className="text-[#8B95A1]">{a.before}</span>
                              <span className="mx-1.5 text-[#B0B8C1]">→</span>
                              <span className="font-bold text-[#191F28]">{a.after}</span>
                            </>
                          )}
                          {a.detail && <span className="ml-1.5 text-[11px] text-[#8B95A1]">· {a.detail}</span>}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-[#B0B8C1]">{fmtDateTime(a.detectedAt)} 감지</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canApply(a) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handle(a, "apply")}
                            title={a.kind === "status" ? "거래처 과세유형을 '폐업'으로 변경 (계약 해지는 별도)" : "거래처 과세유형을 국세청 값으로 변경"}
                            className="text-[11px] font-bold text-white bg-[#3182F6] hover:bg-[#1B64DA] px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                          >
                            반영
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handle(a, "dismiss")}
                          title="확인만 하고 닫기 (같은 내용은 다시 알리지 않음)"
                          className="text-[11px] font-bold text-[#6B7684] hover:text-[#191F28] bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-[#E5E8EB] transition disabled:opacity-50"
                        >
                          확인
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
