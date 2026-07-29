"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeInsuranceStep, undoInsuranceStep, type InsuranceStep } from "@/app/actions/insurance";
import { UsersIcon } from "@/components/icons";

export type InsuranceItem = {
  id: number;
  clientName: string;
  reportType: string; // acquisition | loss
  employeeName: string | null;
  hireDate: string | null;
  leaveDate: string | null;
  lossReason: string | null;
  jobCertNeeded: boolean;
  requestedDate: string | null;
  requestedBy: string | null;
  filedDate: string | null;
  filedBy: string | null;
  confirmedDate: string | null;
  confirmedBy: string | null;
};

const STEPS: { key: InsuranceStep; label: string }[] = [
  { key: "requested", label: "요청" },
  { key: "filed", label: "신고" },
  { key: "confirmed", label: "확인" },
];

function fmtDate(d: string | null) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

function stepDate(item: InsuranceItem, step: InsuranceStep) {
  return item[`${step}Date`] as string | null;
}
function stepBy(item: InsuranceItem, step: InsuranceStep) {
  return item[`${step}By`] as string | null;
}

export function InsuranceCard({ items }: { items: InsuranceItem[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function complete(id: number, step: InsuranceStep) {
    startTransition(async () => {
      await completeInsuranceStep(id, step);
      router.refresh();
    });
  }

  function undo(id: number, step: InsuranceStep, label: string) {
    if (!confirm(`'${label}' 단계를 취소할까요?`)) return;
    startTransition(async () => {
      await undoInsuranceStep(id, step);
      router.refresh();
    });
  }

  const chip = "text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap";

  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl gradient-emerald flex items-center justify-center text-white">
          <UsersIcon width={18} height={18} strokeWidth={2.2} />
        </div>
        <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">취득 · 상실 신고</h2>
        {items.length > 0 && (
          <span className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-[#E8F3FF] text-[#1B64DA] font-bold">
            진행중 {items.length}
          </span>
        )}
        <span className="ml-auto text-[11.5px] text-[#8B95A1]">거래처 수정 모달 &gt; 원천세 탭에서 등록</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-[#8B95A1] text-[13px]">진행 중인 취득·상실 신고가 없어요</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isAcq = item.reportType === "acquisition";
            const nextIdx = STEPS.findIndex((s) => !stepDate(item, s.key));
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 flex-wrap bg-white/60 rounded-2xl px-4 py-3"
              >
                {isAcq ? (
                  <span className={`${chip} bg-[#E8F3FF] text-[#1B64DA]`}>취득</span>
                ) : (
                  <span className={`${chip} bg-[#FEF3C7] text-[#B45309]`}>상실</span>
                )}
                <span className="text-[13.5px] font-bold text-[#191F28]">{item.clientName}</span>
                <span className="text-[13px] text-[#4E5968]">{item.employeeName || "이름 미입력"}</span>
                {isAcq && item.hireDate && (
                  <span className="text-[11.5px] text-[#8B95A1]">입사 {fmtDate(item.hireDate)}</span>
                )}
                {!isAcq && item.leaveDate && (
                  <span className="text-[11.5px] text-[#8B95A1]">퇴사 {fmtDate(item.leaveDate)}</span>
                )}
                {!isAcq && item.lossReason && (
                  <span className="text-[11.5px] text-[#8B95A1]">{item.lossReason}</span>
                )}
                {!isAcq && item.jobCertNeeded && (
                  <span className={`${chip} bg-[#F5F3FF] text-[#6D28D9]`}>이직확인서</span>
                )}

                {/* 3단계: 요청 → 신고 → 확인 */}
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                  {STEPS.map((s, i) => {
                    const date = stepDate(item, s.key);
                    const by = stepBy(item, s.key);
                    const done = !!date;
                    const isNext = i === nextIdx;
                    return (
                      <div key={s.key} className="flex items-center gap-1.5">
                        {i > 0 && <div className={`w-3 h-px ${done || isNext ? "bg-[#B5D4F4]" : "bg-[#E5E8EB]"}`} />}
                        {done ? (
                          <button
                            type="button"
                            disabled={isPending}
                            title={`${s.label} 완료 ${fmtDate(date)}${by ? ` · ${by}` : ""} — 클릭하면 취소`}
                            onClick={() => undo(item.id, s.key, s.label)}
                            className="flex items-center gap-1 text-[11.5px] font-bold text-white bg-[#3182F6] hover:bg-[#1B64DA] rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                            {s.label} {fmtDate(date)}
                          </button>
                        ) : isNext ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => complete(item.id, s.key)}
                            className="text-[11.5px] font-bold text-[#3182F6] border border-[#3182F6] bg-[#E8F3FF]/60 hover:bg-[#E8F3FF] rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                          >
                            {s.label} 완료
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-[#B0B8C1] border border-[#E5E8EB] rounded-full px-2.5 py-1">
                            {s.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
