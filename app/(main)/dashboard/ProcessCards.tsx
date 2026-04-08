"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDataRequested, confirmExclusion } from "@/app/actions/commission";

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
  type: "happycall" | "datacollect";
  commissionId: number;
  clientName: string;
  label: string; // "해피콜 D+1", "자료수집 1차 요청"
};

type ExcludeItem = {
  commissionId: number;
  clientName: string;
  reason: string; // "해피콜 3회 부재중" | "자료수집 3회 미수령"
  daysElapsed: number;
};

// ============ 오늘의 업무 카드 ============
export function TodayTasksCard({ items }: { items: TodayTaskItem[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDataRequest(commissionId: number) {
    startTransition(async () => {
      await markDataRequested(commissionId);
      router.refresh();
    });
  }

  return (
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
          <div className="px-5 py-8 text-center text-gray-400 text-sm">오늘 할 업무가 없습니다</div>
        ) : items.map((item, i) => (
          <div key={`${item.type}-${item.commissionId}-${i}`} className="px-5 py-3 flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
              item.type === "happycall" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
            }`}>
              {item.type === "happycall" ? "해피콜" : "자료수집"}
            </span>
            <div className="flex-1 min-w-0">
              <Link href="/commission" className="text-sm font-medium text-gray-800 hover:text-[#1a2e4a] hover:underline truncate block">
                {item.clientName}
              </Link>
              <div className="text-[10px] text-gray-400">{item.label}</div>
            </div>
            {item.type === "datacollect" && (
              <button
                onClick={() => handleDataRequest(item.commissionId)}
                disabled={isPending}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-[#1a2e4a] text-white hover:bg-[#243d61] disabled:opacity-50 whitespace-nowrap"
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
        ))}
      </div>
    </div>
  );
}

// ============ 해피콜 카드 ============
export function HappyCallCard({ items }: { items: HappyCallItem[] }) {
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
              {Array.from({ length: item.noAnswerCount }, (_, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                  {i + 1}차 부재중
                </span>
              ))}
              <span className="text-[10px] text-gray-400">D+{item.daysElapsed}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 자료수집 카드 ============
export function DataCollectCard({ items }: { items: DataCollectItem[] }) {
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
              <div className="text-[10px] text-gray-400">{item.reason} · D+{item.daysElapsed}</div>
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
