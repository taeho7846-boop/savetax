"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notify, askConfirm } from "@/components/ui/Dialog";
import { addMonths } from "@/lib/bookkeeping";
import { STEPS, ALERT_KINDS, type Schedule } from "@/lib/autobook-shared";
import {
  enqueueAutobook, cancelAutobookJob, resolveAutobookAlert, saveAutobookSetting, issueAgentToken, saveAgentSchedule,
  type AutobookSettingInput,
} from "@/app/actions/autobook";

// staffMonths: 과세기간 중 급여(근로소득)가 있는 달 "YYYY-MM" — 거래한 달이 여기 있으면 직원 있음(811), 없으면 812
export type AbSetting = AutobookSettingInput & { staffMonths: string[]; configured: boolean; industry: string; memo: string };
const monthsText = (ms: string[]) => ms.map(m => parseInt(m.slice(5, 7))).join("·") + "월";
export type AbClient = {
  id: number; name: string; corporate: boolean; industry: string; assignedUserName: string | null;
  hasCno: boolean; hasDrive: boolean; setting: AbSetting;
};
export type AbJob = {
  id: number; clientId: number; userId: number; yearMonth: string; mode: string; status: string; step: string | null;
  steps: Record<string, string>; summary: { sent?: number; total?: number; amount?: number; items?: { label: string; n: number; amount: number }[] } | null;
  message: string | null; log: { at: string; text: string }[]; reportName: string | null; reportLink: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
};
export type AbAlert = { id: number; jobId: number; clientId: number; kind: string; date: string | null; trade: string | null; amount: number | null; note: string };
type Agent = { connected: boolean; online: boolean; lastSeenAt: string | null; machine: string | null; version: string | null; wehagoLoggedIn: boolean; schedule: Schedule } | null;

const STATUS: Record<string, { label: string; chip: string }> = {
  queued:    { label: "예약됨", chip: "bg-[#E8F3FF] text-[#1B64DA]" },
  collected: { label: "수집 끝 · 처리 대기", chip: "bg-[#E8F3FF] text-[#1B64DA]" },
  running:   { label: "진행 중", chip: "bg-[#3182F6] text-white" },
  done:      { label: "완료", chip: "bg-[#E7F7EE] text-[#15803D]" },
  stopped:   { label: "멈춤", chip: "bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]" },
  canceled:  { label: "취소", chip: "bg-[#F2F4F6] text-[#8B95A1]" },
};
const ACTIVE = new Set(["queued", "collected", "running"]);
const won = (n?: number | null) => (n == null ? "" : n.toLocaleString());
const mLabel = (ym: string) => `${parseInt(ym.slice(5, 7))}월`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const ago = (iso: string | null) => {
  if (!iso) return "신호 없음";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

export function AutobookBoard({ clients, jobs, alerts, focus, currentYM, readonly, agent }: {
  clients: AbClient[]; jobs: AbJob[]; alerts: AbAlert[]; focus: string; currentYM: string; readonly: boolean; agent: Agent;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"month" | "matrix" | "alerts">("month");
  const [kpi, setKpi] = useState<"all" | "active" | "done" | "stopped" | "alerts" | "none">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [tokenShown, setTokenShown] = useState<string | null>(null);

  // 거래처별 그 달 마지막 예약
  const jobOf = useMemo(() => {
    const m = new Map<string, AbJob>();
    for (const j of jobs) m.set(`${j.clientId}|${j.yearMonth}`, j); // id 오름차순이라 마지막이 최신
    return m;
  }, [jobs]);
  const alertsOf = useMemo(() => {
    const m = new Map<number, AbAlert[]>();
    for (const a of alerts) m.set(a.clientId, [...(m.get(a.clientId) ?? []), a]);
    return m;
  }, [alerts]);
  const cur = (c: AbClient) => jobOf.get(`${c.id}|${focus}`);

  const base = useMemo(() => clients.filter(c => q === "" || c.name.includes(q)), [clients, q]);
  const counts = useMemo(() => {
    const st = (c: AbClient) => cur(c)?.status;
    return {
      total: base.length, noCno: base.filter(c => !c.hasCno).length,
      active: base.filter(c => ACTIVE.has(st(c) ?? "")).length,
      running: base.filter(c => st(c) === "running"),
      done: base.filter(c => st(c) === "done").length,
      stopped: base.filter(c => st(c) === "stopped").length,
      alerts: base.reduce((n, c) => n + (alertsOf.get(c.id)?.length ?? 0), 0),
      none: base.filter(c => !st(c) || st(c) === "canceled").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, jobOf, alertsOf, focus]);
  const rows = useMemo(() => base.filter(c => {
    const s = cur(c)?.status;
    switch (kpi) {
      case "active": return ACTIVE.has(s ?? "");
      case "done": return s === "done";
      case "stopped": return s === "stopped";
      case "alerts": return (alertsOf.get(c.id)?.length ?? 0) > 0;
      case "none": return !s || s === "canceled";
      default: return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, kpi, jobOf, alertsOf, focus]);
  const selectable = rows.filter(c => c.hasCno && !ACTIVE.has(cur(c)?.status ?? ""));
  const allChecked = selectable.length > 0 && selectable.every(c => selected.has(c.id));
  const open = clients.find(c => c.id === openId) ?? null;

  function run(mode: "schedule" | "now") {
    const ids = [...selected];
    if (!ids.length) return;
    startTransition(async () => {
      if (!agent?.connected && !(await askConfirm({ title: "실행기가 아직 연결되지 않았어요", message: "예약은 되지만, 내 컴퓨터에 자동기장 실행기를 연결해야 실제로 처리됩니다. 예약할까요?" }))) return;
      if (mode === "now" && !(await askConfirm(`지금 바로 ${ids.length}곳을 실행할까요?\n근무시간에는 같은 위하고 아이디로 쓰던 화면이 끊길 수 있어요 (시험용).`))) return;
      try {
        const r = await enqueueAutobook(ids, mode);
        notify(`${r.queued}곳 예약${r.skippedBusy ? ` · 이미 예약된 ${r.skippedBusy}곳 제외` : ""}${r.skippedNoCno ? ` · 위하고 미연동 ${r.skippedNoCno}곳 제외` : ""}`, { type: "success" });
        setSelected(new Set());
        router.refresh();
      } catch { notify("예약하지 못했습니다", { type: "error" }); }
    });
  }

  const kpis = [
    { key: "all", label: "대상 거래처", value: counts.total, sub: counts.noCno ? `위하고 미연동 ${counts.noCno}` : "위하고 연동 전부", color: "#191F28" },
    { key: "active", label: "예약 · 진행 중", value: counts.active, sub: counts.running[0] ? `${counts.running[0].name} 진행 중` : "시간표대로 처리", color: "#3182F6" },
    { key: "done", label: "완료", value: counts.done, sub: `${mLabel(focus)} 처리분`, color: "#16A865" },
    { key: "stopped", label: "멈춤", value: counts.stopped, sub: "사유 확인 후 다시 예약", color: "#DC2626" },
    { key: "alerts", label: "대표님 확인 필요", value: counts.alerts, sub: "중복전표 · 고정자산 · 100만원↑", color: "#B45309" },
    { key: "none", label: "아직 안 돌림", value: counts.none, sub: "체크해서 예약", color: "#8B95A1" },
  ] as const;

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* 머리말 */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#191F28]">AI자동기장</h1>
          <p className="text-[12.5px] text-[#4E5968] mt-0.5">체크한 거래처를 <b>내 컴퓨터의 자동기장 실행기</b>가 위하고에서 처리합니다 · 수집 → 세금계산서 → 계산서 → 카드 → 현금영수증 → 보고서</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AgentBadge agent={agent} onConnect={() => startTransition(async () => {
            if (agent?.connected && !(await askConfirm("실행기 연결 코드를 새로 만들까요? 이전 코드는 더 이상 쓸 수 없습니다."))) return;
            try { const r = await issueAgentToken(); setTokenShown(r.token); router.refresh(); } catch { notify("연결 코드를 만들지 못했습니다", { type: "error" }); }
          })} readonly={readonly} />
          <div className="flex items-center gap-1 glass-strong rounded-2xl px-1 h-10">
            <button onClick={() => router.push(`/autobook?focus=${addMonths(focus, -1)}`)} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm">◀</button>
            <span className="text-[13px] font-bold text-[#191F28] min-w-[100px] text-center">{focus.slice(0, 4)}.{focus.slice(5)} 처리분</span>
            <button onClick={() => router.push(`/autobook?focus=${addMonths(focus, 1)}`)} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm">▶</button>
            {focus !== currentYM && <button onClick={() => router.push(`/autobook`)} className="ml-1 text-[11px] font-bold text-[#3182F6] px-2 h-7 rounded-lg hover:bg-white/60">이번 달</button>}
          </div>
        </div>
      </div>

      {tokenShown && <TokenModal token={tokenShown} onClose={() => setTokenShown(null)} />}

      {/* KPI */}
      <div className="grid gap-2.5 mb-3 grid-cols-3 lg:grid-cols-6">
        {kpis.map(k => (
          <button key={k.key} onClick={() => setKpi(kpi === k.key ? "all" : k.key)}
            className={`glass rounded-2xl px-4 py-3 relative overflow-hidden text-left transition-all ${kpi === k.key && k.key !== "all" ? "ring-2 ring-[#191F28]/80" : "hover:-translate-y-px"}`}>
            <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r" style={{ background: k.color }} />
            <div className="flex items-baseline justify-between gap-2 pl-2">
              <span className="text-[11px] font-bold text-[#8B95A1] whitespace-nowrap">{k.label}</span>
              <span className="text-[20px] font-extrabold leading-none tabular-nums" style={{ color: k.color }}>{k.value}<span className="text-[11px] text-[#6B7684] font-bold ml-0.5">{k.key === "alerts" ? "건" : "곳"}</span></span>
            </div>
            <div className="text-[10px] text-[#8B95A1] mt-1.5 pl-2 truncate">{k.sub}</div>
          </button>
        ))}
      </div>

      {/* 탭 + 검색 */}
      <div className="glass rounded-3xl p-2 mb-3 flex items-center gap-2 flex-wrap">
        {([["month", `${mLabel(focus)} 처리`], ["matrix", "월별 현황"], ["alerts", `확인 필요 ${alerts.length}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-9 px-4 rounded-2xl text-[12.5px] font-bold ${tab === k ? "bg-[#191F28] text-white" : "text-[#6B7684] hover:text-[#191F28]"}`}>{l}</button>
        ))}
        <div className="flex-1 min-w-[180px] bg-white/80 rounded-2xl flex items-center gap-2 px-4 h-9 ml-auto max-w-[320px]">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="거래처 검색" className="flex-1 bg-transparent outline-none text-[13px]" />
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="glass rounded-3xl overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="overflow-auto flex-1 min-h-0">
            {tab === "month" && (
              <table className="w-full text-[12.5px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-white/95">
                  <tr className="text-[11.5px] text-[#8B95A1]">
                    <th className="px-3 py-2.5 w-9 border-b border-[#E5E8EB]">
                      {!readonly && <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map(c => c.id)))} className="w-4 h-4 accent-[#3182F6]" />}
                    </th>
                    <th className="text-left px-2 py-2.5 border-b border-[#E5E8EB]">거래처 <span className="font-normal">{rows.length}곳</span></th>
                    {SETTING_COLS.map(h => <th key={h} className="text-left px-2 py-2.5 border-b border-[#E5E8EB] bg-[#F9FAFB] whitespace-nowrap" title="거래처를 누르면 오른쪽에서 바꿀 수 있습니다">{h}</th>)}
                    <th className="text-left px-2 py-2.5 border-b border-[#E5E8EB]">진행 ({STEPS.map(s => s.label).join("·")})</th>
                    <th className="text-right px-2 py-2.5 border-b border-[#E5E8EB]">전송</th>
                    <th className="text-left px-2 py-2.5 border-b border-[#E5E8EB]">확인 필요</th>
                    <th className="text-left px-3 py-2.5 border-b border-[#E5E8EB]">보고서</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(c => {
                    const j = cur(c); const al = alertsOf.get(c.id) ?? [];
                    const canPick = c.hasCno && !ACTIVE.has(j?.status ?? "");
                    return (
                      <tr key={c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)} className={`cursor-pointer ${openId === c.id ? "bg-[#F4F8FF]" : selected.has(c.id) ? "bg-[#F9FBFF]" : "hover:bg-white/60"}`}>
                        <td className="px-3 py-2.5 border-b border-[#F2F4F6]" onClick={e => e.stopPropagation()}>
                          {!readonly && <input type="checkbox" disabled={!canPick} checked={selected.has(c.id)} onChange={() => setSelected(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="w-4 h-4 accent-[#3182F6] disabled:opacity-30" />}
                        </td>
                        <td className="px-2 py-2.5 border-b border-[#F2F4F6]">
                          <div className="font-bold text-[#191F28]">{c.name}</div>
                          <div className="text-[11px] text-[#8B95A1]">{c.assignedUserName ?? "미지정"} · {c.corporate ? "법인" : "개인"}</div>
                        </td>
                        <SettingCells c={c} />
                        <td className="px-2 py-2.5 border-b border-[#F2F4F6]"><Steps j={j} /></td>
                        <td className="px-2 py-2.5 border-b border-[#F2F4F6] text-right tabular-nums whitespace-nowrap">
                          {j?.summary?.sent != null ? <>{won(j.summary.sent)}건<div className="text-[11px] text-[#8B95A1]">{won(j.summary.amount)}</div></> : <span className="text-[#C4CCD4]">-</span>}
                        </td>
                        <td className="px-2 py-2.5 border-b border-[#F2F4F6]">
                          {al.length ? Object.entries(al.reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + 1 }), {})).map(([k, n]) => (
                            <span key={k} className={`inline-block text-[11px] font-bold rounded-md px-1.5 py-0.5 mr-1 mb-0.5 ${k === "duplicate" || k === "cardRegister" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#FFFBEB] text-[#B45309]"}`}>{ALERT_KINDS[k] ?? k} {n}</span>
                          )) : <span className="text-[#C4CCD4]">-</span>}
                        </td>
                        <td className="px-3 py-2.5 border-b border-[#F2F4F6]" onClick={e => e.stopPropagation()}>
                          {j?.reportLink ? <a href={j.reportLink} target="_blank" rel="noreferrer" className="text-[11.5px] font-bold text-[#DC2626] bg-[#FEF2F2] rounded-md px-2 py-1">PDF</a> : <span className="text-[#C4CCD4]">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6 + SETTING_COLS.length} className="text-center py-16 text-[#8B95A1]">해당하는 거래처가 없습니다</td></tr>}
                </tbody>
              </table>
            )}

            {tab === "matrix" && <Matrix clients={base} jobOf={jobOf} focus={focus} onPick={m => router.push(`/autobook?focus=${m}`)} />}

            {tab === "alerts" && <AlertList clients={clients} alerts={alerts} readonly={readonly} onResolve={id => startTransition(async () => { await resolveAutobookAlert(id); router.refresh(); })} />}
          </div>

          {/* 실행 바 */}
          {selected.size > 0 && !readonly && (
            <div className="flex items-center gap-3 px-4 h-12 bg-[#191F28] text-white text-[12.5px] shrink-0">
              <span className="font-bold">선택 {selected.size}곳</span>
              <span className="text-white/60 hidden md:inline">수집을 먼저 한 번에 끝내고 거래처별로 처리 · 한 곳이 멈춰도 다음으로 넘어감</span>
              <button disabled={pending} onClick={() => run("schedule")} className="ml-auto h-8 px-4 rounded-lg bg-[#3182F6] font-bold hover:bg-[#1B64DA] disabled:opacity-50">🌙 자동 실행 예약</button>
              <button disabled={pending} onClick={() => run("now")} className="h-8 px-3 rounded-lg bg-white/10 font-bold hover:bg-white/20 disabled:opacity-50" title="근무시간엔 같은 위하고 아이디 화면이 끊길 수 있어 시험용">지금 실행(시험)</button>
              <button onClick={() => setSelected(new Set())} className="text-white/60 hover:text-white">해제</button>
            </div>
          )}
        </div>

        {open && <SidePanel c={open} job={cur(open)} alerts={alertsOf.get(open.id) ?? []} readonly={readonly} onClose={() => setOpenId(null)}
          onCancel={id => startTransition(async () => { if (await askConfirm("이 예약을 취소할까요? 진행 중이면 지금 단계가 끝나는 대로 멈춥니다.")) { await cancelAutobookJob(id); router.refresh(); } })}
          onResolve={id => startTransition(async () => { await resolveAutobookAlert(id); router.refresh(); })}
          onSave={(input) => startTransition(async () => { try { await saveAutobookSetting(open.id, input); notify("설정을 저장했습니다", { type: "success" }); router.refresh(); } catch { notify("저장하지 못했습니다", { type: "error" }); } })} />}
      </div>

      <ScheduleCard agent={agent} readonly={readonly} onSave={s => startTransition(async () => { try { await saveAgentSchedule(s); notify("시간표를 저장했습니다", { type: "success" }); router.refresh(); } catch (e) { notify(e instanceof Error && e.message.includes("실행기") ? e.message : "시간이 맞지 않습니다", { type: "error" }); } })} />
    </div>
  );
}

function AgentBadge({ agent, onConnect, readonly }: { agent: Agent; onConnect: () => void; readonly: boolean }) {
  const color = !agent ? "#C4CCD4" : agent.online ? (agent.wehagoLoggedIn ? "#16A865" : "#F59E0B") : "#DC2626";
  const title = !agent ? "내 컴퓨터 실행기 연결 안 됨" : agent.online ? (agent.wehagoLoggedIn ? "내 컴퓨터 실행기 연결됨" : "실행기 켜짐 · 위하고 로그인 필요") : "실행기 꺼짐";
  const sub = !agent ? "연결하면 체크한 거래처를 이 컴퓨터가 처리합니다" : `${agent.machine ?? "PC"} · 마지막 신호 ${ago(agent.lastSeenAt)}${agent.online && !agent.wehagoLoggedIn ? " · 퇴근 전 전용 Chrome에서 위하고 로그인" : ""}${!agent.online ? " · 밤에 PC를 켜 두세요" : ""}`;
  return (
    <div className="glass-strong rounded-2xl px-3.5 h-12 flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="leading-tight"><div className="text-[12.5px] font-bold text-[#191F28]">{title}</div><div className="text-[10.5px] text-[#8B95A1] max-w-[300px] truncate">{sub}</div></div>
      {!readonly && <button onClick={onConnect} className="ml-1 h-7 px-2.5 rounded-lg text-[11.5px] font-bold text-[#3182F6] bg-[#E8F3FF] hover:bg-[#D6E8FF]">{agent ? "다시 연결" : "실행기 연결"}</button>}
    </div>
  );
}

function TokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 max-w-[520px] w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-[16px] font-extrabold text-[#191F28] mb-1">내 컴퓨터 실행기 연결 코드</div>
        <div className="text-[12.5px] text-[#4E5968] mb-3">이 코드는 <b>지금 한 번만</b> 보입니다. 자동기장 실행기 설치 때 붙여넣으세요. 잃어버리면 '다시 연결'로 새로 만들면 됩니다.</div>
        <div className="flex gap-2">
          <code className="flex-1 bg-[#F2F4F6] rounded-xl px-3 py-2.5 text-[12px] break-all select-all">{token}</code>
          <button onClick={() => { navigator.clipboard.writeText(token); notify("복사했습니다", { type: "success" }); }} className="h-10 px-3 rounded-xl bg-[#3182F6] text-white text-[12.5px] font-bold shrink-0">복사</button>
        </div>
        <ol className="mt-4 text-[12px] text-[#4E5968] list-decimal pl-5 space-y-1">
          <li>자동기장 실행기 설치 파일을 실행하고 이 코드를 붙여넣습니다.</li>
          <li>뜨는 자동기장 전용 Chrome에서 위하고에 로그인합니다 (퇴근 전 한 번).</li>
          <li>PC 절전 모드를 끄고 켜 둡니다. 이 화면 오른쪽 위가 초록 점이면 준비 끝.</li>
        </ol>
        <button onClick={onClose} className="mt-5 w-full h-10 rounded-xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[13px]">닫기</button>
      </div>
    </div>
  );
}

// 설정 열(업종·직원·차량 부가세·의제매입·마트·식자재) — 항목마다 칸을 나눠 한눈에 비교. 아직 저장 안 한 거래처는 기본값을 흐리게 보여준다
const SETTING_COLS = ["업종", "직원", "차량 부가세", "의제매입", "마트·식자재"] as const;
const settingTd = "px-2 py-2.5 border-b border-[#F2F4F6] bg-[#F9FAFB]/60 whitespace-nowrap";

function SettingCells({ c }: { c: AbClient }) {
  if (!c.hasCno) return (
    <td colSpan={SETTING_COLS.length} className={settingTd}>
      <span className="text-[11px] font-bold text-[#DC2626] bg-[#FEF2F2] rounded-md px-1.5 py-0.5">위하고 미연동 · 원천세 탭 [연동 수집] 후 사용 가능</span>
    </td>
  );
  const s = c.setting;
  const dim = s.configured ? "" : "opacity-60";
  const pill = (on: boolean, onText: string, offText: string, onCls: string) =>
    <span className={`inline-block text-[11px] font-bold rounded-md px-1.5 py-0.5 ${on ? onCls : "bg-[#F2F4F6] text-[#8B95A1]"}`}>{on ? onText : offText}</span>;
  return (
    <>
      <td className={settingTd}>
        <span className={`text-[12px] text-[#333D4B] ${dim}`} title={c.industry}>{c.industry ? (c.industry.length > 10 ? c.industry.slice(0, 10) + "…" : c.industry) : <span className="text-[#C4CCD4]">-</span>}</span>
        {!s.configured && <div className="text-[10px] font-bold text-[#B45309]">설정 전 · 기본값</div>}
      </td>
      <td className={settingTd}>
        {s.staffMonths.length
          ? <span className="inline-block text-[11px] font-bold rounded-md px-1.5 py-0.5 bg-[#E7F7EE] text-[#15803D]" title="이 달에 거래한 건은 직원 있음(811 복리후생비), 나머지 달은 812 여비교통비">{monthsText(s.staffMonths)} 있음</span>
          : <span className="inline-block text-[11px] font-bold rounded-md px-1.5 py-0.5 bg-[#F2F4F6] text-[#8B95A1]" title="이번 과세기간 급여 자료 없음 → 음식·카페 812 여비교통비">없음</span>}
      </td>
      <td className={settingTd}><span className={dim}>{pill(s.vehicleDeduct, "공제", "불공제", "bg-[#E8F3FF] text-[#1B64DA]")}</span></td>
      <td className={settingTd}><span className={dim}>{pill(s.deemedPurchase, "대상", "아님", "bg-[#F5F3FF] text-[#6D28D9]")}</span></td>
      <td className={settingTd}><span className={`text-[12px] font-bold text-[#333D4B] ${dim}`}>{s.foodAccount === "146" ? "146 상품" : "830 소모품비"}</span></td>
    </>
  );
}

function Steps({ j }: { j?: AbJob }) {
  if (!j || j.status === "canceled") return <span className="text-[11px] text-[#C4CCD4]">{j ? "취소됨" : "-"}</span>;
  const cls = (st?: string) => st === "ok" ? "bg-[#16A865]" : st === "run" ? "bg-[#3182F6] animate-pulse" : st === "stop" ? "bg-[#DC2626]" : st === "skip" ? "bg-[repeating-linear-gradient(45deg,#E5E8EB,#E5E8EB_3px,#fff_3px,#fff_6px)]" : "bg-[#E5E8EB]";
  const st = STATUS[j.status] ?? STATUS.queued;
  const when = j.status === "done" && j.finishedAt ? ` · ${md(j.finishedAt)} ${hm(j.finishedAt)}` : "";
  return (
    <div>
      <div className="flex gap-[3px]">{STEPS.map(s => <span key={s.key} title={s.label} className={`w-6 h-1.5 rounded ${cls(j.steps[s.key])}`} />)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10.5px]">
        <span className={`font-bold rounded px-1.5 py-px ${st.chip}`}>{st.label}</span>
        <span className={j.status === "stopped" ? "text-[#DC2626]" : "text-[#8B95A1]"}>{j.status === "stopped" ? j.message : j.status === "running" ? (STEPS.find(s => s.key === j.step)?.label ?? "") + (j.message ? ` · ${j.message}` : "") : j.mode === "now" && ACTIVE.has(j.status) ? "바로 실행" : ""}{when}</span>
      </div>
    </div>
  );
}

function SidePanel({ c, job, alerts, readonly, onClose, onCancel, onResolve, onSave }: {
  c: AbClient; job?: AbJob; alerts: AbAlert[]; readonly: boolean; onClose: () => void;
  onCancel: (id: number) => void; onResolve: (id: number) => void; onSave: (s: AutobookSettingInput) => void;
}) {
  const [s, setS] = useState<AutobookSettingInput>({ vehicleDeduct: c.setting.vehicleDeduct, deemedPurchase: c.setting.deemedPurchase, foodAccount: c.setting.foodAccount, industry: c.setting.industry, memo: c.setting.memo });
  const Tog = <T extends string | boolean>({ value, opts, on }: { value: T; opts: [T, string][]; on: (v: T) => void }) => (
    <span className="inline-flex bg-[#F2F4F6] rounded-lg p-0.5">{opts.map(([v, l]) => <button key={String(v)} disabled={readonly} onClick={() => on(v)} className={`px-2.5 h-6 rounded-md text-[11.5px] font-bold ${value === v ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1]"}`}>{l}</button>)}</span>
  );
  const row = "flex items-center justify-between py-2 border-b border-dashed border-[#EEF0F2] text-[12.5px]";
  return (
    <div className="glass rounded-3xl w-[380px] shrink-0 overflow-auto p-4">
      <div className="flex items-start justify-between">
        <div><div className="text-[16px] font-extrabold text-[#191F28]">{c.name}</div><div className="text-[11px] text-[#8B95A1]">{c.assignedUserName ?? "미지정"} · {c.corporate ? "법인" : "개인"}{!c.hasDrive && " · 드라이브 미연결(보고서 저장 안 됨)"}</div></div>
        <button onClick={onClose} className="text-[#8B95A1] hover:text-[#191F28] text-lg leading-none">×</button>
      </div>

      {job && ACTIVE.has(job.status) && !readonly && (
        <button onClick={() => onCancel(job.id)} className="mt-3 w-full h-8 rounded-xl bg-[#FEF2F2] text-[#DC2626] text-[12px] font-bold">예약 취소</button>
      )}

      <div className="mt-4 text-[12.5px] font-bold text-[#4E5968] mb-1">자동기장 설정</div>
      <div className={row}>업종 <input disabled={readonly} value={s.industry ?? ""} onChange={e => setS({ ...s, industry: e.target.value })} placeholder={c.industry || "종목"} className="w-[170px] h-7 rounded-lg border border-[#E5E8EB] px-2 text-[12px] text-right outline-none" /></div>
      <div className={row}>직원 <span className="text-[12px] font-bold text-[#333D4B]">{c.setting.staffMonths.length ? `${monthsText(c.setting.staffMonths)} 급여 있음` : "급여 자료 없음"}</span></div>
      <div className="text-[10.5px] text-[#8B95A1] -mt-1 mb-1">거래한 달마다 그 달 근로소득 급여가 있으면 음식·카페 811 복리후생비, 없으면 812 여비교통비 (자동, 바꿀 수 없음)</div>
      <div className={row}>차량 부가세 <Tog value={s.vehicleDeduct} opts={[[true, "공제"], [false, "불공제"]]} on={v => setS({ ...s, vehicleDeduct: v })} /></div>
      <div className={row}>의제매입 <Tog value={s.deemedPurchase} opts={[[true, "대상"], [false, "아님"]]} on={v => setS({ ...s, deemedPurchase: v })} /></div>
      <div className={row}>마트·식자재 <Tog value={s.foodAccount} opts={[["146", "146 상품"], ["830", "830 소모품비"]]} on={v => setS({ ...s, foodAccount: v })} /></div>
      <textarea disabled={readonly} value={s.memo ?? ""} onChange={e => setS({ ...s, memo: e.target.value })} placeholder="메모 (예: 손님에게 음료·과자 판매)" className="mt-2 w-full h-14 rounded-xl border border-[#E5E8EB] p-2 text-[12px] outline-none resize-none" />
      {!readonly && <button onClick={() => onSave(s)} className="mt-2 w-full h-9 rounded-xl bg-[#191F28] text-white text-[12.5px] font-bold">설정 저장</button>}

      <div className="mt-5 text-[12.5px] font-bold text-[#4E5968] mb-1.5">대표님 확인 필요 {alerts.length ? alerts.length : ""}</div>
      {alerts.length === 0 && <div className="text-[12px] text-[#8B95A1]">없음</div>}
      {alerts.map(a => (
        <div key={a.id} className={`rounded-xl p-2.5 mb-1.5 text-[12px] border ${a.kind === "duplicate" || a.kind === "cardRegister" ? "border-[#FECACA] bg-[#FFF7F7]" : "border-[#FDE68A] bg-[#FFFCF2]"}`}>
          <b className={a.kind === "duplicate" || a.kind === "cardRegister" ? "text-[#DC2626]" : "text-[#B45309]"}>{ALERT_KINDS[a.kind] ?? a.kind}</b> {a.trade} {a.date} {a.amount != null && `${won(a.amount)}원`}
          <div className="text-[#4E5968] mt-0.5">{a.note}</div>
          {!readonly && <button onClick={() => onResolve(a.id)} className="mt-1.5 h-6 px-2 rounded-md bg-white border border-[#E5E8EB] text-[11px] font-bold text-[#4E5968]">확인 완료</button>}
        </div>
      ))}

      <div className="mt-5 text-[12.5px] font-bold text-[#4E5968] mb-1.5">실행 기록</div>
      {!job && <div className="text-[12px] text-[#8B95A1]">이번 달 실행 없음</div>}
      {job && (
        <div className="text-[11.5px] text-[#4E5968] leading-relaxed">
          {job.log.slice().reverse().slice(0, 30).map((l, i) => <div key={i}><span className="text-[#8B95A1] tabular-nums mr-1.5">{md(l.at)} {hm(l.at)}</span>{l.text}</div>)}
          {job.reportLink && <a href={job.reportLink} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[11.5px] font-bold text-[#DC2626] bg-[#FEF2F2] rounded-md px-2 py-1">📄 {job.reportName}</a>}
        </div>
      )}
    </div>
  );
}

function Matrix({ clients, jobOf, focus, onPick }: { clients: AbClient[]; jobOf: Map<string, AbJob>; focus: string; onPick: (ym: string) => void }) {
  const year = focus.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  return (
    <table className="w-full text-[12px] border-separate border-spacing-0">
      <thead className="sticky top-0 bg-white/95 z-10">
        <tr><th className="text-left px-3 py-2.5 border-b border-[#E5E8EB] text-[#8B95A1] min-w-[180px]">거래처</th>
          {months.map(m => <th key={m} className={`px-1 py-2.5 border-b border-[#E5E8EB] ${m === focus ? "text-[#1B64DA]" : "text-[#8B95A1]"}`}><button onClick={() => onPick(m)} className="hover:underline">{mLabel(m)}</button></th>)}</tr>
      </thead>
      <tbody>
        {clients.map(c => (
          <tr key={c.id}><td className="px-3 py-2 border-b border-[#F2F4F6] font-bold text-[#191F28]">{c.name}</td>
            {months.map(m => {
              const j = jobOf.get(`${c.id}|${m}`);
              const st = j ? STATUS[j.status] : null;
              return <td key={m} className={`text-center px-1 py-2 border-b border-[#F2F4F6] ${m === focus ? "bg-[#E8F3FF]/40" : ""}`}>
                {st ? <span className="inline-flex flex-col items-center gap-0.5"><span className={`text-[10.5px] font-bold rounded px-1.5 py-px ${st.chip}`}>{st.label.split(" ")[0]}</span>{j?.reportLink && <a href={j.reportLink} target="_blank" rel="noreferrer" title={j.reportName ?? ""}>📄</a>}</span> : <span className="text-[#E5E8EB]">·</span>}
              </td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AlertList({ clients, alerts, readonly, onResolve }: { clients: AbClient[]; alerts: AbAlert[]; readonly: boolean; onResolve: (id: number) => void }) {
  const name = new Map(clients.map(c => [c.id, c.name]));
  if (!alerts.length) return <div className="text-center py-16 text-[#8B95A1]">확인할 항목이 없습니다</div>;
  return (
    <table className="w-full text-[12.5px] border-separate border-spacing-0">
      <thead className="sticky top-0 bg-white/95"><tr className="text-[11.5px] text-[#8B95A1]">
        {["거래처", "종류", "일자", "거래처(가맹점)", "금액", "내용", ""].map(h => <th key={h} className="text-left px-3 py-2.5 border-b border-[#E5E8EB]">{h}</th>)}
      </tr></thead>
      <tbody>{alerts.map(a => (
        <tr key={a.id}>
          <td className="px-3 py-2 border-b border-[#F2F4F6] font-bold">{name.get(a.clientId)}</td>
          <td className="px-3 py-2 border-b border-[#F2F4F6]"><span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 ${a.kind === "duplicate" || a.kind === "cardRegister" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#FFFBEB] text-[#B45309]"}`}>{ALERT_KINDS[a.kind] ?? a.kind}</span></td>
          <td className="px-3 py-2 border-b border-[#F2F4F6]">{a.date}</td>
          <td className="px-3 py-2 border-b border-[#F2F4F6]">{a.trade}</td>
          <td className="px-3 py-2 border-b border-[#F2F4F6] tabular-nums">{won(a.amount)}</td>
          <td className="px-3 py-2 border-b border-[#F2F4F6] text-[#4E5968]">{a.note}</td>
          <td className="px-3 py-2 border-b border-[#F2F4F6]">{!readonly && <button onClick={() => onResolve(a.id)} className="h-7 px-2.5 rounded-lg bg-white border border-[#E5E8EB] text-[11.5px] font-bold text-[#4E5968]">확인 완료</button>}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ScheduleCard({ agent, readonly, onSave }: { agent: Agent; readonly: boolean; onSave: (s: Schedule) => void }) {
  const [edit, setEdit] = useState(false);
  const [s, setS] = useState<Schedule>(agent?.schedule ?? { workFrom: "08:30", workTo: "18:30", collectStop: "23:30" });
  const bar = (parts: [number, string, string][]) => (
    <div className="flex h-6 rounded-lg overflow-hidden text-[10.5px] font-bold text-center leading-6">{parts.map(([f, bg, l], i) => <div key={i} style={{ flex: f }} className={`${bg} truncate px-1`}>{l}</div>)}</div>
  );
  const h = (t: string) => { const [a, b] = t.split(":").map(Number); return a + b / 60; };
  return (
    <div className="glass rounded-3xl p-4 mt-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-extrabold text-[#191F28]">자동 실행 시간표 <span className="text-[11px] font-normal text-[#8B95A1]">내 컴퓨터 기준 · 홈택스 자료수집은 00:00~06:00 불가 → 그 시간엔 수집이 끝난 거래처만 처리</span></div>
        {!readonly && agent && (edit
          ? <div className="flex items-center gap-1.5 text-[12px]">근무 <input type="time" value={s.workFrom} onChange={e => setS({ ...s, workFrom: e.target.value })} className="h-7 rounded-lg border border-[#E5E8EB] px-1" />~<input type="time" value={s.workTo} onChange={e => setS({ ...s, workTo: e.target.value })} className="h-7 rounded-lg border border-[#E5E8EB] px-1" /> 수집 마감 <input type="time" value={s.collectStop} onChange={e => setS({ ...s, collectStop: e.target.value })} className="h-7 rounded-lg border border-[#E5E8EB] px-1" />
              <button onClick={() => { onSave(s); setEdit(false); }} className="h-7 px-2.5 rounded-lg bg-[#3182F6] text-white font-bold">저장</button><button onClick={() => setEdit(false)} className="h-7 px-2 text-[#8B95A1]">취소</button></div>
          : <button onClick={() => setEdit(true)} className="h-7 px-2.5 rounded-lg bg-white border border-[#E5E8EB] text-[11.5px] font-bold text-[#4E5968]">시간 바꾸기</button>)}
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 items-center text-[12px]">
        <b>평일</b>
        {bar([
          [6, "bg-[#EDE9FE] text-[#6D28D9]", "00~06 처리만"],
          [h(s.workFrom) - 6, "bg-[#DCFCE7] text-[#15803D]", `06~${s.workFrom} 수집+처리`],
          [h(s.workTo) - h(s.workFrom), "bg-[#F2F4F6] text-[#8B95A1]", `${s.workFrom}~${s.workTo} 근무시간 · 안 돌림`],
          [h(s.collectStop) - h(s.workTo), "bg-[#DCFCE7] text-[#15803D]", `${s.workTo}~${s.collectStop} 수집 먼저 → 처리`],
          [24 - h(s.collectStop), "bg-[#EDE9FE] text-[#6D28D9]", "처리만"],
        ])}
        <b>주말·공휴일</b>
        {bar([[6, "bg-[#EDE9FE] text-[#6D28D9]", "00~06 처리만"], [h(s.collectStop) - 6, "bg-[#DCFCE7] text-[#15803D]", `06~${s.collectStop} 수집+처리 (종일)`], [24 - h(s.collectStop), "bg-[#EDE9FE] text-[#6D28D9]", "처리만"]])}
      </div>
    </div>
  );
}
