"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeInsuranceStep, undoInsuranceStep, type InsuranceStep } from "@/app/actions/insurance";
import { UsersIcon } from "@/components/icons";

export type InsuranceItem = {
  id: number;
  clientId: number;
  clientName: string;
  reportType: string; // acquisition | loss
  workerType: string | null; // 근로 | 사업 | 일용 (취득)
  employeeName: string | null;
  hireDate: string | null;
  leaveDate: string | null;
  lossReason: string | null;
  jobCertNeeded: boolean;
  residentNumber: string | null;
  insurances: string | null;
  baseSalary: number | null;
  mealAllowance: number | null;
  carAllowance: number | null;
  researchAllowance: number | null;
  memo: string | null;
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

function money(n: number | null) {
  return n != null ? `${n.toLocaleString()}원` : "—";
}

function stepDate(item: InsuranceItem, step: InsuranceStep) {
  return item[`${step}Date`] as string | null;
}
function stepBy(item: InsuranceItem, step: InsuranceStep) {
  return item[`${step}By`] as string | null;
}

// 카테고리: 근로만 4대보험 '취득/상실'이 맞고, 사업·일용은 인원 등록이므로 유형명 그대로 노출
function categoryOf(item: InsuranceItem): { label: string; cls: string } {
  if (item.reportType === "loss") return { label: "상실", cls: "bg-[#FEF3C7] text-[#B45309]" };
  if (item.workerType === "사업") return { label: "사업", cls: "bg-[#F5F3FF] text-[#6D28D9]" };
  if (item.workerType === "일용") return { label: "일용", cls: "bg-[#F1FBF4] text-[#15803D]" };
  return { label: "취득", cls: "bg-[#E8F3FF] text-[#1B64DA]" };
}

// 위하고 입력에 필요한 상세 항목 (유형별)
function detailItems(item: InsuranceItem): [string, string][] {
  const isAcq = item.reportType === "acquisition";
  const items: [string, string][] = [["주민등록번호", item.residentNumber || "—"]];
  if (isAcq && item.workerType === "사업") {
    items.push(["세전급여", money(item.baseSalary)]);
  } else if (isAcq && item.workerType === "일용") {
    items.push(["일급", money(item.baseSalary)]);
  } else if (isAcq) {
    items.push(["기본급", money(item.baseSalary)]);
    items.push(["식대", money(item.mealAllowance)]);
    items.push(["자가운전보조금", money(item.carAllowance)]);
    items.push(["연구수당", money(item.researchAllowance)]);
    if (item.insurances) items.push(["4대보험", item.insurances.split(",").join(" · ")]);
  } else {
    if (item.baseSalary != null) items.push(["기본급", money(item.baseSalary)]);
  }
  // 유형과 무관하게, 다른 칸에 저장돼 있는 값은 절대 숨기지 않는다 (과거 입력분 보호)
  if (item.workerType === "사업" || item.workerType === "일용" || !isAcq) {
    if (item.mealAllowance != null) items.push(["식대", money(item.mealAllowance)]);
    if (item.carAllowance != null) items.push(["자가운전보조금", money(item.carAllowance)]);
    if (item.researchAllowance != null) items.push(["연구수당", money(item.researchAllowance)]);
  }
  if (item.memo) items.push(["메모", item.memo]);
  return items;
}

// ============ 취득/상실 신고 미니 위젯 + 팝업 ============
export function InsuranceCard({ items }: { items: InsuranceItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // 상세: 클릭하면 펼침/접힘 토글 (호버 펼침은 화면이 출렁여서 제거)
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  // 카테고리 필터
  const [activeCat, setActiveCat] = useState<"all" | "취득" | "사업" | "일용" | "상실">("all");

  // 카테고리별 카운트 (0건인 카테고리는 요약에서 숨김)
  const countParts = ["취득", "사업", "일용", "상실"]
    .map((label) => ({ label, count: items.filter((i) => categoryOf(i).label === label).length }))
    .filter((c) => c.count > 0);

  const catTabs: { key: "all" | "취득" | "사업" | "일용" | "상실"; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "취득", label: "취득" },
    { key: "사업", label: "사업" },
    { key: "일용", label: "일용" },
    { key: "상실", label: "상실" },
  ];
  const catCount = (key: string) => (key === "all" ? items.length : items.filter((i) => categoryOf(i).label === key).length);
  const filteredItems = activeCat === "all" ? items : items.filter((i) => categoryOf(i).label === activeCat);

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

  function togglePin(id: number) {
    setPinned((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // 거래처 수정 모달을 원천세 탭으로 바로 열기
  function openWithholdingTab(item: InsuranceItem) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("savetax-open-client-edit", { detail: { clientId: item.clientId, tab: "withholding" } })
    );
  }

  const chip = "text-[11px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap";

  return (
    <>
      <button onClick={() => setOpen(true)} className="stat-card glass rounded-3xl p-5 cursor-pointer block w-full text-left">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl gradient-amber flex items-center justify-center text-white">
            <UsersIcon width={18} height={18} strokeWidth={2.2} />
          </div>
          <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{items.length}</span>
        </div>
        <div className="text-[14px] font-bold text-[#191F28]">취득 · 상실 신고</div>
        <div className="text-[11.5px] text-[#6B7684] mt-0.5">
          {countParts.length > 0
            ? countParts.map((c, i) => (
                <span key={c.label}>
                  {i > 0 && <span className="mx-1 text-[#D1D6DB]">·</span>}
                  {c.label} {c.count}
                </span>
              ))
            : "진행 건 없음"}
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          {/* 높이 고정 — 카테고리 필터 전환 시 모달 크기가 출렁이지 않도록 */}
          <div className="glass-strong rounded-3xl w-full max-w-2xl h-[min(620px,80vh)] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex items-center gap-3 border-b border-white/40">
              <div className="w-10 h-10 rounded-2xl gradient-amber flex items-center justify-center text-white">
                <UsersIcon width={20} height={20} strokeWidth={2.2} />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-[#191F28]">취득 · 상실 신고</h2>
                <p className="text-[12px] text-[#6B7684]">요청 → 신고 → 확인 · {items.length}건 · 항목을 클릭하면 상세가 펼쳐져요</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#8B95A1] hover:text-[#191F28] w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/60 text-xl leading-none">×</button>
            </div>
            {/* 카테고리 필터 */}
            <div className="px-4 pt-3 flex items-center gap-1.5 flex-wrap">
              {catTabs.map((t) => {
                const isActive = activeCat === t.key;
                const c = catCount(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveCat(t.key)}
                    className={`text-[11.5px] px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#3182F6] text-white shadow-[0_2px_6px_rgba(49,130,246,0.25)]"
                        : "bg-white/60 text-[#6B7684] hover:bg-white/80 hover:text-[#191F28]"
                    }`}
                  >
                    {t.label}
                    <span className={`tabular-nums ${isActive ? "text-white/80" : "text-[#B0B8C1]"}`}>{c}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[120px]">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-[#8B95A1] text-sm">
                  {items.length === 0 ? "진행 중인 취득·상실 신고가 없습니다" : "이 카테고리에는 진행 건이 없습니다"}
                </div>
              ) : filteredItems.map((item) => {
                const isAcq = item.reportType === "acquisition";
                const category = categoryOf(item);
                const nextIdx = STEPS.findIndex((s) => !stepDate(item, s.key));
                const showDetail = pinned.has(item.id);
                return (
                  <div key={item.id} className="bg-white/60 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 왼쪽(정보) 클릭 → 상세 고정 토글 */}
                      <button
                        type="button"
                        onClick={() => togglePin(item.id)}
                        className="flex items-center gap-2 flex-wrap flex-1 min-w-0 text-left cursor-pointer"
                        title="클릭하면 상세를 펼치거나 접습니다"
                      >
                        <span className={`${chip} ${category.cls}`}>{category.label}</span>
                        <span className="text-[13.5px] font-bold text-[#191F28]">{item.clientName}</span>
                        <span className="text-[13px] text-[#4E5968]">{item.employeeName || "이름 미입력"}</span>
                        {isAcq && item.hireDate && (
                          <span className="text-[11.5px] text-[#8B95A1]">{item.workerType === "사업" ? "등록" : "입사"} {fmtDate(item.hireDate)}</span>
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
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B0B8C1" strokeWidth="2.5"
                          className={`transition-transform ${showDetail ? "rotate-180" : ""}`}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

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

                    {/* 상세 — 위하고 입력용 정보 */}
                    {showDetail && (
                      <div className="mt-2.5">
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1 bg-white border border-[#F2F4F6] rounded-xl px-3.5 py-2.5">
                          {detailItems(item).map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between text-xs min-w-0">
                              <span className="text-[#8B95A1] shrink-0">{label}</span>
                              <span className={`ml-2 truncate ${value === "—" ? "text-[#B0B8C1]" : "text-[#333D4B] font-medium"}`}>{value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end mt-1.5">
                          <button
                            type="button"
                            onClick={() => openWithholdingTab(item)}
                            className="text-[11.5px] text-[#3182F6] font-bold hover:text-[#1B64DA] hover:underline"
                          >
                            원천세 탭에서 수정 →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-white/40 flex items-center justify-end">
              <button onClick={() => setOpen(false)} className="text-[12.5px] text-[#6B7684] font-semibold hover:text-[#191F28]">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
