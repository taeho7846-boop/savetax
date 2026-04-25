"use client";

import { useState, useRef, useEffect, useTransition, createContext, useContext, type ReactNode, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markTransferReceived } from "@/app/actions/commission";
import { TransferDocsCard } from "./TransferDocsCard";

type CmsClient = { id: number; name: string; phone: string | null; bankName: string | null; bankAccount: string | null };
type TransferItem = { commissionId: number; clientName: string; daysElapsed: number; isOverdue: boolean };

// ========== 단일 hover 상태 컨텍스트 ==========
// 여러 Pill 중 동시에 하나만 열리도록 제어
type PillCtx = {
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
};
const PillContext = createContext<PillCtx>({ openId: null, setOpenId: () => {} });

function Pill({
  id,
  label,
  count,
  tone,
  children,
}: {
  id: string;
  label: string;
  count: number;
  tone: "blue" | "amber" | "red" | "neutral";
  children: ReactNode;
}) {
  const { openId, setOpenId } = useContext(PillContext);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = openId === id;

  function enter() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpenId(id); // 다른 pill 자동으로 닫힘
  }
  function leave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // 다른 Pill이 이미 열렸으면 건드리지 않음 (잔상 방지)
      setOpenId((cur) => (cur === id ? null : cur));
    }, 120);
  }

  const countColor =
    count === 0
      ? "text-[#8B95A1] bg-[#F2F4F6]"
      : tone === "red"
      ? "text-[#DC2626] bg-[#FEF2F2]"
      : tone === "amber"
      ? "text-[#D97706] bg-[#FFFBEB]"
      : tone === "blue"
      ? "text-[#1B64DA] bg-[#E8F3FF]"
      : "text-[#4E5968] bg-[#F2F4F6]";

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] transition-colors cursor-default ${
          count > 0 ? "hover:bg-[#F9FAFB]" : "opacity-60"
        }`}
      >
        <span className="text-[12.5px] text-[#4E5968] font-[500]">{label}</span>
        <span className={`text-[11.5px] font-bold px-1.5 py-0.5 rounded-full ${countColor}`}>
          {count}
        </span>
      </div>
      {open && count > 0 && (
        <div
          className="absolute top-full right-0 mt-2 w-[400px] bg-white rounded-[14px] border border-[#E5E8EB] shadow-[0_8px_24px_rgba(0,0,0,0.08)] z-50 overflow-hidden"
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CmsPopover({
  prevClients,
  currentClients,
  nextClients,
}: {
  prevClients: CmsClient[];
  currentClients: CmsClient[];
  nextClients: CmsClient[];
}) {
  return (
    <div>
      <div className="px-4 py-3 border-b border-[#F2F4F6]">
        <div className="text-[13px] font-bold text-[#191F28]">CMS 등록요망</div>
        <div className="text-[11px] text-[#8B95A1] mt-0.5">계좌 미등록 고객사 — 클릭해서 입력</div>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        {[
          { group: prevClients, label: "과거", tone: "text-[#DC2626]" },
          { group: currentClients, label: "당월", tone: "text-[#D97706]" },
          { group: nextClients, label: "다음달", tone: "text-[#1B64DA]" },
        ].map(
          ({ group, label, tone }) =>
            group.length > 0 && (
              <div key={label} className="border-b border-[#F2F4F6] last:border-0">
                <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 bg-[#F9FAFB] sticky top-0">
                  <span className={`text-[11px] font-bold ${tone}`}>{label}</span>
                  <span className="text-[11px] text-[#8B95A1]">{group.length}건</span>
                </div>
                {group.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}/edit`}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-[500] text-[#191F28] truncate">{c.name}</div>
                      <div className="text-[10.5px] text-[#8B95A1] truncate">{c.phone ?? "연락처 없음"}</div>
                    </div>
                    <span className="text-[10px] text-[#3182F6] shrink-0 font-bold">입력 →</span>
                  </Link>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
}

// ========== 이관 수신 — 클릭 시 모달로 전체 기능 (일치율/복사/건너뛰기 등) ==========
type TransferFile = {
  id: string;
  name: string;
  isFolder: boolean;
  modifiedTime: string;
  webViewLink: string;
  confirmed: boolean;
};

function TransferIncomingPill() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/transfer-docs")
      .then((r) => r.json())
      .then((data) => {
        setCount((data.pending || []).filter((f: TransferFile) => !f.confirmed).length);
      })
      .catch(() => {});
  }, [open]); // 모달 닫힐 때 갱신

  const countColor =
    count === 0
      ? "text-[#8B95A1] bg-[#F2F4F6]"
      : "text-[#1B64DA] bg-[#E8F3FF]";

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] transition-colors ${
            count > 0 ? "hover:bg-[#F9FAFB]" : "opacity-60"
          }`}
        >
          <span className="text-[12.5px] text-[#4E5968] font-[500]">이관 수신</span>
          <span className={`text-[11.5px] font-bold px-1.5 py-0.5 rounded-full ${countColor}`}>
            {count}
          </span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] pb-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-[720px] mx-4">
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-[14px] font-bold flex items-center gap-1.5"
            >
              닫기 ✕
            </button>
            <TransferDocsCard />
          </div>
        </div>
      )}
    </>
  );
}

function TransferRequestPopover({ items }: { items: TransferItem[] }) {
  const [pending, setPending] = useState<number | null>(null);
  const router = useRouter();

  async function handleReceived(commissionId: number) {
    setPending(commissionId);
    await markTransferReceived(commissionId);
    router.refresh();
    setPending(null);
  }

  const sorted = [...items].sort((a, b) => b.daysElapsed - a.daysElapsed);

  return (
    <div>
      <div className="px-4 py-3 border-b border-[#F2F4F6]">
        <div className="text-[13px] font-bold text-[#191F28]">이관자료 요청</div>
        <div className="text-[11px] text-[#8B95A1] mt-0.5">수령하면 완료 처리해주세요</div>
      </div>
      <div className="max-h-[360px] overflow-y-auto divide-y divide-[#F2F4F6]">
        {sorted.map((t) => (
          <div
            key={t.commissionId}
            className={`flex items-center gap-2 px-4 py-2.5 ${t.isOverdue ? "bg-[#FEF2F2]/40" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-[500] text-[#191F28] truncate">{t.clientName}</div>
              <div className={`text-[10.5px] font-bold ${t.isOverdue ? "text-[#DC2626]" : "text-[#D97706]"}`}>
                D+{t.daysElapsed}
                {t.isOverdue ? " 지연" : ""}
              </div>
            </div>
            <button
              onClick={() => handleReceived(t.commissionId)}
              disabled={pending === t.commissionId}
              className="text-[11px] px-2.5 py-1 rounded-[8px] bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0] border border-[#BBF7D0] disabled:opacity-50 font-bold whitespace-nowrap shrink-0"
            >
              {pending === t.commissionId ? "처리중..." : "수령완료"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionPopover({ ids }: { ids: number[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmAll() {
    if (pending) return;
    startTransition(async () => {
      await fetch("/api/distribution/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-[#F2F4F6]">
        <div className="text-[13px] font-bold text-[#191F28]">신규 거래처 배분</div>
        <div className="text-[11px] text-[#8B95A1] mt-0.5">확인 필요한 건</div>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-[12.5px] text-[#4E5968]">
          새로 배분된 거래처 <span className="font-bold text-[#3182F6]">{ids.length}건</span>이 있어요
        </div>
        <div className="flex gap-2">
          <Link
            href="/distribution"
            className="flex-1 text-center text-[11.5px] py-2 rounded-[8px] bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB] font-bold transition-colors"
          >
            배분 탭 보기
          </Link>
          <button
            onClick={confirmAll}
            disabled={pending}
            className="flex-1 text-[11.5px] py-2 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] disabled:opacity-50 font-bold transition-colors"
          >
            {pending ? "확인중..." : "전체 확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopStripPills({
  cmsPrev,
  cmsCurrent,
  cmsNext,
  transferItems,
  distributionIds,
}: {
  cmsPrev: CmsClient[];
  cmsCurrent: CmsClient[];
  cmsNext: CmsClient[];
  transferItems: TransferItem[];
  distributionIds: number[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const cmsTotal = cmsPrev.length + cmsCurrent.length + cmsNext.length;

  return (
    <PillContext.Provider value={{ openId, setOpenId }}>
      <div className="flex items-center gap-0.5 flex-wrap">
        <Pill id="cms" label="CMS 등록" count={cmsTotal} tone={cmsPrev.length > 0 ? "red" : "amber"}>
          <CmsPopover prevClients={cmsPrev} currentClients={cmsCurrent} nextClients={cmsNext} />
        </Pill>
        <TransferIncomingPill />
        <Pill
          id="transfer-request"
          label="이관 요청"
          count={transferItems.length}
          tone={transferItems.some((t) => t.isOverdue) ? "red" : "amber"}
        >
          <TransferRequestPopover items={transferItems} />
        </Pill>
        <Pill id="distribution" label="신규 배분" count={distributionIds.length} tone="blue">
          <DistributionPopover ids={distributionIds} />
        </Pill>
      </div>
    </PillContext.Provider>
  );
}
