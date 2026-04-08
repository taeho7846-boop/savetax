"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDataRequested, confirmExclusion, postponeTask, requestExclusion, markTransferRequested, markTransferReceived } from "@/app/actions/commission";

type HappyCallItem = {
  commissionId: number;
  clientName: string;
  noAnswerCount: number;
  lastCallAt: string; // ISO
  daysElapsed: number;
};

type DataCollectItem = {
  commissionId: number;
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">📋</span>
        <h2 className="font-medium text-gray-700">오늘의 업무</h2>
        {items.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">오늘 할 업무가 없습니다 &#x1F389;</div>
        ) : items.map((item, i) => (
          <div key={`${item.type}-${item.commissionId}-${i}`} className="px-5 py-3 flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
              item.type === "happycall" ? "bg-blue-100 text-blue-700" : item.type === "transfer" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"
            }`}>
              {item.type === "happycall" ? "해피콜" : item.type === "transfer" ? "이관자료" : "자료수집"}
            </span>
            <div className="flex-1 min-w-0">
              <Link href="/commission" className="text-sm font-medium text-gray-800 hover:text-[#1a2e4a] hover:underline truncate block">
                {item.clientName}
              </Link>
              <div className="text-[10px] text-gray-400">{item.label}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setPostponeTarget({ commissionId: item.commissionId, clientName: item.clientName })}
                className="text-[10px] px-2 py-1 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 whitespace-nowrap"
                title="미루기"
              >
                ⏰ 미루기
              </button>
              {item.type === "datacollect" && (
                <button
                  onClick={() => handleDataRequest(item.commissionId)}
                  disabled={isPending}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-[#1a2e4a] text-white hover:bg-[#243d61] disabled:opacity-50 whitespace-nowrap"
                >
                  요청완료
                </button>
              )}
              {item.type === "transfer" && (
                <button
                  onClick={() => { startTransition(async () => { await markTransferRequested(item.commissionId); router.refresh(); }); }}
                  disabled={isPending}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                >
                  요청완료
                </button>
              )}
              {item.type === "happycall" && (
                <Link href="/commission" className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap">
                  신규수임 →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* 미루기 모달 */}
    {postponeTarget && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPostponeTarget(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900">업무 미루기</h3>
            <button onClick={() => setPostponeTarget(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
          </div>
          <div className="text-sm text-[#1a2e4a] font-medium mb-3">{postponeTarget.clientName}</div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">언제까지 미룰까요?</label>
              <input id="postpone-date" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">사유 (선택)</label>
              <input id="postpone-note" type="text" placeholder="예: 다음주 월요일 전화 요청" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPostponeTarget(null)} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100">취소</button>
            <button onClick={handlePostpone} disabled={isPending} className="text-sm bg-[#1a2e4a] text-white px-4 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50">미루기</button>
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
  const router = useRouter();

  function handleExclude(commissionId: number, clientName: string) {
    if (!confirm(`"${clientName}" 관리제외를 요청하시겠습니까?`)) return;
    startTransition(async () => {
      await requestExclusion(commissionId);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">📞</span>
        <h2 className="font-medium text-gray-700">해피콜</h2>
        {items.length > 0 && (
          <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">부재중 거래처가 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href="/commission" className="text-sm font-medium text-gray-800 hover:text-[#1a2e4a] hover:underline truncate block">
                {item.clientName}
              </Link>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.noAnswerCount === 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">1차 대기</span>
              ) : (
                Array.from({ length: item.noAnswerCount }, (_, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                    {i + 1}차 부재중
                  </span>
                ))
              )}
              <span className="text-[10px] text-gray-400">D+{item.daysElapsed}</span>
              <button
                onClick={() => handleExclude(item.commissionId, item.clientName)}
                disabled={isPending}
                className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
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
  const router = useRouter();

  function handleExclude(commissionId: number, clientName: string) {
    if (!confirm(`"${clientName}" 관리제외를 요청하시겠습니까?`)) return;
    startTransition(async () => {
      await requestExclusion(commissionId);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">📥</span>
        <h2 className="font-medium text-gray-700">자료수집</h2>
        {items.length > 0 && (
          <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">자료수집 중인 거래처가 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href="/commission" className="text-sm font-medium text-gray-800 hover:text-[#1a2e4a] hover:underline truncate block">
                  {item.clientName}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.requestCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                    {item.requestCount}차 요청완료
                  </span>
                )}
                <span className="text-[10px] text-gray-400">D+{item.daysFromConnect}</span>
                <button
                  onClick={() => handleExclude(item.commissionId, item.clientName)}
                  disabled={isPending}
                  className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                >
                  관리제외
                </button>
              </div>
            </div>
            {/* 미비 자료 표시 */}
            {item.missingDocs.length > 0 && (
              <div className="flex gap-1.5 mt-1.5">
                {item.missingDocs.map(doc => (
                  <span key={doc} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200">
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">🚫</span>
        <h2 className="font-medium text-gray-700">관리제외요청</h2>
        {items.length > 0 && (
          <span className="bg-gray-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">관리제외 요청이 없습니다</div>
        ) : items.map(item => (
          <div key={item.commissionId} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{item.clientName}</div>
              <div className="text-[10px] text-gray-400">
                {item.reason} · 전체 D+{item.daysElapsed} · <span className="text-red-500 font-medium">요청 후 D+{item.requestDays}</span>
              </div>
            </div>
            <button
              onClick={() => handleConfirm(item.commissionId)}
              disabled={isPending}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50 whitespace-nowrap"
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">📦</span>
        <h2 className="font-medium text-gray-700">이관자료요청</h2>
        {items.length > 0 && (
          <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {sorted.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">이관 대기 중인 거래처가 없습니다</div>
        ) : sorted.map(item => (
          <div key={item.commissionId} className={`px-5 py-3 flex items-center gap-3 ${item.isOverdue ? "bg-red-50/50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{item.clientName}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-medium ${item.isOverdue ? "text-red-500" : "text-gray-400"}`}>
                D+{item.daysElapsed}{item.isOverdue ? " 지연!" : ""}
              </span>
              <button
                onClick={() => handleReceived(item.commissionId)}
                disabled={isPending}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 disabled:opacity-50 whitespace-nowrap"
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
