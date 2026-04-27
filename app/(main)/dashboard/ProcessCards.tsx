"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDataRequested, postponeTask, markTransferRequested, markTransferReceived } from "@/app/actions/commission";
import { ClipboardListIcon, DownloadIcon, ClockIcon, PhoneCallIcon } from "@/components/icons";

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
    <div className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center text-white">
            <ClipboardListIcon width={18} height={18} strokeWidth={2.2} />
          </div>
          <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">오늘의 업무</h2>
          {items.length > 0 && (
            <span className="text-[12px] text-[#6B7684] bg-white/60 px-2 py-0.5 rounded-full font-medium">{items.length}건</span>
          )}
        </div>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-[14px] text-[#4E5968] font-[500]">오늘 할 일을 모두 완료했어요</div>
            <div className="text-[12px] text-[#8B95A1] mt-1">깔끔하네요</div>
          </div>
        ) : items.map((item, i) => {
          const dayMatch = item.label.match(/\(D\+(\d+)\)/);
          const dayNum = dayMatch ? dayMatch[1] : null;
          const labelText = dayMatch ? item.label.replace(/\s*\(D\+\d+\)$/, "") : item.label;
          const isUrgent = dayNum && parseInt(dayNum) >= 7;
          return (
            <div key={`${item.type}-${item.commissionId}-${i}`} className="bg-white/60 hover:bg-white/80 rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors">
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
                  className="text-[11.5px] px-2.5 py-1.5 rounded-[8px] bg-white/70 text-[#6B7684] hover:bg-white hover:text-[#191F28] whitespace-nowrap inline-flex items-center gap-1 font-[500] transition-colors"
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
                  <Link href="/commission" className="text-[11.5px] px-3 py-1.5 rounded-[8px] bg-white/70 text-[#4E5968] hover:bg-white hover:text-[#191F28] whitespace-nowrap font-bold transition-colors">
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

// ============ 해피콜 미니 위젯 ============
export function HappyCallCard({ items }: { items: HappyCallItem[] }) {
  return (
    <Link href="/commission" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl gradient-emerald flex items-center justify-center text-white">
          <PhoneCallIcon width={18} height={18} strokeWidth={2.2} />
        </div>
        <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{items.length}</span>
      </div>
      <div className="text-[14px] font-bold text-[#191F28]">해피콜 대상</div>
      <div className="text-[11.5px] text-[#6B7684] mt-0.5">
        {items.length > 0 ? "확인 통화 필요" : "처리 완료"}
      </div>
    </Link>
  );
}

// ============ 자료수집 미니 위젯 ============
export function DataCollectCard({ items }: { items: DataCollectItem[] }) {
  return (
    <Link href="/commission" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl gradient-purple flex items-center justify-center text-white">
          <DownloadIcon width={18} height={18} strokeWidth={2.2} />
        </div>
        <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{items.length}</span>
      </div>
      <div className="text-[14px] font-bold text-[#191F28]">자료 수집</div>
      <div className="text-[11.5px] text-[#6B7684] mt-0.5">
        {items.length > 0 ? "미수령 자료" : "수집 완료"}
      </div>
    </Link>
  );
}

// ============ 관리제외요청 미니 위젯 ============
export function ExcludeRequestCard({ items }: { items: ExcludeItem[] }) {
  return (
    <Link href="/commission" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl gradient-rose flex items-center justify-center text-white">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{items.length}</span>
      </div>
      <div className="text-[14px] font-bold text-[#191F28]">제외 요청</div>
      <div className="text-[11.5px] text-[#6B7684] mt-0.5">
        {items.length > 0 ? "검토 대기" : "요청 없음"}
      </div>
    </Link>
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
