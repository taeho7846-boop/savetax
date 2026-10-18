"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBookkeepingStage, setBookkeepingMemo, setBookkeepingTargetDay, bulkSetBookkeepingStage, bulkCloseThrough } from "@/app/actions/bookkeeping";
import {
  STAGES, STAGE_ORDER, nextStage, prevStage, stageIndex, bookkeepingDeadline, isOverdue, daysUntilDeadline, addMonths,
  type BookkeepingStage,
} from "@/lib/bookkeeping";

type MonthState = { stage: string; memo: string | null; updatedAt: string };
type Client = {
  id: number;
  name: string;
  clientType: string;
  affiliation: string | null;
  accountingProgram: string;
  assignedUserName: string | null;
  subAssignedUserName: string | null;
  months: Record<string, MonthState>;
};

const STAGE_STYLE: Record<BookkeepingStage, { chip: string; dot: string; label: string }> = {
  none:      { chip: "bg-white/60 text-[#B0B8C1] border border-dashed border-[#D1D6DB]", dot: "#C4CCD4", label: "미시작" },
  requested: { chip: "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]", dot: "#F59E0B", label: "자료요청" },
  received:  { chip: "bg-[#EEF4FF] text-[#3B6FD6] border border-[#C7D7FE]", dot: "#6B8CFF", label: "자료수령" },
  input:     { chip: "bg-[#E8F3FF] text-[#1B64DA] border border-[#A3CAFD]", dot: "#3182F6", label: "입력" },
  done:      { chip: "bg-[#E7F7EE] text-[#15803D] border border-[#BBF7D0]", dot: "#16A865", label: "마감" },
};

const mLabel = (ym: string) => `${parseInt(ym.slice(5, 7))}월`;
const mdLabel = (d: string) => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`;

export function BookkeepingBoard({
  clients, months, focus, currentYM, today, targetDay, canEditTarget, readonly,
}: {
  clients: Client[];
  months: string[];
  year: number;
  focus: string;
  currentYM: string;
  today: string;
  targetDay: number;
  canEditTarget: boolean;
  readonly: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // 낙관적 로컬 상태 (서버 응답 전 즉시 반영)
  const [local, setLocal] = useState<Record<number, Record<string, MonthState>>>(() =>
    Object.fromEntries(clients.map(c => [c.id, c.months]))
  );
  useEffect(() => {
    setLocal(Object.fromEntries(clients.map(c => [c.id, c.months])));
  }, [clients]);

  const getState = (clientId: number, ym: string): MonthState =>
    local[clientId]?.[ym] ?? { stage: "none", memo: null, updatedAt: "" };

  // 필터
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [affFilter, setAffFilter] = useState<string[]>([]);
  const [affOpen, setAffOpen] = useState(false);
  const affRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const [stageFilter, setStageFilter] = useState<"all" | "notReceived" | "received" | "input" | "done" | "overdue">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStage, setBulkStage] = useState<BookkeepingStage>("received");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (affRef.current && !affRef.current.contains(e.target as Node)) setAffOpen(false);
      if (closeRef.current && !closeRef.current.contains(e.target as Node)) setCloseOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const userNames = useMemo(() => [...new Set(clients.map(c => c.assignedUserName ?? "미지정"))].sort(), [clients]);
  const affNames = useMemo(() => [...new Set(clients.map(c => c.affiliation ?? "미지정"))].sort(), [clients]);

  // 1차 필터(담당자·소속·검색) — KPI는 이 결과로 계산
  const base = useMemo(() => clients.filter(c =>
    (q === "" || c.name.includes(q)) &&
    (userFilter.length === 0 || userFilter.includes(c.assignedUserName ?? "미지정")) &&
    (affFilter.length === 0 || affFilter.includes(c.affiliation ?? "미지정"))
  ), [clients, q, userFilter, affFilter]);

  const focusStage = (c: Client) => getState(c.id, focus).stage as BookkeepingStage;
  const kpi = useMemo(() => {
    const total = base.length;
    const done = base.filter(c => focusStage(c) === "done").length;
    const notReceived = base.filter(c => stageIndex(focusStage(c)) < stageIndex("received")).length;
    const received = base.filter(c => focusStage(c) === "received").length;
    const input = base.filter(c => focusStage(c) === "input").length;
    const overdue = base.filter(c => isOverdue(focus, focusStage(c), targetDay, today)).length;
    return { total, done, notReceived, received, input, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, local, focus, targetDay, today]);

  // 2차 필터(기준월 단계)
  const rows = useMemo(() => base.filter(c => {
    const s = focusStage(c);
    switch (stageFilter) {
      case "notReceived": return stageIndex(s) < stageIndex("received");
      case "received": return s === "received";
      case "input": return s === "input";
      case "done": return s === "done";
      case "overdue": return isOverdue(focus, s, targetDay, today);
      default: return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, local, stageFilter, focus, targetDay, today]);

  // ---- 단계 변경 ----
  function applyStage(clientId: number, ym: string, stage: BookkeepingStage) {
    const prev = getState(clientId, ym);
    setLocal(l => ({ ...l, [clientId]: { ...(l[clientId] ?? {}), [ym]: { ...prev, stage, updatedAt: new Date().toISOString() } } }));
    startTransition(async () => {
      try { await setBookkeepingStage(clientId, ym, stage); }
      catch { setLocal(l => ({ ...l, [clientId]: { ...(l[clientId] ?? {}), [ym]: prev } })); }
    });
  }
  function applyMemo(clientId: number, ym: string, memo: string) {
    const prev = getState(clientId, ym);
    setLocal(l => ({ ...l, [clientId]: { ...(l[clientId] ?? {}), [ym]: { ...prev, memo: memo.trim() || null } } }));
    startTransition(async () => {
      try { await setBookkeepingMemo(clientId, ym, memo); }
      catch { setLocal(l => ({ ...l, [clientId]: { ...(l[clientId] ?? {}), [ym]: prev } })); }
    });
  }
  function applyBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}곳의 ${mLabel(focus)}분 단계를 '${STAGE_STYLE[bulkStage].label}'(으)로 바꿀까요?`)) return;
    ids.forEach(id => {
      const prev = getState(id, focus);
      setLocal(l => ({ ...l, [id]: { ...(l[id] ?? {}), [focus]: { ...prev, stage: bulkStage, updatedAt: new Date().toISOString() } } }));
    });
    startTransition(async () => {
      try { await bulkSetBookkeepingStage(ids, focus, bulkStage); setSelected(new Set()); }
      catch { router.refresh(); }
    });
  }

  // ---- 기간 일괄 마감 (예: 부가세 끝난 상반기 01~06월분) ----
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeThrough, setCloseThrough] = useState(focus);
  const [closing, setClosing] = useState(false);
  async function applyCloseThrough() {
    const ids = base.map(c => c.id);
    if (ids.length === 0) return;
    const fromYM = `${closeThrough.slice(0, 4)}-01`;
    const label = `${closeThrough.slice(0, 4)}년 1월분 ~ ${mLabel(closeThrough)}분`;
    if (!confirm(`표시된 ${ids.length}곳의 ${label}을 모두 '마감'으로 처리할까요?\n(되돌리려면 칸을 눌러 단계를 바꾸면 됩니다)`)) return;
    setClosing(true);
    try {
      const r = await bulkCloseThrough(ids, fromYM, closeThrough);
      setCloseOpen(false);
      router.refresh();
      alert(`${r.clients}곳 × ${r.months}개월 마감 처리 완료`);
    } catch { alert("일괄 마감 실패"); }
    finally { setClosing(false); }
  }

  // ---- 팝오버 ----
  const [pop, setPop] = useState<{ clientId: number; ym: string; x: number; y: number } | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pop) return;
    function onDown(e: MouseEvent) { if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setPop(null); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pop]);
  function openPop(e: React.MouseEvent, clientId: number, ym: string) {
    if (readonly) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popW = 300, popH = 330;
    const x = Math.min(r.left, window.innerWidth - popW - 12);
    const y = r.bottom + 6 + popH > window.innerHeight ? Math.max(8, r.top - popH - 6) : r.bottom + 6;
    setMemoDraft(getState(clientId, ym).memo ?? "");
    setPop({ clientId, ym, x, y });
  }

  // ---- 마감 목표일 ----
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState(String(targetDay));
  const [savingTarget, setSavingTarget] = useState(false);
  async function saveTarget() {
    const d = parseInt(targetDraft);
    if (!(d >= 1 && d <= 31)) return alert("1~31 사이 숫자를 입력하세요");
    setSavingTarget(true);
    try { await setBookkeepingTargetDay(d); setEditingTarget(false); router.refresh(); }
    catch { alert("저장 실패"); }
    finally { setSavingTarget(false); }
  }

  const deadline = bookkeepingDeadline(focus, targetDay);
  const dday = daysUntilDeadline(focus, targetDay, today);
  const doneRate = kpi.total ? Math.round((kpi.done / kpi.total) * 100) : 0;
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id));

  const kpiCards: { key: typeof stageFilter; label: string; value: number; color: string; sub?: string }[] = [
    { key: "done", label: "마감 완료", value: kpi.done, color: "#16A865", sub: `${doneRate}% · ${kpi.total}곳 중` },
    { key: "notReceived", label: "자료 미수령", value: kpi.notReceived, color: "#F59E0B", sub: "미시작 + 요청만 한 곳" },
    { key: "received", label: "입력 대기", value: kpi.received, color: "#3182F6", sub: "자료는 받았고 입력 전" },
    { key: "input", label: "마감 대기", value: kpi.input, color: "#8B5CF6", sub: "입력 끝, 마감(리포트) 전" },
    { key: "overdue", label: "기한 지남", value: kpi.overdue, color: "#DC2626", sub: `기한 ${mdLabel(deadline)} 경과 · 미마감` },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">BOOKKEEPING</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            월기장 보드
            <span className="text-[18px] font-bold text-[#3182F6]">{mLabel(focus)}분</span>
            <span className="text-[13px] text-[#6B7684] font-medium">{focus.slice(0, 4)}년</span>
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1 flex items-center gap-2 flex-wrap">
            <span>
              마감 기한 <b className="text-[#191F28]">{mdLabel(deadline)}</b>
              <span className={`ml-1.5 font-bold ${dday < 0 ? "text-[#DC2626]" : dday <= 3 ? "text-[#B45309]" : "text-[#15803D]"}`}>
                {dday < 0 ? `D+${-dday}` : dday === 0 ? "D-Day" : `D-${dday}`}
              </span>
            </span>
            <span className="text-[#D1D6DB]">·</span>
            {editingTarget ? (
              <span className="inline-flex items-center gap-1">
                마감 목표 매월
                <input
                  type="number" min={1} max={31} value={targetDraft}
                  onChange={e => setTargetDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveTarget(); if (e.key === "Escape") setEditingTarget(false); }}
                  className="w-12 h-6 text-center rounded-md border border-[#A3CAFD] bg-white text-[12px] font-bold text-[#191F28] outline-none"
                  autoFocus
                />
                일
                <button onClick={saveTarget} disabled={savingTarget} className="ml-1 text-[11px] font-bold text-white bg-[#3182F6] px-2 h-6 rounded-md disabled:opacity-50">저장</button>
                <button onClick={() => setEditingTarget(false)} className="text-[11px] text-[#8B95A1] px-1">취소</button>
              </span>
            ) : (
              <button
                onClick={() => canEditTarget && (setTargetDraft(String(targetDay)), setEditingTarget(true))}
                className={`inline-flex items-center gap-1 ${canEditTarget ? "hover:text-[#191F28] hover:underline" : "cursor-default"}`}
                title={canEditTarget ? "클릭해서 사무실 공통 마감 목표일 변경" : "마감 목표일은 대표/세무사가 변경"}
              >
                마감 목표 <b className="text-[#191F28]">매월 {targetDay}일</b>
                <span className="text-[#B0B8C1]">(N월분은 N+1월 {targetDay}일까지)</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        {!readonly && (
          <div className="relative" ref={closeRef}>
            <button
              onClick={() => { setCloseThrough(focus); setCloseOpen(o => !o); }}
              className="h-10 px-4 rounded-2xl text-[12.5px] font-bold glass-strong text-[#15803D] hover:bg-white transition flex items-center gap-1.5"
              title="부가세 신고가 끝난 기간처럼 이미 마무리된 달을 한 번에 마감 처리"
            >
              ✓ 기간 일괄 마감
            </button>
            {closeOpen && (
              <div className="absolute right-0 top-12 z-40 w-[280px] bg-white rounded-2xl shadow-2xl border border-[#E5E8EB] p-4">
                <div className="text-[13px] font-bold text-[#191F28] mb-1">기간 일괄 마감</div>
                <div className="text-[11px] text-[#6B7684] mb-3">표시된 <b className="text-[#191F28]">{base.length}곳</b>의 1월분부터 아래 달까지 전부 '마감'으로 바꿉니다. 담당자·소속 필터를 걸면 그 거래처만 적용됩니다.</div>
                <select value={closeThrough} onChange={e => setCloseThrough(e.target.value)} className="w-full h-9 mb-3 rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-2 text-[12.5px] font-bold text-[#191F28] outline-none">
                  {months.map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {mLabel(m)}분까지</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={applyCloseThrough} disabled={closing || base.length === 0} className="flex-1 h-9 rounded-xl bg-[#16A865] text-white text-[12.5px] font-bold hover:bg-[#15803D] disabled:opacity-40">{closing ? "처리 중..." : "마감 처리"}</button>
                  <button onClick={() => setCloseOpen(false)} className="h-9 px-3 rounded-xl bg-[#F2F4F6] text-[#4E5968] text-[12.5px] font-bold">취소</button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* 기준월 선택 */}
        <div className="flex items-center gap-1 glass-strong rounded-2xl px-1 h-10">
          <button onClick={() => router.push(`/bookkeeping?focus=${addMonths(focus, -1)}`)} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm">◀</button>
          <span className="text-[13px] font-bold text-[#191F28] min-w-[92px] text-center">{focus.slice(0, 4)}.{focus.slice(5)} 분</span>
          <button onClick={() => router.push(`/bookkeeping?focus=${addMonths(focus, 1)}`)} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm">▶</button>
          {focus !== addMonths(currentYM, -1) && (
            <button onClick={() => router.push(`/bookkeeping`)} className="ml-1 text-[11px] font-bold text-[#3182F6] px-2 h-7 rounded-lg hover:bg-white/60">전월분</button>
          )}
        </div>
        </div>
      </div>

      {/* KPI 5-up 한 줄 (클릭 = 기준월 단계 필터) */}
      <div className="grid grid-cols-5 gap-2.5 mb-4">
        {kpiCards.map(k => {
          const active = stageFilter === k.key;
          return (
            <button
              key={k.key}
              onClick={() => setStageFilter(active ? "all" : k.key)}
              className={`stat-card glass rounded-2xl px-4 py-3 relative overflow-hidden text-left transition-all ${active ? "ring-2 ring-[#191F28]/80" : "hover:-translate-y-px"}`}
            >
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r" style={{ background: k.color }} />
              <div className="flex items-baseline justify-between gap-2 pl-2">
                <span className="text-[11px] font-bold text-[#8B95A1] tracking-wide whitespace-nowrap">{k.label}</span>
                <span className="text-[20px] font-extrabold leading-none tabular-nums" style={{ color: k.key === "done" || k.key === "overdue" ? k.color : "#191F28" }}>
                  {k.value}<span className="text-[11px] text-[#6B7684] font-bold ml-0.5">곳</span>
                </span>
              </div>
              {k.key === "done" ? (
                <div className="mt-1.5 pl-2">
                  <div className="h-1.5 rounded-full bg-[#E5E8EB] overflow-hidden">
                    <div className="h-full rounded-full bg-[#16A865] transition-all" style={{ width: `${doneRate}%` }} />
                  </div>
                  <div className="text-[10px] text-[#8B95A1] mt-1 truncate">{k.sub}</div>
                </div>
              ) : (
                <div className="text-[10px] text-[#8B95A1] mt-1.5 pl-2 truncate">{k.sub}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 검색 + 필터 + 범례 */}
      <div className="glass rounded-3xl p-3 mb-3 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] bg-white/80 rounded-2xl flex items-center gap-2 px-4 h-10">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="거래처 검색" className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]" />
        </div>
        <FilterDropdown label="담당자" options={userNames} value={userFilter} onChange={setUserFilter} open={userOpen} setOpen={setUserOpen} refEl={userRef} />
        <FilterDropdown label="소속" options={affNames} value={affFilter} onChange={setAffFilter} open={affOpen} setOpen={setAffOpen} refEl={affRef} />
        {(q || userFilter.length > 0 || affFilter.length > 0 || stageFilter !== "all") && (
          <button onClick={() => { setQ(""); setUserFilter([]); setAffFilter([]); setStageFilter("all"); }} className="text-[12px] font-bold text-[#6B7684] hover:text-[#191F28] px-2">초기화</button>
        )}
        <div className="w-px h-6 bg-[#E5E8EB] mx-1 hidden md:block" />
        <div className="flex items-center gap-1.5 flex-wrap">
          {STAGES.filter(s => s.key !== "none").map(s => (
            <span key={s.key} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${STAGE_STYLE[s.key].chip}`} title={s.desc}>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* 일괄 처리 바 */}
      {selected.size > 0 && !readonly && (
        <div className="flex items-center gap-3 mb-3 px-4 h-11 rounded-2xl bg-[#191F28] text-white text-[12.5px]">
          <span className="font-bold">선택 {selected.size}곳</span>
          <span className="text-white/60">{mLabel(focus)}분 단계를</span>
          <select value={bulkStage} onChange={e => setBulkStage(e.target.value as BookkeepingStage)} className="h-7 rounded-lg bg-white/10 text-white text-[12px] px-2 outline-none">
            {STAGES.map(s => <option key={s.key} value={s.key} className="text-[#191F28]">{s.label}</option>)}
          </select>
          <button onClick={applyBulk} className="h-7 px-3 rounded-lg bg-[#3182F6] font-bold hover:bg-[#1B64DA]">적용</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/60 hover:text-white">선택 해제</button>
        </div>
      )}

      {/* 표 */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="overflow-auto max-h-[68vh]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-white/90 backdrop-blur-md">
                <th className="sticky left-0 z-30 bg-white/95 px-3 py-3 w-10 border-b border-[#E5E8EB]">
                  {!readonly && (
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map(r => r.id)))} className="w-4 h-4 accent-[#3182F6] cursor-pointer" />
                  )}
                </th>
                <th className="sticky left-10 z-30 bg-white/95 text-left px-3 py-3 text-[#333D4B] font-medium min-w-[200px] border-b border-[#E5E8EB]">
                  거래처 <span className="text-[#8B95A1] font-normal">{rows.length}곳</span>
                </th>
                {months.map(m => {
                  const isFocus = m === focus;
                  const future = m >= currentYM;
                  return (
                    <th key={m} className={`px-1.5 py-3 text-center font-medium border-b border-[#E5E8EB] ${isFocus ? "bg-[#E8F3FF]/80" : ""}`}>
                      <button
                        onClick={() => router.push(`/bookkeeping?focus=${m}`)}
                        className={`inline-flex flex-col items-center leading-tight rounded-lg px-2 py-0.5 hover:bg-white ${isFocus ? "text-[#1B64DA] font-bold" : future ? "text-[#B0B8C1]" : "text-[#333D4B]"}`}
                        title={`${mLabel(m)}분 기준으로 보기 · 기한 ${mdLabel(bookkeepingDeadline(m, targetDay))}`}
                      >
                        <span>{mLabel(m)}분</span>
                        <span className="text-[9.5px] font-normal text-[#8B95A1]">~{mdLabel(bookkeepingDeadline(m, targetDay))}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={months.length + 2} className="text-center py-14 text-[#8B95A1]">해당하는 거래처가 없습니다</td></tr>
              ) : rows.map(c => {
                const checked = selected.has(c.id);
                return (
                  <tr key={c.id} className={`group ${checked ? "bg-[#E8F3FF]/40" : "hover:bg-white/50"}`}>
                    <td className="sticky left-0 z-10 bg-white/90 px-3 py-2 border-b border-[#F2F4F6]">
                      {!readonly && (
                        <input type="checkbox" checked={checked} onChange={() => setSelected(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="w-4 h-4 accent-[#3182F6] cursor-pointer" />
                      )}
                    </td>
                    <td className="sticky left-10 z-10 bg-white/90 px-3 py-2 border-b border-[#F2F4F6]">
                      <div className="text-[#191F28] font-medium truncate max-w-[220px]" title={c.name}>{c.name}</div>
                      <div className="text-[10.5px] text-[#8B95A1] flex items-center gap-1.5">
                        <span>{c.clientType === "corporate" ? "법인" : "개인"}</span>
                        {c.affiliation && <><span className="text-[#D1D6DB]">·</span><span className={c.affiliation === "세이브택스" ? "text-[#3182F6] font-bold" : ""}>{c.affiliation}</span></>}
                        {c.assignedUserName && <><span className="text-[#D1D6DB]">·</span><span>{c.assignedUserName}{c.subAssignedUserName ? ` / ${c.subAssignedUserName}` : ""}</span></>}
                      </div>
                    </td>
                    {months.map(m => {
                      const st = getState(c.id, m);
                      const stage = (STAGE_ORDER.includes(st.stage as BookkeepingStage) ? st.stage : "none") as BookkeepingStage;
                      const isFocus = m === focus;
                      const future = m >= currentYM;
                      const overdue = isOverdue(m, stage, targetDay, today);
                      const style = STAGE_STYLE[stage];
                      return (
                        <td key={m} className={`px-1.5 py-2 text-center border-b border-[#F2F4F6] ${isFocus ? "bg-[#E8F3FF]/40" : ""}`}>
                          <button
                            onClick={e => openPop(e, c.id, m)}
                            disabled={readonly}
                            className={`relative inline-flex items-center justify-center min-w-[46px] h-7 rounded-lg px-2 text-[11px] font-bold transition-all ${style.chip} ${future && stage === "none" ? "opacity-40" : ""} ${overdue ? "ring-2 ring-[#FCA5A5]" : ""} ${readonly ? "" : "hover:scale-105 hover:shadow-sm"}`}
                            title={`${c.name} · ${mLabel(m)}분 · ${style.label}${overdue ? " · 기한 지남" : ""}${st.memo ? `\n메모: ${st.memo}` : ""}`}
                          >
                            {stage === "none" ? "·" : STAGES.find(s => s.key === stage)!.short}
                            {st.memo && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#F59E0B] border border-white" />}
                            {overdue && <span className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-[#DC2626] text-white text-[9px] leading-[14px] font-extrabold border border-white">!</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-[#8B95A1] mt-3 px-1">
        칸을 클릭하면 단계를 바꾸고 메모를 남길 수 있습니다. 왼쪽 체크로 여러 거래처를 고르면 기준월 단계를 한 번에 바꿀 수 있고, 위 카드를 누르면 해당 단계만 걸러집니다.
      </p>

      {/* 팝오버 */}
      {pop && (() => {
        const c = clients.find(x => x.id === pop.clientId)!;
        const st = getState(pop.clientId, pop.ym);
        const stage = (STAGE_ORDER.includes(st.stage as BookkeepingStage) ? st.stage : "none") as BookkeepingStage;
        const dl = bookkeepingDeadline(pop.ym, targetDay);
        const od = isOverdue(pop.ym, stage, targetDay, today);
        return (
          <div
            ref={popRef}
            className="fixed z-50 w-[300px] bg-white rounded-2xl shadow-2xl border border-[#E5E8EB] p-4"
            style={{ left: pop.x, top: pop.y }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#191F28] truncate">{c.name}</div>
                <div className="text-[11px] text-[#6B7684]">
                  {pop.ym.slice(0, 4)}년 {mLabel(pop.ym)}분 · 기한 {mdLabel(dl)}
                  {od && <span className="ml-1 text-[#DC2626] font-bold">기한 지남</span>}
                </div>
              </div>
              <button onClick={() => setPop(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-lg leading-none">✕</button>
            </div>

            <div className="grid grid-cols-5 gap-1 mb-3">
              {STAGES.map(s => {
                const active = s.key === stage;
                return (
                  <button
                    key={s.key}
                    onClick={() => applyStage(pop.clientId, pop.ym, s.key)}
                    className={`h-8 rounded-lg text-[11.5px] font-bold transition-all ${STAGE_STYLE[s.key].chip} ${active ? "ring-2 ring-[#191F28]/70 scale-[1.03]" : "opacity-80 hover:opacity-100"}`}
                    title={s.desc}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5 mb-3">
              <button onClick={() => applyStage(pop.clientId, pop.ym, prevStage(stage))} disabled={stage === "none"} className="flex-1 h-8 rounded-lg text-[11.5px] font-bold bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB] disabled:opacity-40">← 이전 단계</button>
              <button onClick={() => applyStage(pop.clientId, pop.ym, nextStage(stage))} disabled={stage === "done"} className="flex-1 h-8 rounded-lg text-[11.5px] font-bold bg-[#3182F6] text-white hover:bg-[#1B64DA] disabled:opacity-40">다음 단계 →</button>
            </div>

            <textarea
              value={memoDraft}
              onChange={e => setMemoDraft(e.target.value)}
              placeholder="이 달 메모 (예: 통장 1개 아직 안 옴)"
              rows={3}
              className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-2 text-[12px] text-[#191F28] outline-none focus:border-[#A3CAFD] focus:bg-white resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10.5px] text-[#B0B8C1]">{st.updatedAt ? `마지막 변경 ${st.updatedAt.slice(0, 10)}` : ""}</span>
              <button
                onClick={() => { applyMemo(pop.clientId, pop.ym, memoDraft); setPop(null); }}
                disabled={(st.memo ?? "") === memoDraft.trim()}
                className="h-7 px-3 rounded-lg text-[11.5px] font-bold bg-[#191F28] text-white hover:bg-[#333D4B] disabled:opacity-30"
              >
                메모 저장
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function FilterDropdown({ label, options, value, onChange, open, setOpen, refEl }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
  open: boolean; setOpen: (b: boolean) => void; refEl: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative" ref={refEl}>
      <button
        onClick={() => setOpen(!open)}
        className={`h-10 px-4 rounded-2xl text-[12.5px] font-bold flex items-center gap-1.5 transition ${value.length > 0 ? "bg-[#3182F6] text-white" : "bg-white/70 text-[#6B7684] hover:text-[#191F28] hover:bg-white"}`}
      >
        {label}
        {value.length > 0 && <span className="bg-white/25 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{value.length}</span>}
        <span className="text-[10px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-40 bg-white rounded-xl shadow-xl border border-[#E5E8EB] p-2 min-w-[160px] max-h-64 overflow-y-auto">
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F9FAFB] cursor-pointer text-[12.5px] text-[#333D4B]">
              <input type="checkbox" checked={value.includes(o)} onChange={() => onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o])} className="accent-[#3182F6] w-3.5 h-3.5" />
              {o}
            </label>
          ))}
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-center text-[11px] text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]">초기화</button>
          )}
        </div>
      )}
    </div>
  );
}
