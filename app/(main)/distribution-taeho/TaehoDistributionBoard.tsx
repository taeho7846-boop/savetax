"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaehoDistribution, deleteTaehoDistribution, toggleTaehoPass, permanentDeleteTaehoDistribution, restoreTaehoDistribution, assignFromSavetax } from "@/app/actions/distribution-taeho";

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
  isClientMissing?: boolean;
}

export function TaehoDistributionBoard({
  tab,
  accountants,
  distributions,
  counts,
  passUserIds,
  unassignedFromSavetax = [],
}: {
  tab: string;
  accountants: Accountant[];
  distributions: Distribution[];
  counts: Record<number, number>;
  passUserIds: number[];
  unassignedFromSavetax?: string[];
}) {
  const isCorporate = tab === "corporate";
  const isExcluded = tab === "excluded";
  const [corpInputs, setCorpInputs] = useState<string[]>(["", "", "", "", ""]);
  const [indInputs, setIndInputs] = useState<string[]>(["", "", "", "", ""]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

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
      await addTaehoDistribution(names, tab, forceUserId ?? undefined);
      setInputs(["", "", "", "", ""]);
      router.refresh();
    });
  }

  function handleDrop(userId: number) {
    if (!dragItem) return;
    startTransition(async () => {
      await assignFromSavetax(dragItem, tab, userId);
      setDragItem(null);
      setDropTarget(null);
      router.refresh();
    });
  }

  function handleDelete(id: number, name: string) {
    const reason = prompt(`'${name}' 관리제외 사유를 입력하세요 (선택사항):`, "");
    if (reason === null) return;
    startTransition(async () => {
      await deleteTaehoDistribution(id, reason || undefined);
      router.refresh();
    });
  }

  function handlePermanentDelete(id: number, name: string) {
    if (!confirm(`'${name}'을(를) 완전 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await permanentDeleteTaehoDistribution(id);
      router.refresh();
    });
  }

  function handleRestore(id: number) {
    startTransition(async () => {
      await restoreTaehoDistribution(id);
      router.refresh();
    });
  }

  function handleTogglePass(userId: number) {
    startTransition(async () => {
      await toggleTaehoPass(userId, tab);
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

  const minVisibleRows = 6;
  const totalAssigned = accountants.reduce((s, a) => s + (counts[a.id] || 0), 0);
  const passCount = passSet.size;
  const tabLabel = isCorporate ? "법인" : "개인";

  return (
    <>
      {/* 세그먼트 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="v3-seg v3-surface">
          <Link href="/distribution-taeho?tab=individual" className={tab === "individual" ? "v3-seg-on" : ""}>
            개인
          </Link>
          <Link href="/distribution-taeho?tab=corporate" className={isCorporate ? "v3-seg-on" : ""}>
            법인
          </Link>
          <Link href="/distribution-taeho?tab=excluded" className={isExcluded ? "v3-seg-on-danger" : ""}>
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
                    <td className="px-5 py-3 text-[#191F28] text-[13px] font-semibold">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{d.clientName}</span>
                        {d.isClientMissing && (
                          <span
                            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626] whitespace-nowrap"
                            title="기장대리 탭에 없는 거래처 — 삭제 후보"
                          >
                            기장 X
                          </span>
                        )}
                      </div>
                    </td>
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

      {!isExcluded && (
        <>
          {/* 입력 바 */}
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
              {unassignedFromSavetax.length > 0 && ` · 미배정 ${unassignedFromSavetax.length}건`}
            </span>
          </div>

          {/* 본문: 좌측 미배정 트레이 + 우측 칸반 */}
          <div className={`grid gap-4 ${unassignedFromSavetax.length > 0 ? "grid-cols-12" : ""}`}>

            {/* 미배정 트레이 (있을 때만) */}
            {unassignedFromSavetax.length > 0 && (
              <aside className="col-span-3">
                <div className="v3-surface rounded-2xl p-4 sticky top-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] text-[#6B7684] font-bold tracking-wider uppercase">From Savetax</div>
                    <span className="v3-chip">{unassignedFromSavetax.length}건</span>
                  </div>
                  <div className="text-[14px] font-bold mb-2 text-[#191F28]">미배정 거래처</div>
                  <div className="text-[11px] text-[#6B7684] mb-4 leading-relaxed">
                    세이브택스에서 김태호님께 배분된 거래처 중 세무회계태호에 아직 등록되지 않은 목록입니다.<br/>
                    <span className="text-[#1B64DA] font-semibold">→ 우측 컬럼으로 드래그</span>해서 배정하세요.
                  </div>
                  <div className="space-y-2">
                    {unassignedFromSavetax.map((name) => (
                      <div
                        key={name}
                        draggable
                        onDragStart={() => setDragItem(name)}
                        onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
                        className={`v3-drag ${dragItem === name ? "is-dragging" : ""}`}
                      >
                        <span className="v3-handle">⋮⋮</span>
                        <span className="flex-1 truncate">{name}</span>
                        <span className="v3-from">세이브택스</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            )}

            {/* 칸반 */}
            <div className={unassignedFromSavetax.length > 0 ? "col-span-9" : ""}>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${accountants.length}, minmax(0, 1fr))` }}
              >
                {accountants.map((a) => {
                  const isPass = passSet.has(a.id);
                  const isNext = !isPass && a.id === nextPersonId;
                  const isDragOver = dragItem !== null && dropTarget === a.id;
                  const items = byAccountant[a.id];
                  const padCount = Math.max(0, minVisibleRows - items.length);

                  return (
                    <div
                      key={a.id}
                      onDragOver={(e) => { if (dragItem) { e.preventDefault(); setDropTarget(a.id); } }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => { e.preventDefault(); handleDrop(a.id); }}
                    >
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
                      <div className={`v3-col-body ${isNext ? "is-next" : ""} ${isPass ? "is-passed" : ""} ${isDragOver ? "is-drop-over" : ""}`}>
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
                            <div
                              key={d.id}
                              className="v3-card"
                              style={d.isClientMissing ? { background: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.4)" } : undefined}
                              title={d.isClientMissing ? "기장대리 탭에 없는 거래처 — 삭제 후보" : undefined}
                            >
                              <span className="truncate flex items-center gap-1.5">
                                {d.isClientMissing && (
                                  <span className="text-[9px] font-bold text-[#DC2626] shrink-0">●</span>
                                )}
                                <span className="truncate">{d.clientName}</span>
                              </span>
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
                        {unassignedFromSavetax.length > 0 && (
                          <div className={`v3-drop ${isDragOver ? "is-active" : ""}`}>
                            {isDragOver ? "여기에 놓기" : "미배정 거래처를 여기로 드롭"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
