"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getClientById, updateClientInModal, deleteClient, getClientHistory, setClientContractStatus } from "@/app/actions/clients";
import { setWithholdingNote } from "@/app/actions/withholding";
import { EditClientForm } from "@/app/(main)/clients/[id]/edit/EditClientForm";
import { InsuranceTab } from "@/app/(main)/clients/InsuranceTab";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

type ClientData = Awaited<ReturnType<typeof getClientById>>;
type HistoryData = Awaited<ReturnType<typeof getClientHistory>>;

const MEMO_TYPE_LABELS: Record<string, string> = { general: "일반", handover: "인수인계", caution: "주의" };
const MEMO_TYPE_COLORS: Record<string, string> = { general: "bg-[#F2F4F6] text-[#4E5968]", handover: "bg-[#E8F3FF] text-[#3182F6]", caution: "bg-[#FEF2F2] text-[#DC2626]" };

export type ClientEditModalTab = "edit" | "history" | "vat" | "incomeTax" | "withholding";

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
              <WithholdingNoteSection clientId={clientId} initialNote={data.client.withholdingNote ?? ""} />
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
