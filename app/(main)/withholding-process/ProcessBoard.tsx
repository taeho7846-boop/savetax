"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleProcessStep, markDNotified, updateWithholdingType } from "@/app/actions/withholding-process";

const STEPS_BY_TYPE: Record<string, string[]> = {
  A: ["급여확인요청", "급여명세서전달", "원천세신고", "납부서전달"],
  B: ["급여명세서전달", "원천세신고", "납부서전달"],
  C: ["급여명세서전달", "원천세신고"],
  D: ["최초안내발송"],
};

function getStepsForType(type: string): string[] {
  return STEPS_BY_TYPE[type] || [];
}

type ProcessRecord = {
  id: number;
  clientId: number;
  yearMonth: string;
  step: string;
  done: boolean;
  doneAt: Date | null;
};

type Client = {
  id: number;
  name: string;
  withholdingType: string | null;
  withholdingDNotified: boolean;
  laborTypes: string | null;
  assignedUser?: { name: string } | null;
  withholdingProcesses: ProcessRecord[];
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
  A: {
    label: "유형 A",
    color: "text-[#1B64DA]",
    bg: "bg-[#F5F9FF]",
    border: "border-[#A3CAFD]",
    description: "매월 변동",
  },
  B: {
    label: "유형 B",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    description: "매월 동일, 납부서 필요",
  },
  C: {
    label: "유형 C",
    color: "text-[#B45309]",
    bg: "bg-[#FFFBEB]",
    border: "border-[#FDE68A]",
    description: "매월 동일, 납부서 불필요",
  },
  D: {
    label: "유형 D",
    color: "text-[#4E5968]",
    bg: "bg-[#F9FAFB]",
    border: "border-[#E5E8EB]",
    description: "1인사업자 (원천세 없음)",
  },
};

const STEP_LABELS: Record<string, { label: string; icon: string }> = {
  급여확인요청: { label: "급여 확인 요청", icon: "📋" },
  급여명세서전달: { label: "급여명세서 전달", icon: "📄" },
  원천세신고: { label: "원천세 신고", icon: "📝" },
  납부서전달: { label: "납부서 전달", icon: "💳" },
  최초안내발송: { label: "최초 안내 발송", icon: "📨" },
};

export function ProcessBoard({
  clients,
  yearMonth,
  showAssignedUser,
  unclassifiedCount,
}: {
  clients: Client[];
  yearMonth: string;
  showAssignedUser: boolean;
  unclassifiedCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const [year, month] = yearMonth.split("-").map(Number);

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/withholding-process?ym=${ym}`);
  }

  // 검색 필터
  const filtered = clients.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  // 유형별 그룹
  const groups: Record<string, Client[]> = { A: [], B: [], C: [], D: [] };
  for (const c of filtered) {
    const type = c.withholdingType;
    if (type && groups[type]) {
      groups[type].push(c);
    }
  }

  // D 유형: 미안내 / 안내완료 분리
  const dNotNotified = groups.D.filter((c) => !c.withholdingDNotified);
  const dNotified = groups.D.filter((c) => c.withholdingDNotified);

  function handleToggle(clientId: number, step: string) {
    startTransition(async () => {
      await toggleProcessStep(clientId, yearMonth, step);
    });
  }

  function handleDNotify(clientId: number) {
    startTransition(async () => {
      await markDNotified(clientId, yearMonth);
    });
  }

  // 전체 진행률
  const totalSteps = filtered.reduce((sum, c) => {
    if (c.withholdingType === "D") return sum + (c.withholdingDNotified ? 0 : 1);
    return sum + getStepsForType(c.withholdingType || "").length;
  }, 0);
  const doneSteps = filtered.reduce((sum, c) => {
    if (c.withholdingType === "D") return sum + (c.withholdingDNotified ? 0 : (c.withholdingProcesses.some(p => p.step === "최초안내발송" && p.done) ? 1 : 0));
    const steps = getStepsForType(c.withholdingType || "");
    return sum + steps.filter((s) => c.withholdingProcesses.some((p) => p.step === s && p.done)).length;
  }, 0);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-[#191F28]">원천세 프로세스</h1>
          <div className="flex items-center gap-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-1">
            <button onClick={() => navigate(-1)} className="px-2 py-1 text-[#6B7684] hover:text-[#191F28] text-sm">
              ◀
            </button>
            <span className="text-sm font-bold text-[#191F28] px-2">
              {year}년 {month}월
            </span>
            <button onClick={() => navigate(1)} className="px-2 py-1 text-[#6B7684] hover:text-[#191F28] text-sm">
              ▶
            </button>
          </div>
          <span className="text-xs text-[#6B7684]">
            진행: {doneSteps} / {totalSteps}
          </span>
          {isPending && <span className="text-xs text-[#3182F6] animate-pulse">저장 중...</span>}
        </div>
        <div className="flex items-center gap-2">
          {unclassifiedCount > 0 && (
            <span className="text-xs text-[#D97706] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-2 py-1">
              유형 미지정 거래처 {unclassifiedCount}개
            </span>
          )}
          <input
            type="text"
            placeholder="거래처 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-[#3182F6]"
          />
        </div>
      </div>

      {/* 유형별 섹션 */}
      {(["A", "B", "C"] as const).map((type) => {
        const typeClients = groups[type];
        if (typeClients.length === 0) return null;
        const config = TYPE_CONFIG[type];
        const steps = getStepsForType(type);

        // 그룹 진행률
        const groupTotal = typeClients.length * steps.length;
        const groupDone = typeClients.reduce(
          (sum, c) => sum + steps.filter((s) => c.withholdingProcesses.some((p) => p.step === s && p.done)).length,
          0
        );

        return (
          <div key={type} className={`rounded-xl border ${config.border} overflow-hidden`}>
            {/* 그룹 헤더 */}
            <div className={`${config.bg} px-4 py-2.5 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${config.color}`}>{config.label}</span>
                <span className="text-xs text-[#6B7684]">{config.description}</span>
                <span className="text-xs text-[#8B95A1]">({typeClients.length}개)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-[#6B7684]">
                  {steps.map((s) => (
                    <span key={s} className="flex items-center gap-0.5">
                      {STEP_LABELS[s]?.icon} {STEP_LABELS[s]?.label}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-medium text-[#6B7684] ml-2">
                  {groupDone}/{groupTotal}
                </span>
              </div>
            </div>

            {/* 거래처 목록 */}
            <div className="divide-y divide-[#F2F4F6] bg-white">
              {typeClients.map((client) => {
                const allDone = steps.every((s) =>
                  client.withholdingProcesses.some((p) => p.step === s && p.done)
                );

                return (
                  <div
                    key={client.id}
                    className={`flex items-center px-4 py-2.5 gap-4 transition-colors ${
                      allDone ? "bg-[#F1FBF4]/50" : "hover:bg-[#F9FAFB]"
                    }`}
                  >
                    {/* 거래처명 */}
                    <div className="w-40 flex-shrink-0">
                      <span className={`text-sm font-medium ${allDone ? "text-[#15803D]" : "text-[#191F28]"}`}>
                        {allDone && "✓ "}{client.name}
                      </span>
                      {showAssignedUser && client.assignedUser && (
                        <span className="text-xs text-[#8B95A1] ml-1">
                          ({client.assignedUser.name})
                        </span>
                      )}
                    </div>

                    {/* 노무유형 뱃지 */}
                    <div className="w-32 flex-shrink-0 flex gap-1 flex-wrap">
                      {client.laborTypes?.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[#F2F4F6] text-[#4E5968]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* 단계별 체크리스트 */}
                    <div className="flex-1 flex items-center gap-3">
                      {steps.map((step, idx) => {
                        const record = client.withholdingProcesses.find(
                          (p) => p.step === step
                        );
                        const done = record?.done ?? false;
                        // 이전 단계가 완료되지 않으면 비활성화
                        const prevDone =
                          idx === 0 ||
                          client.withholdingProcesses.some(
                            (p) => p.step === steps[idx - 1] && p.done
                          );

                        return (
                          <label
                            key={step}
                            className={`flex items-center gap-1.5 cursor-pointer select-none ${
                              !prevDone ? "opacity-40 pointer-events-none" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => handleToggle(client.id, step)}
                              className="accent-[#3182F6] w-4 h-4"
                            />
                            <span
                              className={`text-xs ${
                                done ? "text-[#16A865] line-through" : "text-[#333D4B]"
                              }`}
                            >
                              {STEP_LABELS[step]?.icon} {STEP_LABELS[step]?.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 유형 D 섹션 */}
      {(dNotNotified.length > 0 || dNotified.length > 0) && (
        <div className={`rounded-xl border ${TYPE_CONFIG.D.border} overflow-hidden`}>
          <div className={`${TYPE_CONFIG.D.bg} px-4 py-2.5 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${TYPE_CONFIG.D.color}`}>{TYPE_CONFIG.D.label}</span>
              <span className="text-xs text-[#6B7684]">{TYPE_CONFIG.D.description}</span>
              <span className="text-xs text-[#8B95A1]">({groups.D.length}개)</span>
            </div>
          </div>

          <div className="bg-white">
            {/* 미안내 */}
            {dNotNotified.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-[#FEF2F2] border-b border-red-100">
                  <span className="text-xs font-bold text-[#DC2626]">
                    미안내 ({dNotNotified.length}개)
                  </span>
                </div>
                <div className="divide-y divide-[#F2F4F6]">
                  {dNotNotified.map((client) => (
                    <div key={client.id} className="flex items-center px-4 py-2.5 gap-4 hover:bg-[#F9FAFB]">
                      <div className="w-40 flex-shrink-0">
                        <span className="text-sm font-medium text-[#191F28]">{client.name}</span>
                        {showAssignedUser && client.assignedUser && (
                          <span className="text-xs text-[#8B95A1] ml-1">
                            ({client.assignedUser.name})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDNotify(client.id)}
                        className="text-xs bg-[#3182F6] text-white px-3 py-1 rounded-lg hover:bg-[#1B64DA] transition-colors"
                      >
                        📨 최초 안내 발송 완료
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 안내 완료 */}
            {dNotified.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-[#F1FBF4] border-b border-green-100">
                  <span className="text-xs font-bold text-[#16A865]">
                    안내 완료 ({dNotified.length}개)
                  </span>
                </div>
                <div className="divide-y divide-[#F2F4F6]">
                  {dNotified.map((client) => (
                    <div key={client.id} className="flex items-center px-4 py-2.5 gap-4 text-[#8B95A1]">
                      <div className="w-40 flex-shrink-0">
                        <span className="text-sm">✓ {client.name}</span>
                        {showAssignedUser && client.assignedUser && (
                          <span className="text-xs ml-1">
                            ({client.assignedUser.name})
                          </span>
                        )}
                      </div>
                      <span className="text-xs">안내 발송 완료 — 변동 시에만 처리</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-[#8B95A1]">
          <p className="text-sm">원천세 유형이 지정된 거래처가 없습니다.</p>
          <p className="text-xs mt-1">고객사 편집에서 원천세 유형(A/B/C/D)을 지정해주세요.</p>
        </div>
      )}
    </div>
  );
}
