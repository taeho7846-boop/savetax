"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDistribution, deleteDistribution, togglePass, permanentDeleteDistribution, restoreDistribution } from "@/app/actions/distribution";

interface Accountant {
  id: number;
  name: string;
}

interface Distribution {
  id: number;
  clientName: string;
  clientType: string;
  assignedUserId: number;
  assignedUser: { name: string };
  isSkipped: boolean;
  excludeReason: string | null;
  createdAt: Date;
}

export function DistributionBoard({
  tab,
  accountants,
  distributions,
  counts,
  passUserIds,
}: {
  tab: string;
  accountants: Accountant[];
  distributions: Distribution[];
  counts: Record<number, number>;
  passUserIds: number[];
}) {
  const isCorporate = tab === "corporate";
  const isExcluded = tab === "excluded";
  const [corpInputs, setCorpInputs] = useState<string[]>(["", "", "", "", ""]);
  const [indInputs, setIndInputs] = useState<string[]>(["", "", "", "", ""]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const inputs = isCorporate ? corpInputs : indInputs;
  const setInputs = isCorporate ? setCorpInputs : setIndInputs;
  const [forceUserId, setForceUserId] = useState<number | null>(null);
  const passSet = new Set(passUserIds);

  function updateInput(idx: number, val: string) {
    setInputs((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function handleAdd() {
    const names = inputs.filter((n) => n.trim());
    if (names.length === 0) return;

    startTransition(async () => {
      await addDistribution(names, tab, forceUserId ?? undefined);
      setInputs(["", "", "", "", ""]);
      router.refresh();
    });
  }

  function handleDelete(id: number, name: string) {
    const reason = prompt(`'${name}' 관리제외 사유를 입력하세요 (선택사항):`, "");
    if (reason === null) return;
    startTransition(async () => {
      await deleteDistribution(id, reason || undefined);
      router.refresh();
    });
  }

  function handlePermanentDelete(id: number, name: string) {
    if (!confirm(`'${name}'을(를) 완전 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await permanentDeleteDistribution(id);
      router.refresh();
    });
  }

  function handleRestore(id: number) {
    startTransition(async () => {
      await restoreDistribution(id);
      router.refresh();
    });
  }

  function handleTogglePass(userId: number) {
    startTransition(async () => {
      await togglePass(userId, tab);
      router.refresh();
    });
  }

  // 세무사별 거래처 그룹핑
  const byAccountant: Record<number, Distribution[]> = {};
  for (const a of accountants) byAccountant[a.id] = [];
  for (const d of distributions) {
    if (byAccountant[d.assignedUserId]) byAccountant[d.assignedUserId].push(d);
  }

  // 다음 차례 계산: PASS 아닌 사람 중 counts 최소
  const eligible = accountants.filter(a => !passSet.has(a.id));
  const minCount = eligible.length > 0 ? Math.min(...eligible.map(a => counts[a.id] || 0)) : 0;
  const nextPersonId = eligible.find(a => (counts[a.id] || 0) === minCount)?.id ?? null;

  // 카드 채울 빈 슬롯 (UI 정렬용, 최소 6개 보이게)
  const minVisibleRows = 6;

  const totalAssigned = accountants.reduce((s, a) => s + (counts[a.id] || 0), 0);
  const passCount = passSet.size;

  const tabLabel = isCorporate ? "법인" : "개인";

  return (
    <>
      {/* 세그먼트 (개인/법인/관리제외) */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="v3-seg v3-surface">
          <Link href="/distribution?tab=individual" className={tab === "individual" ? "v3-seg-on" : ""}>
            개인
          </Link>
          <Link href="/distribution?tab=corporate" className={isCorporate ? "v3-seg-on" : ""}>
            법인
          </Link>
          <Link href="/distribution?tab=excluded" className={isExcluded ? "v3-seg-on-danger" : ""}>
            관리제외
          </Link>
        </div>
      </div>

      {/* 관리제외 탭 */}
      {isExcluded && (
        <div className="v3-surface rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/40 border-b border-[#F2F4F6]">
              <tr>
                <th className="text-left px-5 py-3 text-[10.5px] font-bold text-[#6B7684] uppercase tracking-wider">거래처명</th>
                <th className="text-center px-3 py-3 text-[10.5px] font-bold text-[#6B7684] uppercase tracking-wider">구분</th>
                <th className="text-center px-3 py-3 text-[10.5px] font-bold text-[#6B7684] uppercase tracking-wider">담당자</th>
                <th className="text-left px-3 py-3 text-[10.5px] font-bold text-[#6B7684] uppercase tracking-wider">제외 사유</th>
                <th className="text-center px-3 py-3 text-[10.5px] font-bold text-[#6B7684] uppercase tracking-wider w-32">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F6]">
              {distributions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-[#8B95A1] text-sm">관리제외 거래처가 없습니다</td>
                </tr>
              ) : (
                distributions.map((d) => (
                  <tr key={d.id} className="hover:bg-white/40 transition">
                    <td className="px-5 py-3 text-[#191F28] text-[13px] font-semibold">{d.clientName}</td>
                    <td className="px-3 py-3 text-center text-[11.5px] text-[#6B7684]">
                      {d.clientType.includes("corporate") ? "법인" : "개인"}
                    </td>
                    <td className="px-3 py-3 text-center text-[12px] text-[#4E5968] font-semibold">{d.assignedUser.name}</td>
                    <td className="px-3 py-3 text-[#6B7684] text-[11.5px]">{d.excludeReason || "-"}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => handleRestore(d.id)}
                          disabled={isPending}
                          className="text-[11.5px] text-[#3182F6] hover:underline font-semibold"
                        >
                          복원
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(d.id, d.clientName)}
                          disabled={isPending}
                          className="text-[11.5px] text-[#E02E2E] hover:underline font-semibold"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 입력 바 + 다음 차례 안내 (관리제외 아닐 때) */}
      {!isExcluded && (
        <>
          <div className="v3-surface rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="text-[12.5px] font-semibold text-[#333D4B]">
                거래처 추가 <span className="text-[#6B7684] font-normal">· {tabLabel} · 최대 5건 · </span>
                <span className="v3-kbd">Enter</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={forceUserId ?? ""}
                  onChange={(e) => setForceUserId(e.target.value ? Number(e.target.value) : null)}
                  className="v3-surface-soft rounded-lg px-3 py-1.5 text-[12px] font-medium outline-none cursor-pointer"
                >
                  <option value="">자동 배분 (라운드 로빈)</option>
                  {accountants.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} 지정</option>
                  ))}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={isPending || inputs.every((n) => !n.trim())}
                  className="v3-btn-brand"
                >
                  {isPending ? "추가중..." : "추가"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {inputs.map((val, i) => (
                <input
                  key={i}
                  value={val}
                  onChange={(e) => updateInput(i, e.target.value)}
                  placeholder={`거래처 ${i + 1}`}
                  className="v3-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                />
              ))}
            </div>
          </div>

          {/* 다음 차례 안내 */}
          <div className="flex items-center gap-2.5 text-[12.5px] text-[#4E5968] mb-4 flex-wrap">
            {nextPersonId !== null ? (
              <>
                <span className="v3-dot v3-breathe"></span>
                <span>
                  다음 차례 <strong className="text-[#1B64DA] font-bold">{accountants.find(a => a.id === nextPersonId)?.name}</strong>
                  {" · "}{minCount}건으로 가장 적음
                </span>
              </>
            ) : (
              <span className="text-[#E02E2E] font-semibold">⚠ 모든 세무사가 PASS 상태입니다</span>
            )}
            <span className="ml-auto text-[11.5px] text-[#6B7684]">
              총 {totalAssigned}건 · 평균 {accountants.length > 0 ? Math.round(totalAssigned / accountants.length) : 0}건/명
              {passCount > 0 && ` · PASS ${passCount}명`}
            </span>
          </div>

          {/* 칸반 보드 */}
          <div className="grid grid-cols-4 gap-3">
            {accountants.map((a) => {
              const isPass = passSet.has(a.id);
              const isNext = !isPass && a.id === nextPersonId;
              const items = byAccountant[a.id];
              const padCount = Math.max(0, minVisibleRows - items.length);

              return (
                <div key={a.id}>
                  <div className={`v3-col-head v3-lift ${isNext ? "is-next" : ""} ${isPass ? "is-passed" : ""}`}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className={`v3-ini ${isPass ? "is-danger" : ""}`}>{a.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[14px] font-bold flex items-center gap-1.5 ${isPass ? "text-[#E02E2E]" : "text-[#191F28]"}`}>
                          {a.name}
                          {isNext && <span className="v3-dot"></span>}
                        </div>
                        <div className={`text-[10.5px] v3-tabular ${isPass ? "text-[#E02E2E] font-medium v3-breathe" : isNext ? "text-[#1B64DA] font-bold" : "text-[#6B7684]"}`}>
                          {counts[a.id] || 0}건{isPass ? " · 배정 일시 정지" : isNext ? " · 다음 차례" : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => handleTogglePass(a.id)}
                        disabled={isPending}
                        className={`v3-toggle ${isPass ? "on on-danger" : ""}`}
                        aria-label={`PASS ${isPass ? "ON" : "OFF"}`}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`v3-chip ${isPass ? "v3-chip-danger" : isNext ? "v3-chip-next" : ""}`}>
                        {isPass ? "PASS ON" : isNext ? "NEXT" : "PASS OFF"}
                      </span>
                      <span className="text-[10.5px] text-[#6B7684]">{tabLabel}</span>
                    </div>
                  </div>
                  <div className={`v3-col-body ${isNext ? "is-next" : ""} ${isPass ? "is-passed" : ""}`}>
                    {items.map((d) =>
                      d.isSkipped ? (
                        <div key={d.id} className="v3-card is-pass">
                          PASS
                          <button
                            onClick={() => handleDelete(d.id, "PASS")}
                            className="v3-x"
                            aria-label="PASS 삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div key={d.id} className="v3-card">
                          <span className="truncate">{d.clientName}</span>
                          <button
                            onClick={() => handleDelete(d.id, d.clientName)}
                            className="v3-x"
                            aria-label="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    )}
                    {Array.from({ length: padCount }).map((_, i) => (
                      <div key={`pad-${i}`} className="v3-card is-empty">—</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
