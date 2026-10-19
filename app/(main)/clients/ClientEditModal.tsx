"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getClientById, updateClientInModal, deleteClient, getClientHistory, setClientContractStatus } from "@/app/actions/clients";
import { setWithholdingNote, getWithholdingMemos, setSkipDailyWorkReport } from "@/app/actions/withholding";
import { EditClientForm } from "@/app/(main)/clients/EditClientForm";
import { InsuranceTab } from "@/app/(main)/clients/InsuranceTab";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import { askConfirm, notify } from "@/components/ui/Dialog";

type ClientData = Awaited<ReturnType<typeof getClientById>>;
type HistoryData = Awaited<ReturnType<typeof getClientHistory>>;

const MEMO_TYPE_LABELS: Record<string, string> = { general: "일반", handover: "인수인계", caution: "주의" };
const MEMO_TYPE_COLORS: Record<string, string> = { general: "bg-[#F2F4F6] text-[#4E5968]", handover: "bg-[#E8F3FF] text-[#3182F6]", caution: "bg-[#FEF2F2] text-[#DC2626]" };

export type ClientEditModalTab = "edit" | "history" | "vat" | "incomeTax" | "withholding";

/* 공용: 모달 안의 섹션 카드 */
function Section({
  title,
  desc,
  tone = "default",
  children,
}: {
  title: string;
  desc?: string;
  tone?: "default" | "brand" | "danger";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "brand"
      ? "border-[#A3CAFD]/70 bg-[#F5F9FF]/80"
      : tone === "danger"
        ? "border-[#FECACA]/80 bg-[#FFF9F9]/80"
        : "border-white/70 bg-white/60";
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${toneCls}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13.5px] font-bold text-[#191F28]">{title}</span>
        {desc && <span className="text-[11px] text-[#8B95A1]">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

// 이번달 메모 모아보기 — 연도별 토글, 열면 1~12월 메모 표시
function MonthlyMemoArchive({ clientId }: { clientId: number }) {
  const [memos, setMemos] = useState<{ yearMonth: string; memo: string }[] | null>(null);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set([String(new Date().getFullYear())]));

  useEffect(() => {
    getWithholdingMemos(clientId).then(setMemos);
  }, [clientId]);

  if (!memos) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 text-xs text-[#8B95A1]">
        메모 불러오는 중...
      </div>
    );
  }

  if (memos.length === 0) return null;

  // 연도별 그룹핑 (최신 연도 먼저, 연도 안에서는 1월→12월)
  const byYear = new Map<string, { month: number; memo: string }[]>();
  for (const m of memos) {
    const [year, month] = m.yearMonth.split("-");
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push({ month: parseInt(month), memo: m.memo });
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  byYear.forEach((list) => list.sort((a, b) => a.month - b.month));

  return (
    <Section title="이번달 메모 모아보기" desc={`원천세 페이지에서 월별로 적은 메모 · 총 ${memos.length}건`}>
      <div className="space-y-1.5">
        {years.map((year) => {
          const list = byYear.get(year)!;
          const open = openYears.has(year);
          return (
            <div key={year} className="overflow-hidden rounded-xl border border-[#F2F4F6] bg-white/80">
              <button
                type="button"
                onClick={() =>
                  setOpenYears((prev) => {
                    const next = new Set(prev);
                    if (next.has(year)) next.delete(year); else next.add(year);
                    return next;
                  })
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#F9FAFB]"
              >
                <span className="w-3 text-[10px] text-[#8B95A1]">{open ? "▼" : "▶"}</span>
                <span className="text-[13px] font-bold text-[#333D4B]">{year}년</span>
                <span className="rounded-full bg-[#F2F4F6] px-2 py-0.5 text-[11px] text-[#6B7684]">{list.length}건</span>
              </button>
              {open && (
                <div className="divide-y divide-[#F2F4F6]">
                  {list.map(({ month, memo }) => (
                    <div key={month} className="flex items-start gap-2.5 px-3 py-2">
                      <span className="mt-px inline-flex h-[20px] min-w-[34px] shrink-0 items-center justify-center rounded-md bg-[#E8F3FF] px-1.5 text-[11px] font-bold text-[#1B64DA]">
                        {month}월
                      </span>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#4E5968]">{memo}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// 도움컴퍼니 원천세 변환 마법사 — 정산원본+사원등록 업로드 → 검증(게이트) → 서식 3종 생성
function DoumConvertSection() {
  const now = new Date();
  const defaultYm = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [ym, setYm] = useState(defaultYm);
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [regFile, setRegFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  function pickYmFromName(name: string) {
    const m = name.match(/(\d{2})년\s?(\d{2})월/);
    if (m) setYm(`20${m[1]}.${m[2]}`);
  }

  async function run() {
    if (!srcFile || !regFile || running) return;
    setRunning(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("source", srcFile);
      fd.append("reg", regFile);
      fd.append("yearMonth", ym);
      const res = await fetch("/api/withholding/doum-convert", { method: "POST", body: fd });
      setResult(await res.json());
    } catch (e) {
      setResult({ ok: false, fatal: "요청 실패: " + String(e) });
    } finally {
      setRunning(false);
    }
  }

  function download(name: string, b64: string) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr]));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) => (n ?? 0).toLocaleString("ko-KR");
  const fileCls = "text-xs text-[#4E5968] file:mr-2 file:rounded-lg file:border-0 file:bg-[#E8F3FF] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#1B64DA]";

  return (
    <Section title="원천세 변환 마법사" desc="정산 원본 → 검증 → 위하고 업로드 서식" tone="brand">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-[#6B7684]">귀속월</span>
          <input value={ym} onChange={e => setYm(e.target.value)} placeholder="2026.09"
            className="h-9 w-24 rounded-xl border border-[#E5E8EB] bg-white px-2.5 text-sm outline-none transition focus:border-[#3182F6] focus:ring-4 focus:ring-[#3182F6]/15" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-[#6B7684]">정산 원본</span>
          <input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0] ?? null; setSrcFile(f); if (f) pickYmFromName(f.name); }} className={fileCls} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-[#6B7684]">사원등록</span>
          <input type="file" accept=".xlsx" onChange={e => setRegFile(e.target.files?.[0] ?? null)} className={fileCls} />
        </div>
        <button type="button" disabled={!srcFile || !regFile || running} onClick={run}
          className="h-10 w-full rounded-xl bg-[#3182F6] text-sm font-bold text-white shadow-md shadow-[#3182F6]/25 transition-colors hover:bg-[#1B64DA] disabled:opacity-40 disabled:shadow-none">
          {running ? "검증·변환 중..." : "① 주민번호 검증 → 변환 실행"}
        </button>
      </div>

      {result && (
        <div className="mt-3 space-y-2">
          {result.fatal && (
            <div className="whitespace-pre-wrap rounded-xl bg-[#FEF2F2] px-3 py-2.5 text-xs text-[#B91C1C]">{result.fatal}</div>
          )}
          {!result.fatal && !result.ok && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5">
              <div className="mb-1.5 text-xs font-bold text-[#B91C1C]">🚫 주민번호 검증 실패 — 정정 후 다시 업로드하세요 (파일 미생성)</div>
              {(result.errors ?? []).map((e: any, i: number) => (
                <div key={i} className="text-[11.5px] text-[#B91C1C]">· [{e.tag}] {e.name} {e.rrn} — {e.msg}{e.work ? ` (${e.work})` : ""}</div>
              ))}
            </div>
          )}
          {result.ok && (
            <>
              <div className="rounded-xl bg-[#E8F5EE] px-3 py-2 text-xs font-bold text-[#15803D]">
                ✅ 검증 통과 — 사업소득 {result.totals.bizCount}명 {fmt(result.totals.bizAmount)}원 · 일용직 {result.totals.dailyCount}건 {fmt(result.totals.dailyAmount)}원
              </div>
              {(result.warns ?? []).length > 0 && (
                <div className="rounded-xl bg-[#FFFBEB] px-3 py-2 text-[11.5px] text-[#B45309]">
                  {result.warns.map((w: any, i: number) => <div key={i}>⚠ [{w.tag}] {w.name} {w.rrn} — {w.msg}</div>)}
                </div>
              )}
              <div className="rounded-xl border border-[#E5E8EB] bg-white px-3 py-2.5">
                <div className="mb-1 text-xs font-bold text-[#191F28]">
                  ② 위하고에 직접 등록할 일용직: {result.newWorkers.length}명
                </div>
                {result.newWorkers.length === 0 ? (
                  <div className="text-[11.5px] text-[#8B95A1]">전원 등록되어 있음 — 바로 업로드하세요</div>
                ) : (
                  result.newWorkers.map((p: any, i: number) => (
                    <div key={i} className="text-[11.5px] text-[#4E5968]">· {p.name} {p.rrn} ({p.work}{p.bank ? ` / ${p.bank} ${p.account}` : ""})</div>
                  ))
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {result.filesOut?.map((f: any, i: number) => (
                  <button key={f.name} type="button" onClick={() => download(f.name, f.b64)}
                    className="rounded-xl border border-[#A3CAFD] bg-white py-2 text-[11px] font-bold text-[#1B64DA] transition-colors hover:bg-[#E8F3FF]">
                    {["② 신규명단", "③ 사업소득", "④ 일용직"][i]} ⬇
                  </button>
                ))}
              </div>
              <div className="text-[10.5px] text-[#8B95A1]">②를 위하고에 직접 입력(등록) 후 → ③④를 SmartA 자료입력 메뉴에서 엑셀 업로드</div>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

// 원천세 고정 특이사항 — 매월 유지되며 원천세 페이지에서 hover로 표시
function WithholdingNoteSection({ clientId, initialNote }: { clientId: number; initialNote: string }) {
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const dirty = note !== savedNote;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await setWithholdingNote(clientId, note);
      setSavedNote(note.trim());
      setNote(note.trim());
      notify("특이사항을 저장했어요", { type: "success" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="특이사항 (고정)" desc="매월 유지 · 원천세 페이지에서 마우스를 올리면 표시됩니다" tone="danger">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 급여자료 매월 대표에게 직접 요청 / 식대 비과세 20만원 적용 등"
        rows={3}
        className="w-full resize-none rounded-xl border border-[#E5E8EB] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#DC2626]/50 focus:ring-4 focus:ring-[#DC2626]/10"
      />
      {dirty && (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={() => setNote(savedNote)}
            className="rounded-xl px-3 py-1.5 text-xs font-bold text-[#6B7684] transition-colors hover:bg-[#F2F4F6]">
            취소
          </button>
          <button type="button" disabled={saving} onClick={save}
            className="rounded-xl bg-[#DC2626] px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50">
            {saving ? "저장 중..." : "특이사항 저장"}
          </button>
        </div>
      )}
    </Section>
  );
}

// 근로내용확인신고서 미제출 거래처 설정 — 켜면 원천세 페이지에서 해당 체크칸이 사라짐
function DailyWorkReportSkipSection({ clientId, initialSkip }: { clientId: number; initialSkip: boolean }) {
  const [skip, setSkip] = useState(initialSkip);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !skip;
    setSaving(true);
    setSkip(next);
    try {
      await setSkipDailyWorkReport(clientId, next);
    } catch {
      setSkip(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3.5 transition-colors hover:bg-white/80">
      <button
        type="button"
        role="switch"
        aria-checked={skip}
        onClick={toggle}
        disabled={saving}
        className={`v3-toggle ${skip ? "on" : ""}`}
      />
      <span className="text-[13.5px] font-bold text-[#191F28]">근로내용확인신고서 미제출</span>
      <span className="text-[11px] text-[#8B95A1]">체크하면 원천세 페이지에서 근로내용확인신고서 체크칸이 표시되지 않습니다</span>
    </label>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-[22px] shadow-sm">{icon}</div>
      <div className="text-[13.5px] font-bold text-[#4E5968]">{title}</div>
      {desc && <div className="mt-1 text-[12px] text-[#8B95A1]">{desc}</div>}
    </div>
  );
}

export function ClientEditModal({
  clientId,
  onClose,
  initialTab,
}: {
  clientId: number;
  onClose: () => void;
  initialTab?: ClientEditModalTab;
}) {
  const [data, setData] = useState<ClientData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [tab, setTab] = useState<ClientEditModalTab>(initialTab ?? "edit");
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    getClientById(clientId).then(setData);
  }, [clientId]);

  // 히스토리 탭 클릭 시 데이터 로드
  useEffect(() => {
    if (tab === "history" && !history) {
      getClientHistory(clientId).then(setHistory);
    }
  }, [tab, history, clientId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSuccess() {
    notify("거래처 정보를 저장했어요", { type: "success" });
    router.refresh();
    onClose();
  }

  const [statusUpdating, setStatusUpdating] = useState(false);
  async function handleToggleContract() {
    if (!data?.client) return;
    const next = data.client.contractStatus === "active" ? "terminated" : "active";
    const ok = await askConfirm(
      next === "terminated"
        ? {
            title: "해지처리할까요?",
            message: `'${data.client.name}'을(를) 계약종료 상태로 바꿉니다.\n\n· 삭제가 아니라 '계약종료' 상태로 바뀌어 데이터는 보존됩니다\n· 종합소득세·채권관리에서는 계속 보입니다\n· 기장대리 목록에서는 '해지 거래처' 그룹으로 접히고 집계에서 빠집니다`,
            confirmText: "해지처리",
            danger: true,
          }
        : {
            title: "해지를 취소할까요?",
            message: `'${data.client.name}'을(를) 다시 '계약중'으로 되돌립니다.`,
            confirmText: "계약중으로",
          }
    );
    if (!ok) return;
    setStatusUpdating(true);
    try {
      await setClientContractStatus(data.client.id, next);
      const fresh = await getClientById(clientId);
      setData(fresh);
      router.refresh();
      notify(next === "terminated" ? "해지처리했어요" : "계약중으로 되돌렸어요", { type: "success" });
    } finally {
      setStatusUpdating(false);
    }
  }

  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!data?.client || deleting) return;
    const ok = await askConfirm({
      title: "거래처를 삭제할까요?",
      message: `'${data.client.name}'을(를) 휴지통으로 보냅니다.\n거래처 목록에서 사라지며, 휴지통에서 복원할 수 있어요.\n\n거래처가 나간 경우라면 삭제 대신 '해지처리'를 써 주세요.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteClient(data.client.id);
    } finally {
      setDeleting(false);
    }
  }

  // 히스토리 타임라인 데이터
  const timeline = history ? [
    ...history.tasks.map(t => ({
      type: "task" as const,
      id: t.id,
      title: t.title,
      date: t.createdAt,
      status: t.status,
      taskType: t.taskType,
      dueDate: t.dueDate,
      user: t.assignedUser?.name,
    })),
    ...history.memos.map(m => ({
      type: "memo" as const,
      id: m.id,
      title: m.title || m.content.slice(0, 50),
      date: m.createdAt,
      memoType: m.memoType,
      user: m.author.name,
      content: m.content,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];

  const client = data?.client;
  const isActive = client?.contractStatus === "active";
  const TABS = [
    { key: "edit", label: "수정" },
    { key: "history", label: "히스토리" },
    { key: "vat", label: "부가세" },
    { key: "incomeTax", label: client?.clientType?.includes("corporate") ? "법인세" : "종합소득세" },
    { key: "withholding", label: "원천세" },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-[#191F28]/25 p-3 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-strong flex w-full max-w-2xl flex-col overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] animate-[dialog-in_.2s_cubic-bezier(.2,.8,.2,1)]">
        {/* 헤더 */}
        <div className="shrink-0 px-6 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-blue text-[15px] font-bold text-white shadow-md shadow-[#3182F6]/30">
                  {(client?.name ?? "고").charAt(0)}
                </div>
                <h2 className="truncate text-[19px] font-bold tracking-tight text-[#191F28]">
                  {client?.name ?? "거래처"}
                </h2>
                {client && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                    isActive ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#6B7684]"
                  }`}>
                    {isActive ? "계약중" : "계약종료"}
                  </span>
                )}
              </div>
              {client && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-11 text-[11.5px] text-[#8B95A1]">
                  {client.bizNumber && <span>{client.bizNumber}</span>}
                  {client.ceoName && <span>· 대표 {client.ceoName}</span>}
                  {client.assignedUser?.name && <span>· 담당 {client.assignedUser.name}</span>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#8B95A1] transition hover:bg-white/70 hover:text-[#191F28]"
              title="닫기 (Esc)"
            >
              <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 탭 + 액션 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl bg-[#191F28]/[.05] p-[3px]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-bold transition-all ${
                    tab === t.key
                      ? "bg-white text-[#191F28] shadow-[0_1px_0_rgba(15,23,42,.04),0_2px_8px_-2px_rgba(15,23,42,.12)]"
                      : "text-[#6B7684] hover:text-[#191F28]"
                  }`}
                >
                  {t.label}
                  {t.key === "history" && history && (
                    <span className="ml-1 text-[10.5px] font-bold text-[#8B95A1]">{timeline.length}</span>
                  )}
                </button>
              ))}
            </div>

            {tab === "edit" && client && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleContract}
                  disabled={statusUpdating}
                  className={`h-9 rounded-xl px-3 text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
                    isActive
                      ? "bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7]"
                      : "bg-[#F1FBF4] text-[#15803D] hover:bg-[#DCFCE7]"
                  }`}
                >
                  {statusUpdating ? "처리 중..." : isActive ? "해지처리" : "해지취소"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-9 rounded-xl px-3 text-[12.5px] font-bold text-[#E02E2E] transition-colors hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
                <span className="mx-0.5 h-5 w-px bg-[#191F28]/10" />
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-xl bg-[#F2F4F6] px-3.5 text-[12.5px] font-bold text-[#4E5968] transition-colors hover:bg-[#E5E8EB]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>('[data-modal-form]');
                    form?.requestSubmit();
                  }}
                  className="h-9 rounded-xl bg-[#3182F6] px-4 text-[12.5px] font-bold text-white shadow-md shadow-[#3182F6]/25 transition-colors hover:bg-[#1B64DA]"
                >
                  저장
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6 h-px shrink-0 bg-[#191F28]/[.06]" />

        {/* 바디 */}
        <div className="form-glass flex-1 overflow-y-auto px-6 py-5">
          {!data ? (
            <div className="space-y-3 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl bg-white/70" style={{ width: `${92 - i * 12}%` }} />
              ))}
            </div>
          ) : !client ? (
            <EmptyState icon="🔍" title="거래처를 찾을 수 없어요" desc="삭제되었거나 권한이 없는 거래처입니다" />
          ) : tab === "edit" ? (
            <EditClientForm
              action={updateClientInModal.bind(null, client.id)}
              client={client}
              users={data.users}
              currentTaxTypes={client.taxTypes?.split(",").map((t) => t.trim()) ?? []}
              currentLaborTypes={client.laborTypes?.split(",").map((t) => t.trim()) ?? []}
              currentUserRole={data.currentUserRole}
              affiliationOptions={data.affiliationOptions}
              onSuccess={handleSuccess}
              hideButtons
            />
          ) : tab === "withholding" ? (
            <div className="space-y-3">
              {client.name.includes("도움컴퍼니") && <DoumConvertSection />}
              <WithholdingNoteSection clientId={clientId} initialNote={client.withholdingNote ?? ""} />
              <DailyWorkReportSkipSection clientId={clientId} initialSkip={client.skipDailyWorkReport ?? false} />
              <MonthlyMemoArchive clientId={clientId} />
              <InsuranceTab clientId={clientId} />
            </div>
          ) : tab === "vat" || tab === "incomeTax" ? (
            <EmptyState
              icon={tab === "vat" ? "🧾" : "📑"}
              title="준비 중인 탭이에요"
              desc={tab === "vat" ? "부가세 메뉴에서 거래처별 현황을 볼 수 있어요" : "종합소득세 메뉴에서 거래처별 현황을 볼 수 있어요"}
            />
          ) : (
            /* 히스토리 */
            !history ? (
              <div className="space-y-3 pt-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/70" />
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <EmptyState icon="📋" title="아직 기록이 없어요" desc="할 일·메모를 등록하면 여기에 시간순으로 쌓입니다" />
            ) : (
              <div className="relative space-y-3 border-l-2 border-[#191F28]/[.08] pl-6">
                {timeline.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="relative">
                    <div className={`absolute -left-[31px] top-3.5 h-3 w-3 rounded-full border-2 border-white ${item.type === "task" ? "bg-[#3182F6]" : "bg-[#F59E0B]"}`} />
                    <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.type === "task" ? "bg-[#E8F3FF] text-[#1B64DA]" : "bg-[#FEF3C7] text-[#B45309]"}`}>
                          {item.type === "task" ? "업무" : "메모"}
                        </span>
                        {item.type === "task" && "status" in item && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                        )}
                        {item.type === "memo" && "memoType" in item && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${MEMO_TYPE_COLORS[item.memoType as string] ?? MEMO_TYPE_COLORS.general}`}>
                            {MEMO_TYPE_LABELS[item.memoType as string] ?? item.memoType}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] tabular-nums text-[#8B95A1]">
                          {new Date(item.date).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <div className="text-[13.5px] font-bold text-[#191F28]">{item.title}</div>
                      {item.type === "task" && "dueDate" in item && item.dueDate && (
                        <div className="mt-0.5 text-xs text-[#8B95A1]">마감: {new Date(item.dueDate).toLocaleDateString("ko-KR")}</div>
                      )}
                      {item.type === "memo" && "content" in item && (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#6B7684]">{item.content}</p>
                      )}
                      {item.user && <div className="mt-1 text-[10.5px] text-[#8B95A1]">{item.user}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
