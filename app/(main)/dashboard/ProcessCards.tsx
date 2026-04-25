"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDataRequested, confirmExclusion, postponeTask, requestExclusion, markTransferRequested, markTransferReceived } from "@/app/actions/commission";
import { ClipboardListIcon, DownloadIcon, ClockIcon } from "@/components/icons";

type HappyCallItem = {
  commissionId: number;
  clientId: number;
  clientName: string;
  noAnswerCount: number;
  lastCallAt: string; // ISO
  daysElapsed: number;
};

type DataCollectItem = {
  commissionId: number;
  clientId: number;
  clientName: string;
  connectedAt: string;
  daysFromConnect: number;
  requestCount: number;
  lastRequestAt: string | null;
  daysSinceRequest: number | null;
  missingDocs: string[]; // ["신분증", "홈택스 ID/PW"]
};

type TodayTaskItem = {
  type: "happycall" | "datacollect" | "transfer";
  commissionId: number;
  clientName: string;
  label: string;
};

type ExcludeItem = {
  commissionId: number;
  clientName: string;
  reason: string;
  daysElapsed: number; // 등록/연결일 기준
  requestDays: number; // 관리제외 요청일 기준
};

// ============ 오늘의 업무 카드 ============
export function TodayTasksCard({ items }: { items: TodayTaskItem[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [postponeTarget, setPostponeTarget] = useState<{ commissionId: number; clientName: string } | null>(null);

  function handleDataRequest(commissionId: number) {
    startTransition(async () => {
      await markDataRequested(commissionId);
      router.refresh();
    });
  }

  function handlePostpone() {
    if (!postponeTarget) return;
    const dateVal = (document.getElementById("postpone-date") as HTMLInputElement)?.value;
    if (!dateVal) { alert("날짜를 선택하세요"); return; }
    const note = (document.getElementById("postpone-note") as HTMLInputElement)?.value || "";
    startTransition(async () => {
      await postponeTask(postponeTarget.commissionId, dateVal, note);
      setPostponeTarget(null);
      router.refresh();
    });
  }

  return (
    <>
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <ClipboardListIcon width={16} height={16} className="text-[#4E5968]" />
        <h2 className="font-[500] text-[#4E5968]">오늘의 업무</h2>
        {items.length > 0 && (
          <span className="bg-[#f87171] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-[#F2F4F6]">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[14px] text-[#4E5968] font-[500]">오늘 할 일을 모두 완료했어요</div>
            <div className="text-[12px] text-[#8B95A1] mt-1">깔끔하네요 🎉</div>
          </div>
        ) : items.map((item, i) => {
          // D+N 추출해 별도 강조
          const dayMatch = item.label.match(/\(D\+(\d+)\)/);
          const dayNum = dayMatch ? dayMatch[1] : null;
          const labelText = dayMatch ? item.label.replace(/\s*\(D\+\d+\)$/, "") : item.label;
          const isUrgent = dayNum && parseInt(dayNum) >= 7;
          return (
            <div key={`${item.type}-${item.commissionId}-${i}`} className="px-5 py-3 flex items-center gap-3 hover:bg-[#F9FAFB] transition-colors">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 ${
                item.type === "happycall" ? "bg-[#E8F3FF] text-[#1B64DA]" : item.type === "transfer" ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#FFFBEB] text-[#92400e]"
              }`}>
                {item.type === "happycall" ? "해피콜" : item.type === "transfer" ? "이관자료" : "자료수집"}
              </span>
              <Link href="/commission" className="text-[14px] font-bold text-[#191F28] hover:text-[#3182F6] truncate max-w-[220px] shrink-0">
                {item.clientName}
              </Link>
              <span className="text-[12.5px] text-[#6B7684] whitespace-nowrap shrink-0 font-[500]">{labelText}</span>
              {dayNum && (
                <span className={`text-[12px] font-bold whitespace-nowrap shrink-0 ${isUrgent ? "text-[#DC2626]" : "text-[#D97706]"}`}>
                  D+{dayNum}
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <button
                  onClick={() => setPostponeTarget({ commissionId: item.commissionId, clientName: item.clientName })}
                  className="text-[11.5px] px-2.5 py-1.5 rounded-[8px] bg-[#F9FAFB] text-[#6B7684] hover:bg-[#F2F4F6] hover:text-[#191F28] whitespace-nowrap inline-flex items-center gap-1 font-[500] transition-colors"
                  title="미루기"
                >
                  <ClockIcon width={12} height={12} />
                  미루기
                </button>
                {item.type === "datacollect" && (
                  <button
                    onClick={() => handleDataRequest(item.commissionId)}
                    disabled={isPending}
                    className="text-[11.5px] px-3 py-1.5 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] disabled:opacity-50 whitespace-nowrap font-bold transition-colors"
                  >
                    요청완료
                  </button>
                )}
                {item.type === "transfer" && (
                  <button
                    onClick={() => { startTransition(async () => { await markTransferRequested(item.commissionId); router.refresh(); }); }}
                    disabled={isPending}
                    className="text-[11.5px] px-3 py-1.5 rounded-[8px] bg-[#D97706] text-white hover:bg-[#B45309] disabled:opacity-50 whitespace-nowrap font-bold transition-colors"
                  >
                    요청완료
                  </button>
                )}
                {item.type === "happycall" && (
                  <Link href="/commission" className="text-[11.5px] px-3 py-1.5 rounded-[8px] bg-[#F9FAFB] text-[#4E5968] hover:bg-[#F2F4F6] hover:text-[#191F28] whitespace-nowrap font-bold transition-colors">
                    신규수임 →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* 미루기 모달 */}
    {postponeTarget && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPostponeTarget(null)}>
        <div className="bg-white rounded-2xl border border-[#E5E8EB] w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#191F28]">업무 미루기</h3>
            <button onClick={() => setPostponeTarget(null)} className="text-[#8B95A1] hover:text-[#4E5968] text-lg">✕</button>
          </div>
          <div className="text-sm text-[#191F28] font-[500] mb-3">{postponeTarget.clientName}</div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-[#6B7684] block mb-1">언제까지 미룰까요?</label>
              <input id="postpone-date" type="date" className="w-full bg-white border border-[#E5E8EB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7684] block mb-1">사유 (선택)</label>
              <input id="postpone-note" type="text" placeholder="예: 다음주 월요일 전화 요청" className="w-full bg-white border border-[#E5E8EB] rounded-[6px] px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPostponeTarget(null)} className="text-sm text-[#6B7684] px-3 py-1.5 rounded-[6px] hover:bg-[#F9FAFB]">취소</button>
            <button onClick={handlePostpone} disabled={isPending} className="text-sm bg-[#3182F6] text-white px-4 py-1.5 rounded-[6px] hover:bg-[#1B64DA] disabled:opacity-50">미루기</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ============ 해피콜 카드 ============
export function HappyCallCard({ items }: { items: HappyCallItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [sendingId, setSendingId] = useState<number | null>(null);
  const router = useRouter();

  function handleExclude(commissionId: number, clientName: string) {
    if (!confirm(`"${clientName}" 관리제외를 요청하시겠습니까?`)) return;
    startTransition(async () => {
      await requestExclusion(commissionId);
      router.refresh();
    });
  }

  async function handleAlimtalk(clientId: number, clientName: string) {
    if (!confirm(`"${clientName}"에게 카카오톡 안내를 발송하시겠습니까?`)) return;
    setSendingId(clientId);
    try {
      const res = await fetch("/api/alimtalk/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type: "happy_call" }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert("카카오톡 안내가 발송되었습니다");
    } catch { alert("발송 실패"); }
    finally { setSendingId(null); }
  }

  return (
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <span className="text-base">📞</span>
        <h2 className="font-[500] text-[#4E5968]">해피콜</h2>
        {items.length > 0 && (
          <span className="bg-[#93c5fd] text-[#0b0d10] text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-[#F2F4F6]">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">부재중 거래처가 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href="/commission" className="text-sm font-[500] text-[#191F28] hover:text-[#191F28] hover:underline truncate block">
                {item.clientName}
              </Link>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.noAnswerCount === 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#eff6ff] text-[#1e40af] font-[500]">1차 대기</span>
              ) : (
                Array.from({ length: item.noAnswerCount }, (_, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#6B7684] font-[500]">
                    {i + 1}차 부재중
                  </span>
                ))
              )}
              <span className="text-[10px] text-[#8B95A1]">D+{item.daysElapsed}</span>
              <button
                onClick={() => handleAlimtalk(item.clientId, item.clientName)}
                disabled={sendingId === item.clientId}
                className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#fcd34d] text-[#0b0d10] font-bold hover:bg-[#fde68a] disabled:opacity-50"
              >
                {sendingId === item.clientId ? "발송중..." : "카카오톡안내"}
              </button>
              <button
                onClick={() => handleExclude(item.commissionId, item.clientName)}
                disabled={isPending}
                className="text-[10px] px-2 py-0.5 rounded bg-[#fef2f2] text-[#dc2626] hover:bg-[rgba(239,68,68,0.18)] hover:text-[#dc2626] disabled:opacity-50"
              >
                관리제외
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 자료수집 카드 ============
export function DataCollectCard({ items }: { items: DataCollectItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [sendingId, setSendingId] = useState<number | null>(null);
  const router = useRouter();

  function handleExclude(commissionId: number, clientName: string) {
    if (!confirm(`"${clientName}" 관리제외를 요청하시겠습니까?`)) return;
    startTransition(async () => {
      await requestExclusion(commissionId);
      router.refresh();
    });
  }

  async function handleAlimtalk(clientId: number, clientName: string) {
    if (!confirm(`"${clientName}"에게 카카오톡 독촉을 발송하시겠습니까?`)) return;
    setSendingId(clientId);
    try {
      const res = await fetch("/api/alimtalk/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, type: "doc_remind" }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      alert("카카오톡 독촉이 발송되었습니다");
    } catch { alert("발송 실패"); }
    finally { setSendingId(null); }
  }

  return (
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <DownloadIcon width={16} height={16} className="text-[#4E5968]" />
        <h2 className="font-[500] text-[#4E5968]">자료수집</h2>
        {items.length > 0 && (
          <span className="bg-[#fcd34d] text-[#0b0d10] text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-[#F2F4F6]">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">자료수집 중인 거래처가 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href="/commission" className="text-sm font-[500] text-[#191F28] hover:text-[#191F28] hover:underline truncate block">
                  {item.clientName}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.requestCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#065f46] font-[500]">
                    {item.requestCount}차 요청완료
                  </span>
                )}
                <span className="text-[10px] text-[#8B95A1]">D+{item.daysFromConnect}</span>
                <button
                  onClick={() => handleAlimtalk(item.clientId, item.clientName)}
                  disabled={sendingId === item.clientId}
                  className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#fcd34d] text-[#0b0d10] font-bold hover:bg-[#fde68a] disabled:opacity-50"
                >
                  {sendingId === item.clientId ? "발송중..." : "카카오톡독촉"}
                </button>
                <button
                  onClick={() => handleExclude(item.commissionId, item.clientName)}
                  disabled={isPending}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#fef2f2] text-[#dc2626] hover:bg-[rgba(239,68,68,0.18)] hover:text-[#dc2626] disabled:opacity-50"
                >
                  관리제외
                </button>
              </div>
            </div>
            {/* 미비 자료 표시 */}
            {item.missingDocs.length > 0 && (
              <div className="flex gap-1.5 mt-1.5">
                {item.missingDocs.map(doc => (
                  <span key={doc} className="text-[10px] px-1.5 py-0.5 rounded bg-[#fef2f2] text-[#dc2626] border border-[#fca5a5]">
                    {doc} 미수령
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 관리제외요청 카드 ============
export function ExcludeRequestCard({ items }: { items: ExcludeItem[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm(commissionId: number) {
    if (!confirm("관리제외를 확정하시겠습니까?")) return;
    startTransition(async () => {
      await confirmExclusion(commissionId);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <span className="text-base">🚫</span>
        <h2 className="font-[500] text-[#4E5968]">관리제외요청</h2>
        {items.length > 0 && (
          <span className="bg-[#8a8f98] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-[#F2F4F6]">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">관리제외 요청이 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-[500] text-[#191F28] truncate">{item.clientName}</div>
              <div className="text-[10px] text-[#8B95A1]">
                {item.reason} · 전체 D+{item.daysElapsed} · <span className="text-[#dc2626] font-[500]">요청 후 D+{item.requestDays}</span>
              </div>
            </div>
            <button
              onClick={() => handleConfirm(item.commissionId)}
              disabled={isPending}
              className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#fef2f2] text-[#dc2626] hover:bg-[rgba(239,68,68,0.18)] border border-[#fca5a5] disabled:opacity-50 whitespace-nowrap"
            >
              제외 확정
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 이관자료요청 카드 ============
export type TransferItem = {
  commissionId: number;
  clientName: string;
  daysElapsed: number; // 등록일 기준
  isOverdue: boolean; // D+3 이상
};

export function TransferRequestCard({ items }: { items: TransferItem[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReceived(commissionId: number) {
    startTransition(async () => {
      await markTransferReceived(commissionId);
      router.refresh();
    });
  }

  // D+3 이상(지연)을 맨 위로
  const sorted = [...items].sort((a, b) => b.daysElapsed - a.daysElapsed);

  return (
    <div className="bg-white rounded-[14px] border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[#E5E8EB] flex items-center gap-2">
        <span className="text-base">📦</span>
        <h2 className="font-[500] text-[#4E5968]">이관자료요청</h2>
        {items.length > 0 && (
          <span className="bg-[#f59e0b] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-[#F2F4F6]">
        {sorted.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">이관 대기 중인 거래처가 없습니다</div>
        ) : sorted.map(item => (
          <div key={item.commissionId} className={`px-5 py-3 flex items-center gap-3 ${item.isOverdue ? "bg-[rgba(239,68,68,0.06)]" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-[500] text-[#191F28] truncate">{item.clientName}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-[500] ${item.isOverdue ? "text-[#dc2626]" : "text-[#8B95A1]"}`}>
                D+{item.daysElapsed}{item.isOverdue ? " 지연!" : ""}
              </span>
              <button
                onClick={() => handleReceived(item.commissionId)}
                disabled={isPending}
                className="text-[10px] px-2.5 py-1 rounded-[6px] bg-[#ecfdf5] text-[#065f46] hover:bg-[rgba(16,185,129,0.18)] border border-[rgba(16,185,129,0.25)] disabled:opacity-50 whitespace-nowrap"
              >
                수령완료
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
