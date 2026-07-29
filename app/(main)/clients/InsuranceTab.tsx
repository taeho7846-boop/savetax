"use client";

import { useEffect, useState } from "react";
import {
  getInsuranceReports,
  addInsuranceReport,
  completeInsuranceStep,
  completeEstablishmentStep,
  undoInsuranceStep,
  updateInsuranceStepDate,
  updateInsuranceReport,
  deleteInsuranceReport,
  type InsuranceStep,
} from "@/app/actions/insurance";

type Report = Awaited<ReturnType<typeof getInsuranceReports>>[number];

const STEPS: { key: InsuranceStep; label: string }[] = [
  { key: "requested", label: "대표자 요청" },
  { key: "filed", label: "실무자 신고" },
  { key: "confirmed", label: "확인" },
];

const LOSS_REASONS = ["자진퇴사", "권고사직", "계약만료", "정년퇴직", "기타"];
const WORKER_TYPES = ["근로", "사업", "일용"];
const INSURANCE_ITEMS = ["연금", "건강", "고용", "산재"];

function fmtDate(d: string | null) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}

function parseMoney(s: string) {
  const d = s.replace(/[^0-9]/g, "");
  return d ? parseInt(d) : null;
}

function fmtMoneyInput(s: string) {
  const d = s.replace(/[^0-9]/g, "");
  return d ? parseInt(d).toLocaleString() : "";
}

function fmtResidentInput(s: string) {
  const d = s.replace(/[^0-9]/g, "").slice(0, 13);
  return d.length > 6 ? `${d.slice(0, 6)}-${d.slice(6)}` : d;
}

function money(n: number | null) {
  return n != null ? `${n.toLocaleString()}원` : "—";
}

function DetailGrid({ r }: { r: Report }) {
  const isAcq = r.reportType === "acquisition";
  const items: [string, string][] = [["주민등록번호", r.residentNumber || "—"]];
  if (isAcq && r.workerType === "사업") {
    items.push(["세전급여", money(r.baseSalary)]);
  } else if (isAcq && r.workerType === "일용") {
    items.push(["일급", money(r.baseSalary)]);
  } else if (isAcq) {
    items.push(["기본급", money(r.baseSalary)]);
    items.push(["식대", money(r.mealAllowance)]);
    items.push(["자가운전보조금", money(r.carAllowance)]);
    items.push(["연구수당", money(r.researchAllowance)]);
  } else {
    if (r.baseSalary != null) items.push(["기본급", money(r.baseSalary)]);
  }
  // 유형과 무관하게, 다른 칸에 저장돼 있는 값은 절대 숨기지 않는다 (과거 입력분 보호)
  if ((r.workerType === "사업" || r.workerType === "일용" || !isAcq)) {
    if (r.mealAllowance != null) items.push(["식대", money(r.mealAllowance)]);
    if (r.carAllowance != null) items.push(["자가운전보조금", money(r.carAllowance)]);
    if (r.researchAllowance != null) items.push(["연구수당", money(r.researchAllowance)]);
  }
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-1 bg-white border border-[#F2F4F6] rounded-lg px-3.5 py-2.5 mt-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-xs min-w-0">
          <span className="text-[#8B95A1] shrink-0">{label}</span>
          <span className={`ml-2 truncate ${value === "—" ? "text-[#B0B8C1]" : "text-[#333D4B] font-medium"}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function stepDate(r: Report | null, step: InsuranceStep) {
  return r ? (r[`${step}Date`] as string | null) : null;
}
function stepBy(r: Report | null, step: InsuranceStep) {
  return r ? (r[`${step}By`] as string | null) : null;
}
function isDone(r: Report) {
  return !!r.confirmedDate;
}

// 근로만 4대보험 '취득신고', 사업·일용은 인원 등록
function typeLabel(r: Report) {
  if (r.reportType === "loss") return "상실신고";
  if (r.workerType === "사업") return "사업 등록";
  if (r.workerType === "일용") return "일용 등록";
  return "취득신고";
}

// 카테고리: 취득(근로) / 사업 / 일용 / 상실
function categoryOf(r: Report) {
  if (r.reportType === "loss") return "상실";
  if (r.workerType === "사업") return "사업";
  if (r.workerType === "일용") return "일용";
  return "취득";
}

export function InsuranceTab({ clientId }: { clientId: number }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingDate, setEditingDate] = useState<{ id: number; step: InsuranceStep } | null>(null);
  const [catFilter, setCatFilter] = useState<"all" | "취득" | "사업" | "일용" | "상실">("all");

  // 추가/수정 폼
  const [editId, setEditId] = useState<number | null>(null);
  const [formType, setFormType] = useState<"acquisition" | "loss">("acquisition");
  const [formName, setFormName] = useState("");
  const [formResident, setFormResident] = useState("");
  const [formWorkerType, setFormWorkerType] = useState("근로");
  const [formInsurances, setFormInsurances] = useState<string[]>([...INSURANCE_ITEMS]);
  const [formPay, setFormPay] = useState({ base: "", meal: "", car: "", research: "" });
  const [formDate, setFormDate] = useState("");
  const [formReason, setFormReason] = useState(LOSS_REASONS[0]);
  const [formJobCert, setFormJobCert] = useState(false);

  function resetForm() {
    setEditId(null);
    setFormType("acquisition");
    setFormName("");
    setFormResident("");
    setFormWorkerType("근로");
    setFormInsurances([...INSURANCE_ITEMS]);
    setFormPay({ base: "", meal: "", car: "", research: "" });
    setFormDate("");
    setFormReason(LOSS_REASONS[0]);
    setFormJobCert(false);
  }

  function startEdit(r: Report) {
    setEditId(r.id);
    setFormType(r.reportType === "loss" ? "loss" : "acquisition");
    setFormName(r.employeeName ?? "");
    setFormResident(r.residentNumber ?? "");
    setFormWorkerType(r.workerType ?? "근로");
    setFormInsurances(r.insurances ? r.insurances.split(",") : [...INSURANCE_ITEMS]);
    setFormPay({
      base: r.baseSalary != null ? r.baseSalary.toLocaleString() : "",
      meal: r.mealAllowance != null ? r.mealAllowance.toLocaleString() : "",
      car: r.carAllowance != null ? r.carAllowance.toLocaleString() : "",
      research: r.researchAllowance != null ? r.researchAllowance.toLocaleString() : "",
    });
    setFormDate((r.reportType === "loss" ? r.leaveDate : r.hireDate) ?? "");
    setFormReason(r.lossReason ?? LOSS_REASONS[0]);
    setFormJobCert(r.jobCertNeeded);
    setShowAdd(true);
  }

  async function reload() {
    setReports(await getInsuranceReports(clientId));
  }
  useEffect(() => {
    getInsuranceReports(clientId).then(setReports);
  }, [clientId]);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const establishment = reports?.find((r) => r.reportType === "establishment") ?? null;
  const workersAll = reports?.filter((r) => r.reportType !== "establishment") ?? [];
  const workers = catFilter === "all" ? workersAll : workersAll.filter((r) => categoryOf(r) === catFilter);
  const active = workers.filter((r) => !isDone(r));
  const completed = workers.filter(isDone);
  const catCount = (key: string) => (key === "all" ? workersAll.length : workersAll.filter((r) => categoryOf(r) === key).length);

  function handleSave() {
    if (!formName.trim()) {
      alert("근로자 이름을 입력해주세요");
      return;
    }
    const isLabor = formType === "acquisition" && formWorkerType === "근로";
    // 사업·일용은 폼에서 일부 입력칸을 숨기지만, 기존에 저장된 값은 절대 지우지 않는다
    const payload = {
      employeeName: formName.trim(),
      residentNumber: formResident.trim() || null,
      workerType: formType === "acquisition" ? formWorkerType : null,
      insurances: isLabor && formInsurances.length > 0 ? formInsurances.join(",") : null,
      baseSalary: parseMoney(formPay.base),
      mealAllowance: parseMoney(formPay.meal),
      carAllowance: parseMoney(formPay.car),
      researchAllowance: parseMoney(formPay.research),
      hireDate: formType === "acquisition" ? formDate || null : null,
      leaveDate: formType === "loss" ? formDate || null : null,
      lossReason: formType === "loss" ? formReason : null,
      jobCertNeeded: formType === "loss" ? formJobCert : false,
    };
    run(() =>
      editId
        ? updateInsuranceReport(editId, payload)
        : addInsuranceReport(clientId, { reportType: formType, ...payload })
    ).then(() => {
      resetForm();
      setShowAdd(false);
    });
  }

  function Stepper({ report, onComplete }: { report: Report | null; onComplete: (step: InsuranceStep) => void }) {
    const nextIdx = STEPS.findIndex((s) => !stepDate(report, s.key));
    return (
      <div className="flex items-start mt-2.5">
        {STEPS.map((s, i) => {
          const date = stepDate(report, s.key);
          const by = stepBy(report, s.key);
          const done = !!date;
          const isNext = i === nextIdx;
          const editing = report && editingDate?.id === report.id && editingDate.step === s.key;
          return (
            <div key={s.key} className="contents">
              {i > 0 && <div className={`h-px mt-[11px] flex-[0.5] ${done || isNext ? "bg-[#B5D4F4]" : "bg-[#E5E8EB]"}`} />}
              <div className="flex-1 text-center min-w-0">
                {done ? (
                  <button
                    type="button"
                    title="클릭하면 이 단계를 취소합니다"
                    onClick={() => {
                      if (report && confirm(`'${s.label}' 단계를 취소할까요?`)) run(() => undoInsuranceStep(report.id, s.key));
                    }}
                    className="w-[22px] h-[22px] rounded-full bg-[#3182F6] hover:bg-[#1B64DA] mx-auto mb-1 flex items-center justify-center transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
                  </button>
                ) : (
                  <div className={`w-[22px] h-[22px] rounded-full mx-auto mb-1 border-[1.5px] ${isNext ? "border-[#3182F6] bg-[#E8F3FF]" : "border-[#E5E8EB]"}`} />
                )}
                <div className={`text-xs font-medium ${done ? "text-[#191F28]" : isNext ? "text-[#3182F6]" : "text-[#B0B8C1]"}`}>{s.label}</div>
                {done ? (
                  editing ? (
                    <input
                      type="date"
                      autoFocus
                      defaultValue={date}
                      onChange={(e) => {
                        if (report && e.target.value) {
                          run(() => updateInsuranceStepDate(report.id, s.key, e.target.value));
                          setEditingDate(null);
                        }
                      }}
                      onBlur={() => setEditingDate(null)}
                      className="text-[11px] border border-[#D1D6DB] rounded px-1 mt-0.5 w-[110px]"
                    />
                  ) : (
                    <button
                      type="button"
                      title="클릭하면 날짜를 수정합니다"
                      onClick={() => report && setEditingDate({ id: report.id, step: s.key })}
                      className="text-[11px] text-[#8B95A1] hover:text-[#4E5968] hover:underline"
                    >
                      {fmtDate(date)}{by ? ` · ${by}` : ""}
                    </button>
                  )
                ) : isNext ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onComplete(s.key)}
                    className="text-[11px] text-[#3182F6] underline hover:text-[#1B64DA] disabled:opacity-50"
                  >
                    완료 처리
                  </button>
                ) : (
                  <div className="text-[11px] text-[#B0B8C1]">대기</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function HeaderChips({ r }: { r: Report }) {
    const chip = "text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap";
    return (
      <>
        {/* 근로만 4대보험 '취득신고', 사업·일용은 인원 등록 */}
        {r.reportType === "loss" ? (
          <span className={`${chip} bg-[#FEF3C7] text-[#B45309]`}>상실신고</span>
        ) : r.workerType === "사업" ? (
          <span className={`${chip} bg-[#F5F3FF] text-[#6D28D9]`}>사업 등록</span>
        ) : r.workerType === "일용" ? (
          <span className={`${chip} bg-[#F1FBF4] text-[#15803D]`}>일용 등록</span>
        ) : (
          <span className={`${chip} bg-[#E8F3FF] text-[#1B64DA]`}>취득신고</span>
        )}
        {r.workerType === "근로" && <span className={`${chip} bg-[#F5F3FF] text-[#6D28D9]`}>{r.workerType}</span>}
        {r.reportType === "acquisition" && r.hireDate && (
          <span className={`${chip} bg-[#F2F4F6] text-[#4E5968]`}>{r.workerType === "사업" ? "등록" : "입사"} {fmtDate(r.hireDate)}</span>
        )}
        {r.reportType === "loss" && r.leaveDate && (
          <span className={`${chip} bg-[#F2F4F6] text-[#4E5968]`}>퇴사 {fmtDate(r.leaveDate)}</span>
        )}
        {r.reportType === "loss" && r.lossReason && (
          <span className={`${chip} bg-[#F2F4F6] text-[#4E5968]`}>{r.lossReason}</span>
        )}
        {r.reportType === "acquisition" &&
          r.insurances?.split(",").map((ins) => (
            <span key={ins} className={`${chip} bg-[#F1FBF4] text-[#15803D]`}>{ins}</span>
          ))}
      </>
    );
  }

  if (!reports) {
    return <div className="text-center py-16 text-[#8B95A1] text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-3">
      {/* 요약 + 추가 버튼 */}
      <div className="flex items-center gap-2">
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#E8F3FF] text-[#1B64DA]">진행중 {active.length}</span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#F2F4F6] text-[#4E5968]">완료 {completed.length}</span>
        <button
          type="button"
          onClick={() => { resetForm(); setShowAdd((v) => !v); }}
          className="ml-auto text-xs bg-[#3182F6] text-white px-3 py-1.5 rounded-lg hover:bg-[#1B64DA] transition-colors"
        >
          + 근로자 추가
        </button>
      </div>

      {/* 카테고리 필터 */}
      {workersAll.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "취득", "사업", "일용", "상실"] as const).map((key) => {
            const isActive = catFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCatFilter(key)}
                className={`text-[11.5px] px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#3182F6] text-white"
                    : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB] hover:text-[#191F28]"
                }`}
              >
                {key === "all" ? "전체" : key}
                <span className={`tabular-nums ${isActive ? "text-white/80" : "text-[#B0B8C1]"}`}>{catCount(key)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 추가 폼 */}
      {showAdd && (
        <div className="border border-[#3182F6] rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            {(["acquisition", "loss"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={editId !== null}
                onClick={() => setFormType(t)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                  formType === t ? "border-[#3182F6] bg-[#E8F3FF] text-[#1B64DA] font-medium" : "border-[#D1D6DB] text-[#4E5968]"
                }`}
              >
                {t === "acquisition" ? "취득신고 (입사)" : "상실신고 (퇴사)"}
              </button>
            ))}
          </div>
          {formType === "acquisition" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5">
                {WORKER_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormWorkerType(t)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      formWorkerType === t
                        ? "border-[#3182F6] bg-[#E8F3FF] text-[#1B64DA] font-medium"
                        : "border-[#D1D6DB] text-[#4E5968]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {formWorkerType === "근로" && (
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-[#8B95A1]">4대보험</span>
                  {INSURANCE_ITEMS.map((ins) => (
                    <label key={ins} className="flex items-center gap-1 text-xs text-[#4E5968] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formInsurances.includes(ins)}
                        onChange={(e) =>
                          setFormInsurances((v) => INSURANCE_ITEMS.filter((x) => (x === ins ? e.target.checked : v.includes(x))))
                        }
                      />
                      {ins}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="근로자 이름"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-[#D1D6DB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3182F6]"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="주민등록번호"
              value={formResident}
              onChange={(e) => setFormResident(fmtResidentInput(e.target.value))}
              className="w-[150px] text-sm border border-[#D1D6DB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3182F6]"
            />
            {/* 사업(프리랜서)은 날짜 불필요 — 이름·주민번호·세전급여만 */}
            {!(formType === "acquisition" && formWorkerType === "사업") && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#8B95A1] shrink-0">{formType === "acquisition" ? "입사일" : "퇴사일"}</span>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="text-sm border border-[#D1D6DB] rounded-lg px-2 py-2 focus:outline-none focus:border-[#3182F6]"
                />
              </div>
            )}
          </div>
          {/* 급여 입력 — 근로: 4항목 / 사업: 세전급여 / 일용: 일급 / 상실: 없음 */}
          {formType === "acquisition" && formWorkerType === "근로" && (
            <div className="grid grid-cols-2 gap-2">
              {([
                ["base", "기본급"],
                ["meal", "식대"],
                ["car", "자가운전보조금"],
                ["research", "연구수당"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="text-xs text-[#8B95A1] w-[86px] shrink-0">{label}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formPay[key]}
                    onChange={(e) => setFormPay((v) => ({ ...v, [key]: fmtMoneyInput(e.target.value) }))}
                    className="flex-1 min-w-0 text-sm text-right border border-[#D1D6DB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3182F6]"
                  />
                  <span className="text-xs text-[#8B95A1]">원</span>
                </div>
              ))}
            </div>
          )}
          {formType === "acquisition" && formWorkerType !== "근로" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#8B95A1] w-[86px] shrink-0">{formWorkerType === "사업" ? "세전급여" : "일급"}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formPay.base}
                  onChange={(e) => setFormPay((v) => ({ ...v, base: fmtMoneyInput(e.target.value) }))}
                  className="flex-1 min-w-0 text-sm text-right border border-[#D1D6DB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#3182F6]"
                />
                <span className="text-xs text-[#8B95A1]">원</span>
              </div>
            </div>
          )}
          {formType === "loss" && (
            <div className="flex items-center gap-3">
              <select
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                className="text-sm border border-[#D1D6DB] rounded-lg px-2 py-2 focus:outline-none focus:border-[#3182F6]"
              >
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-[#4E5968] cursor-pointer">
                <input type="checkbox" checked={formJobCert} onChange={(e) => setFormJobCert(e.target.checked)} />
                이직확인서 필요
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { resetForm(); setShowAdd(false); }}
              className="text-sm px-3 py-1.5 rounded-lg border border-[#D1D6DB] text-[#4E5968]"
            >
              취소
            </button>
            <button type="button" disabled={busy} onClick={handleSave} className="text-sm px-4 py-1.5 rounded-lg bg-[#3182F6] text-white hover:bg-[#1B64DA] disabled:opacity-50">
              {editId ? "저장" : "등록"}
            </button>
          </div>
        </div>
      )}

      {/* 성립신고 — 사업장당 1건 고정 */}
      <div className="border border-[#E5E8EB] rounded-xl px-4 py-3.5 bg-[#F9FAFB]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#191F28]">사업장 성립신고</span>
          {establishment && isDone(establishment) ? (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-[#F1FBF4] text-[#15803D]">완료</span>
          ) : (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-[#F2F4F6] text-[#8B95A1]">
              {establishment ? "진행중" : "미진행"}
            </span>
          )}
        </div>
        <Stepper
          report={establishment}
          onComplete={(step) =>
            run(() =>
              establishment ? completeInsuranceStep(establishment.id, step) : completeEstablishmentStep(clientId, step)
            )
          }
        />
      </div>

      {/* 진행중 근로자 카드 */}
      {active.map((r) => (
        <div key={r.id} className="border border-[#E5E8EB] rounded-xl px-4 py-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-[#191F28] mr-1">{r.employeeName}</span>
            <HeaderChips r={r} />
            <span className="ml-auto flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="text-[11px] text-[#8B95A1] hover:text-[#3182F6]"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`'${r.employeeName}' ${typeLabel(r)} 건을 삭제할까요?`))
                    run(() => deleteInsuranceReport(r.id));
                }}
                className="text-[11px] text-[#B0B8C1] hover:text-[#E02E2E]"
              >
                삭제
              </button>
            </span>
          </div>
          <DetailGrid r={r} />
          {r.reportType === "loss" && (
            <label className="flex items-center gap-1.5 mt-1.5 text-xs text-[#4E5968] cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={r.jobCertNeeded}
                onChange={(e) => run(() => updateInsuranceReport(r.id, { jobCertNeeded: e.target.checked }))}
              />
              이직확인서 필요
            </label>
          )}
          <Stepper report={r} onComplete={(step) => run(() => completeInsuranceStep(r.id, step))} />
        </div>
      ))}

      {workers.length === 0 && (
        <div className="text-center py-10 text-[#8B95A1] text-sm">
          {workersAll.length > 0 ? (
            "이 카테고리에는 등록 건이 없습니다"
          ) : (
            <>
              등록된 근로자 신고 건이 없습니다
              <br />
              <span className="text-xs">상단의 '+ 근로자 추가'로 취득·상실신고를 등록하세요</span>
            </>
          )}
        </div>
      )}

      {/* 완료 건 — 접힌 상태 */}
      {completed.map((r) =>
        expanded.has(r.id) ? (
          <div key={r.id} className="border border-[#E5E8EB] rounded-xl px-4 py-3.5 bg-[#F9FAFB]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-[#191F28] mr-1">{r.employeeName}</span>
              <HeaderChips r={r} />
              <span className="ml-auto flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="text-[11px] text-[#8B95A1] hover:text-[#3182F6]"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((s) => { const n = new Set(s); n.delete(r.id); return n; })}
                  className="text-[11px] text-[#8B95A1] hover:text-[#4E5968]"
                >
                  접기
                </button>
              </span>
            </div>
            <DetailGrid r={r} />
            <Stepper report={r} onComplete={(step) => run(() => completeInsuranceStep(r.id, step))} />
          </div>
        ) : (
          <button
            key={r.id}
            type="button"
            onClick={() => setExpanded((s) => new Set(s).add(r.id))}
            className="w-full border border-[#E5E8EB] rounded-xl px-4 py-2.5 bg-[#F9FAFB] flex items-center gap-2 text-left hover:bg-[#F2F4F6] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
            <span className="text-[13px] text-[#4E5968]">
              {r.employeeName} · {typeLabel(r)} 완료
              {r.confirmedDate ? ` (${fmtDate(r.confirmedDate)} 확인)` : ""}
            </span>
            <span className="ml-auto text-[#B0B8C1] text-xs">펼치기</span>
          </button>
        )
      )}
    </div>
  );
}
