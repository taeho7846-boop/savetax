"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getClientById, updateClientInModal, deleteClient, getClientHistory, setClientContractStatus } from "@/app/actions/clients";
import { setWithholdingNote, getWithholdingMemos } from "@/app/actions/withholding";
import { EditClientForm } from "@/app/(main)/clients/[id]/edit/EditClientForm";
import { InsuranceTab } from "@/app/(main)/clients/InsuranceTab";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

type ClientData = Awaited<ReturnType<typeof getClientById>>;
type HistoryData = Awaited<ReturnType<typeof getClientHistory>>;

const MEMO_TYPE_LABELS: Record<string, string> = { general: "일반", handover: "인수인계", caution: "주의" };
const MEMO_TYPE_COLORS: Record<string, string> = { general: "bg-[#F2F4F6] text-[#4E5968]", handover: "bg-[#E8F3FF] text-[#3182F6]", caution: "bg-[#FEF2F2] text-[#DC2626]" };

export type ClientEditModalTab = "edit" | "history" | "vat" | "incomeTax" | "withholding";

// 이번달 메모 모아보기 — 연도별 토글, 열면 1~12월 메모 표시
function MonthlyMemoArchive({ clientId }: { clientId: number }) {
  const [memos, setMemos] = useState<{ yearMonth: string; memo: string }[] | null>(null);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set([String(new Date().getFullYear())]));

  useEffect(() => {
    getWithholdingMemos(clientId).then(setMemos);
  }, [clientId]);

  if (!memos) {
    return (
      <div className="border border-[#E5E8EB] rounded-xl px-4 py-3.5 text-xs text-[#8B95A1]">
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
    <div className="border border-[#E5E8EB] rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-[#191F28]">이번달 메모 모아보기</span>
        <span className="text-[11px] text-[#8B95A1]">원천세 페이지에서 월별로 적은 메모 · 총 {memos.length}건</span>
      </div>
      <div className="space-y-1.5 mt-2">
        {years.map((year) => {
          const list = byYear.get(year)!;
          const open = openYears.has(year);
          return (
            <div key={year} className="border border-[#F2F4F6] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpenYears((prev) => {
                    const next = new Set(prev);
                    if (next.has(year)) next.delete(year); else next.add(year);
                    return next;
                  })
                }
                className="w-full flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] hover:bg-[#F2F4F6] transition-colors text-left"
              >
                <span className="text-[10px] text-[#8B95A1] w-3">{open ? "▼" : "▶"}</span>
                <span className="text-[13px] font-bold text-[#333D4B]">{year}년</span>
                <span className="text-[11px] text-[#8B95A1] bg-white rounded-full px-2 py-0.5">{list.length}건</span>
              </button>
              {open && (
                <div className="divide-y divide-[#F2F4F6]">
                  {list.map(({ month, memo }) => (
                    <div key={month} className="flex gap-2.5 px-3 py-2 items-start">
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[34px] h-[20px] rounded-md bg-[#E8F3FF] text-[#1B64DA] text-[11px] font-bold px-1.5 mt-px">
                        {month}월
                      </span>
                      <p className="text-xs text-[#4E5968] whitespace-pre-wrap leading-relaxed">{memo}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

  return (
    <div className="border border-[#A3CAFD] bg-[#F5F9FF] rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-[#191F28]">원천세 변환 마법사</span>
        <span className="text-[11px] text-[#8B95A1]">정산 원본 → 검증 → 위하고 업로드 서식</span>
      </div>

      {/* 입력 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7684] w-16 shrink-0">귀속월</span>
          <input value={ym} onChange={e => setYm(e.target.value)} placeholder="2026.09"
            className="w-24 text-sm border border-[#D1D6DB] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3182F6]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7684] w-16 shrink-0">정산 원본</span>
          <input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0] ?? null; setSrcFile(f); if (f) pickYmFromName(f.name); }}
            className="text-xs text-[#4E5968] file:mr-2 file:text-xs file:border-0 file:rounded-lg file:px-3 file:py-1.5 file:bg-[#E8F3FF] file:text-[#1B64DA] file:font-bold" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7684] w-16 shrink-0">사원등록</span>
          <input type="file" accept=".xlsx" onChange={e => setRegFile(e.target.files?.[0] ?? null)}
            className="text-xs text-[#4E5968] file:mr-2 file:text-xs file:border-0 file:rounded-lg file:px-3 file:py-1.5 file:bg-[#E8F3FF] file:text-[#1B64DA] file:font-bold" />
        </div>
        <button type="button" disabled={!srcFile || !regFile || running} onClick={run}
          className="w-full text-sm py-2 rounded-lg bg-[#3182F6] text-white font-bold hover:bg-[#1B64DA] disabled:opacity-40 transition-colors">
          {running ? "검증·변환 중..." : "① 주민번호 검증 → 변환 실행"}
        </button>
      </div>

      {/* 결과 */}
      {result && (
        <div className="mt-3 space-y-2">
          {result.fatal && (
            <div className="text-xs bg-[#FEF2F2] text-[#B91C1C] rounded-lg px-3 py-2.5 whitespace-pre-wrap">{result.fatal}</div>
          )}
          {!result.fatal && !result.ok && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2.5">
              <div className="text-xs font-bold text-[#B91C1C] mb-1.5">🚫 주민번호 검증 실패 — 정정 후 다시 업로드하세요 (파일 미생성)</div>
              {(result.errors ?? []).map((e: any, i: number) => (
                <div key={i} className="text-[11.5px] text-[#B91C1C]">· [{e.tag}] {e.name} {e.rrn} — {e.msg}{e.work ? ` (${e.work})` : ""}</div>
              ))}
            </div>
          )}
          {result.ok && (
            <>
              <div className="text-xs bg-[#E8F5EE] text-[#15803D] rounded-lg px-3 py-2 font-bold">
                ✅ 검증 통과 — 사업소득 {result.totals.bizCount}명 {fmt(result.totals.bizAmount)}원 · 일용직 {result.totals.dailyCount}건 {fmt(result.totals.dailyAmount)}원
              </div>
              {(result.warns ?? []).length > 0 && (
                <div className="text-[11.5px] bg-[#FFFBEB] text-[#B45309] rounded-lg px-3 py-2">
                  {result.warns.map((w: any, i: number) => <div key={i}>⚠ [{w.tag}] {w.name} {w.rrn} — {w.msg}</div>)}
                </div>
              )}
              {/* 신규 등록 대상 */}
              <div className="bg-white border border-[#E5E8EB] rounded-lg px-3 py-2.5">
                <div className="text-xs font-bold text-[#191F28] mb-1">
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
              {/* 다운로드 */}
              <div className="grid grid-cols-3 gap-1.5">
                {result.filesOut?.map((f: any, i: number) => (
                  <button key={f.name} type="button" onClick={() => download(f.name, f.b64)}
                    className="text-[11px] py-2 rounded-lg border border-[#A3CAFD] bg-white text-[#1B64DA] font-bold hover:bg-[#E8F3FF] transition-colors">
                    {["② 신규명단", "③ 사업소득", "④ 일용직"][i]} ⬇
                  </button>
                ))}
              </div>
              <div className="text-[10.5px] text-[#8B95A1]">②를 위하고에 직접 입력(등록) 후 → ③④를 SmartA 자료입력 메뉴에서 엑셀 업로드</div>
            </>
          )}
        </div>
      )}
    </div>
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[#FECACA] bg-[#FFF9F9] rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[9px] font-bold leading-none">!</span>
        <span className="text-sm font-bold text-[#191F28]">특이사항 (고정)</span>
        <span className="text-[11px] text-[#8B95A1]">매월 유지 · 원천세 페이지에서 마우스를 올리면 표시됩니다</span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 급여자료 매월 대표에게 직접 요청 / 식대 비과세 20만원 적용 등"
        rows={3}
        className="w-full border border-[#E5E8EB] rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#DC2626]/40 resize-none"
      />
      {dirty && (
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={() => setNote(savedNote)}
            className="text-xs text-[#6B7684] px-3 py-1.5 rounded-lg hover:bg-[#F2F4F6] transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="text-xs bg-[#DC2626] text-white px-4 py-1.5 rounded-lg hover:bg-[#B91C1C] disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "특이사항 저장"}
          </button>
        </div>
      )}
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
    router.refresh();
    onClose();
  }

  const [statusUpdating, setStatusUpdating] = useState(false);
  async function handleToggleContract() {
    if (!data?.client) return;
    const next = data.client.contractStatus === "active" ? "terminated" : "active";
    const msg = next === "terminated"
      ? `'${data.client.name}'을(를) 해지처리하시겠습니까?\n\n· 삭제가 아니라 '계약종료' 상태로 바뀝니다 (데이터 보존)\n· 종합소득세·채권관리에서는 계속 보입니다\n· 기장대리 목록에서는 '해지 거래처' 그룹으로 접히고 집계에서 빠집니다`
      : `'${data.client.name}'을(를) 다시 '계약중'으로 되돌리시겠습니까?`;
    if (!confirm(msg)) return;
    setStatusUpdating(true);
    try {
      await setClientContractStatus(data.client.id, next);
      const fresh = await getClientById(clientId);
      setData(fresh);
      router.refresh();
    } finally {
      setStatusUpdating(false);
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

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F4F6] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#191F28]">
              {data?.client?.name ?? "고객사"}
            </h2>
            {tab === "edit" && data?.client && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>('[data-modal-form]');
                    form?.requestSubmit();
                  }}
                  className="bg-[#3182F6] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-[#1B64DA] transition-colors"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-[#D1D6DB] text-[#333D4B] text-sm px-4 py-1.5 rounded-lg hover:bg-[#F9FAFB] transition-colors"
                >
                  취소
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {tab === "edit" && data?.client && (
              <button
                type="button"
                onClick={handleToggleContract}
                disabled={statusUpdating}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  data.client.contractStatus === "active"
                    ? "text-[#B45309] border-[#FDE68A] hover:bg-[#FFFBEB]"
                    : "text-[#15803D] border-[#BBF7D0] hover:bg-[#F1FBF4]"
                }`}
              >
                {statusUpdating
                  ? "처리 중..."
                  : data.client.contractStatus === "active" ? "해지처리" : "해지취소"}
              </button>
            )}
            {tab === "edit" && data?.client && (
              <form
                action={deleteClient.bind(null, data.client.id)}
                onSubmit={(e) => {
                  if (!confirm(`'${data.client!.name}'을(를) 삭제하시겠습니까?`))
                    e.preventDefault();
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-[#E02E2E] hover:text-[#B91C1C] border border-[#FECACA] hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  삭제
                </button>
              </form>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#F2F4F6] px-6 shrink-0 overflow-x-auto">
          {([
            { key: "edit", label: "수정" },
            { key: "history", label: "히스토리" },
            { key: "vat", label: "부가세" },
            { key: "incomeTax", label: data?.client?.clientType?.includes("corporate") ? "법인세" : "종합소득세" },
            { key: "withholding", label: "원천세" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-[#3182F6] text-[#191F28]"
                  : "border-transparent text-[#8B95A1] hover:text-[#4E5968]"
              }`}
            >
              {t.label}
              {t.key === "history" && history && <span className="ml-1 text-xs text-[#8B95A1]">({timeline.length})</span>}
            </button>
          ))}
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5 overflow-y-auto">
          {!data ? (
            <div className="text-center py-16 text-[#8B95A1] text-sm">불러오는 중...</div>
          ) : !data.client ? (
            <div className="text-center py-16 text-[#8B95A1] text-sm">고객사를 찾을 수 없습니다</div>
          ) : tab === "edit" ? (
            <EditClientForm
              action={updateClientInModal.bind(null, data.client.id)}
              client={data.client}
              users={data.users}
              currentTaxTypes={data.client.taxTypes?.split(",").map((t) => t.trim()) ?? []}
              currentLaborTypes={data.client.laborTypes?.split(",").map((t) => t.trim()) ?? []}
              currentUserRole={data.currentUserRole}
              affiliationOptions={data.affiliationOptions}
              onSuccess={handleSuccess}
              hideButtons
            />
          ) : tab === "withholding" ? (
            <div className="space-y-4">
              {data.client.name.includes("도움컴퍼니") && <DoumConvertSection />}
              <WithholdingNoteSection clientId={clientId} initialNote={data.client.withholdingNote ?? ""} />
              <MonthlyMemoArchive clientId={clientId} />
              <InsuranceTab clientId={clientId} />
            </div>
          ) : tab === "vat" || tab === "incomeTax" ? (
            <div className="text-center py-16 text-[#8B95A1] text-sm">준비 중인 탭입니다</div>
          ) : (
            /* 히스토리 */
            !history ? (
              <div className="text-center py-16 text-[#8B95A1] text-sm">불러오는 중...</div>
            ) : timeline.length === 0 ? (
              <div className="text-center py-16 text-[#8B95A1] text-sm">기록이 없습니다</div>
            ) : (
              <div className="relative pl-6 border-l-2 border-[#E5E8EB] space-y-4">
                {timeline.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="relative">
                    <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 border-white ${item.type === "task" ? "bg-[#3182F6]" : "bg-[#F59E0B]"}`} />
                    <div className="bg-[#F9FAFB] rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.type === "task" ? "bg-[#E8F3FF] text-[#1B64DA]" : "bg-[#FEF3C7] text-[#B45309]"}`}>
                          {item.type === "task" ? "업무" : "메모"}
                        </span>
                        {item.type === "task" && "status" in item && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                        )}
                        {item.type === "memo" && "memoType" in item && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${MEMO_TYPE_COLORS[item.memoType as string] ?? MEMO_TYPE_COLORS.general}`}>
                            {MEMO_TYPE_LABELS[item.memoType as string] ?? item.memoType}
                          </span>
                        )}
                        <span className="text-xs text-[#8B95A1] ml-auto">
                          {new Date(item.date).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-[#191F28]">{item.title}</div>
                      {item.type === "task" && "dueDate" in item && item.dueDate && (
                        <div className="text-xs text-[#8B95A1] mt-0.5">마감: {new Date(item.dueDate).toLocaleDateString("ko-KR")}</div>
                      )}
                      {item.type === "memo" && "content" in item && (
                        <p className="text-xs text-[#6B7684] mt-1 whitespace-pre-wrap">{item.content}</p>
                      )}
                      {item.user && <div className="text-[10px] text-[#8B95A1] mt-1">{item.user}</div>}
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
