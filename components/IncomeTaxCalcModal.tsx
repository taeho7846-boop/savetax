"use client";

import { useState } from "react";

// 2026년 요율
const RATES = {
  pension: 0.045,        // 국민연금 4.5% (→ 2026년 9.5%의 근로자 부담분은 추후 확인)
  pensionCap: 265500,    // 국민연금 월 상한
  health: 0.03595,       // 건강보험 7.19%의 근로자 부담 3.595%
  longcare: 0.1295,      // 장기요양 = 건강보험의 12.95%
  employment: 0.009,     // 고용보험 0.9%
};

function calcIncomeTax(monthlySalary: number, dependents: number, isCeo: boolean): number {
  const taxable = monthlySalary;
  if (taxable <= 1060000) return 0;

  // 근로소득공제 (연간)
  const annual = taxable * 12;
  let deduction = 0;
  if (annual <= 5000000) deduction = annual * 0.7;
  else if (annual <= 15000000) deduction = 3500000 + (annual - 5000000) * 0.4;
  else if (annual <= 45000000) deduction = 7500000 + (annual - 15000000) * 0.15;
  else if (annual <= 100000000) deduction = 12000000 + (annual - 45000000) * 0.05;
  else deduction = 14750000 + (annual - 100000000) * 0.02;

  const earned = annual - deduction;
  if (earned <= 0) return 0;

  const personalDeduction = 1500000 * Math.max(dependents, 1);
  const pensionMonthly = Math.min(Math.round(taxable * RATES.pension), RATES.pensionCap);
  const pensionYearly = pensionMonthly * 12;
  const healthMonthly = Math.round(taxable * RATES.health);
  const longcareMonthly = Math.round(healthMonthly * RATES.longcare);
  const insuranceYearly = (healthMonthly + longcareMonthly) * 12;
  const employmentYearly = isCeo ? 0 : Math.round(taxable * RATES.employment) * 12;

  const taxBase = Math.max(earned - personalDeduction - pensionYearly - insuranceYearly - employmentYearly - 700000, 0);
  if (taxBase <= 0) return 0;

  let tax = 0;
  if (taxBase <= 14000000) tax = taxBase * 0.06;
  else if (taxBase <= 50000000) tax = 840000 + (taxBase - 14000000) * 0.15;
  else if (taxBase <= 88000000) tax = 6240000 + (taxBase - 50000000) * 0.24;
  else if (taxBase <= 150000000) tax = 15360000 + (taxBase - 88000000) * 0.35;
  else if (taxBase <= 300000000) tax = 37060000 + (taxBase - 150000000) * 0.38;
  else if (taxBase <= 500000000) tax = 94060000 + (taxBase - 300000000) * 0.40;
  else if (taxBase <= 1000000000) tax = 174060000 + (taxBase - 500000000) * 0.42;
  else tax = 384060000 + (taxBase - 1000000000) * 0.45;

  let taxCredit = 0;
  if (tax <= 500000) taxCredit = tax * 0.55;
  else taxCredit = 275000 + (tax - 500000) * 0.3;
  if (taxCredit > 660000) taxCredit = 660000;

  const finalTax = Math.max(tax - taxCredit, 0);
  return Math.round(finalTax / 12 / 10) * 10;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function pct(n: number, base: number): string {
  if (base === 0) return "";
  return ((n / base) * 100).toFixed(2) + "%";
}

export function IncomeTaxCalcModal({ onClose }: { onClose: () => void }) {
  const [salary, setSalary] = useState("");
  const [nonTaxable, setNonTaxable] = useState("200,000");
  const [dependents, setDependents] = useState(1);
  const [type, setType] = useState<"worker" | "ceo">("worker");

  const salaryNum = parseInt(salary.replace(/,/g, "")) || 0;
  const nonTaxableNum = parseInt(nonTaxable.replace(/,/g, "")) || 0;
  const taxableSalary = Math.max(salaryNum - nonTaxableNum, 0);
  const isCeo = type === "ceo";

  // 4대보험 (2026년 요율)
  const pension = Math.min(Math.round(taxableSalary * RATES.pension), RATES.pensionCap);
  const health = Math.round(taxableSalary * RATES.health);
  const longcare = Math.round(health * RATES.longcare);
  const employment = isCeo ? 0 : Math.round(taxableSalary * RATES.employment);
  const insuranceTotal = pension + health + longcare + employment;

  // 소득세/지방소득세
  const incomeTax = calcIncomeTax(taxableSalary, dependents, isCeo);
  const localTax = Math.round(incomeTax * 0.1 / 10) * 10;
  const taxTotal = incomeTax + localTax;

  const totalDeduction = insuranceTotal + taxTotal;
  const netPay = salaryNum - totalDeduction;

  function handleNumInput(v: string, setter: (s: string) => void) {
    const num = v.replace(/[^\d]/g, "");
    setter(num ? parseInt(num).toLocaleString("ko-KR") : "");
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-[#1a2e4a] to-[#2a4a6a] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧮</span>
              <h2 className="text-white font-semibold text-lg">근로소득세 계산기</h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <p className="text-white/50 text-xs mt-1">2026년 요율 기준 예상 계산</p>
        </div>

        {/* 입력 */}
        <div className="px-6 py-5 space-y-4">
          {/* 근로자/법인대표 선택 */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setType("worker")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                type === "worker" ? "bg-white text-[#1a2e4a] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              근로자
            </button>
            <button
              onClick={() => setType("ceo")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                type === "ceo" ? "bg-white text-[#1a2e4a] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              법인 대표
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">월 급여 (세전)</label>
            <div className="relative">
              <input
                type="text"
                value={salary}
                onChange={e => handleNumInput(e.target.value, setSalary)}
                placeholder="3,000,000"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 focus:border-[#1a2e4a] text-right pr-10"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">비과세 (식대 등)</label>
              <div className="relative">
                <input
                  type="text"
                  value={nonTaxable}
                  onChange={e => handleNumInput(e.target.value, setNonTaxable)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">부양가족 수</label>
              <select
                value={dependents}
                onChange={e => setDependents(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n}명</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {salaryNum > 0 && (
          <div className="px-6 pb-6">
            {/* 실수령액 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">예상 실수령액</span>
                <span className="text-2xl font-bold text-[#1a2e4a]">{fmt(netPay)}원</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">총 공제액</span>
                <span className="text-sm text-red-500 font-medium">-{fmt(totalDeduction)}원</span>
              </div>
            </div>

            {/* 상세 내역 */}
            <div className="space-y-1">
              <Row label="국민연금" rate={`${(RATES.pension * 100).toFixed(1)}%`} amount={pension} />
              <Row label="건강보험" rate={`${(RATES.health * 100).toFixed(2)}%`} amount={health} />
              <Row label="장기요양보험" rate={`건보 ${(RATES.longcare * 100).toFixed(2)}%`} amount={longcare} />
              {!isCeo && <Row label="고용보험" rate={`${(RATES.employment * 100).toFixed(1)}%`} amount={employment} />}
              <div className="flex items-center justify-between py-1.5 bg-gray-50/50 -mx-2 px-2 rounded border-b border-gray-100">
                <span className="text-xs font-medium text-gray-600">{isCeo ? "3대보험 소계" : "4대보험 소계"}</span>
                <span className="text-xs font-bold text-gray-800">{fmt(insuranceTotal)}원</span>
              </div>
              <Row label="소득세" rate="" amount={incomeTax} className="mt-1" />
              <Row label="지방소득세" rate="소득세 10%" amount={localTax} />
              <div className="flex items-center justify-between py-1.5 bg-gray-50/50 -mx-2 px-2 rounded">
                <span className="text-xs font-medium text-gray-600">세금 소계</span>
                <span className="text-xs font-bold text-gray-800">{fmt(taxTotal)}원</span>
              </div>
            </div>

            {isCeo && (
              <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg">
                <p className="text-[11px] text-amber-700">법인 대표는 고용보험 가입 대상이 아닙니다</p>
              </div>
            )}

            <p className="text-[10px] text-gray-400 mt-3 text-center">
              * 2026년 요율 기준 예상치이며, 실제 세액과 다를 수 있습니다
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, rate, amount, className = "" }: { label: string; rate: string; amount: number; className?: string }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-gray-100 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">{label}</span>
        {rate && <span className="text-[10px] text-gray-400">{rate}</span>}
      </div>
      <span className="text-xs font-medium text-gray-700">{fmt(amount)}원</span>
    </div>
  );
}
