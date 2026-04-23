"use client";

import { useState } from "react";

// 2026년 근로소득 간이세액표 기준 (월급여 기준, 부양가족 수별)
// 실제 간이세액표는 구간이 매우 많으므로 여기서는 간략 계산 공식 사용
function calcIncomeTax(monthlySalary: number, dependents: number): number {
  // 비과세(식대 등) 제외한 과세 급여
  const taxable = monthlySalary;
  if (taxable <= 1060000) return 0;

  // 근로소득공제
  let deduction = 0;
  if (taxable <= 5000000) deduction = taxable * 0.7;
  else if (taxable <= 15000000) deduction = 3500000 + (taxable - 5000000) * 0.4;
  else if (taxable <= 45000000) deduction = 7500000 + (taxable - 15000000) * 0.15;
  else if (taxable <= 100000000) deduction = 12000000 + (taxable - 45000000) * 0.05;
  else deduction = 14750000 + (taxable - 100000000) * 0.02;

  const earned = taxable * 12 - deduction;
  if (earned <= 0) return 0;

  // 인적공제 (기본 150만원 x 부양가족 수)
  const personalDeduction = 1500000 * Math.max(dependents, 1);

  // 국민연금 공제 (월 상한 약 265,500원)
  const pensionMonthly = Math.min(Math.round(taxable * 0.045), 265500);
  const pensionYearly = pensionMonthly * 12;

  // 건강보험 공제
  const healthMonthly = Math.round(taxable * 0.03545);
  const longcareMonthly = Math.round(healthMonthly * 0.1295);
  const insuranceYearly = (healthMonthly + longcareMonthly) * 12;

  // 고용보험
  const employmentYearly = Math.round(taxable * 0.009) * 12;

  // 과세표준
  const taxBase = Math.max(earned - personalDeduction - pensionYearly - insuranceYearly - employmentYearly - 700000, 0); // 표준세액공제 70만원
  if (taxBase <= 0) return 0;

  // 소득세율 (2026년 기준)
  let tax = 0;
  if (taxBase <= 14000000) tax = taxBase * 0.06;
  else if (taxBase <= 50000000) tax = 840000 + (taxBase - 14000000) * 0.15;
  else if (taxBase <= 88000000) tax = 6240000 + (taxBase - 50000000) * 0.24;
  else if (taxBase <= 150000000) tax = 15360000 + (taxBase - 88000000) * 0.35;
  else if (taxBase <= 300000000) tax = 37060000 + (taxBase - 150000000) * 0.38;
  else if (taxBase <= 500000000) tax = 94060000 + (taxBase - 300000000) * 0.40;
  else if (taxBase <= 1000000000) tax = 174060000 + (taxBase - 500000000) * 0.42;
  else tax = 384060000 + (taxBase - 1000000000) * 0.45;

  // 근로소득세액공제
  let taxCredit = 0;
  if (tax <= 500000) taxCredit = tax * 0.55;
  else taxCredit = 275000 + (tax - 500000) * 0.3;
  if (taxCredit > 660000) taxCredit = 660000;

  const finalTax = Math.max(tax - taxCredit, 0);
  return Math.round(finalTax / 12 / 10) * 10; // 월 세액 (10원 단위)
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function IncomeTaxCalcModal({ onClose }: { onClose: () => void }) {
  const [salary, setSalary] = useState("");
  const [nonTaxable, setNonTaxable] = useState("200000"); // 비과세 (식대 등)
  const [dependents, setDependents] = useState(1);

  const salaryNum = parseInt(salary.replace(/,/g, "")) || 0;
  const nonTaxableNum = parseInt(nonTaxable.replace(/,/g, "")) || 0;
  const taxableSalary = Math.max(salaryNum - nonTaxableNum, 0);

  // 4대보험
  const pension = Math.min(Math.round(taxableSalary * 0.045), 265500);
  const health = Math.round(taxableSalary * 0.03545);
  const longcare = Math.round(health * 0.1295);
  const employment = Math.round(taxableSalary * 0.009);
  const insuranceTotal = pension + health + longcare + employment;

  // 소득세/지방소득세
  const incomeTax = calcIncomeTax(taxableSalary, dependents);
  const localTax = Math.round(incomeTax * 0.1 / 10) * 10;
  const taxTotal = incomeTax + localTax;

  // 총 공제 & 실수령
  const totalDeduction = insuranceTotal + taxTotal;
  const netPay = salaryNum - totalDeduction;

  function handleSalaryChange(v: string) {
    const num = v.replace(/[^\d]/g, "");
    setSalary(num ? parseInt(num).toLocaleString("ko-KR") : "");
  }

  function handleNonTaxableChange(v: string) {
    const num = v.replace(/[^\d]/g, "");
    setNonTaxable(num ? parseInt(num).toLocaleString("ko-KR") : "");
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-[#1a2e4a] to-[#2a4a6a] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧮</span>
              <h2 className="text-white font-semibold text-lg">근로소득세 계산기</h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <p className="text-white/50 text-xs mt-1">간이세액표 기준 예상 계산</p>
        </div>

        {/* 입력 */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">월 급여 (세전)</label>
            <div className="relative">
              <input
                type="text"
                value={salary}
                onChange={e => handleSalaryChange(e.target.value)}
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
                  onChange={e => handleNonTaxableChange(e.target.value)}
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
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500">국민연금</span>
                <span className="text-xs font-medium text-gray-700">{fmt(pension)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500">건강보험</span>
                <span className="text-xs font-medium text-gray-700">{fmt(health)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500">장기요양보험</span>
                <span className="text-xs font-medium text-gray-700">{fmt(longcare)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500">고용보험</span>
                <span className="text-xs font-medium text-gray-700">{fmt(employment)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100 bg-gray-50/50 -mx-2 px-2 rounded">
                <span className="text-xs font-medium text-gray-600">4대보험 소계</span>
                <span className="text-xs font-bold text-gray-800">{fmt(insuranceTotal)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100 mt-1">
                <span className="text-xs text-gray-500">소득세</span>
                <span className="text-xs font-medium text-gray-700">{fmt(incomeTax)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500">지방소득세</span>
                <span className="text-xs font-medium text-gray-700">{fmt(localTax)}원</span>
              </div>
              <div className="flex items-center justify-between py-1.5 bg-gray-50/50 -mx-2 px-2 rounded">
                <span className="text-xs font-medium text-gray-600">세금 소계</span>
                <span className="text-xs font-bold text-gray-800">{fmt(taxTotal)}원</span>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 mt-3 text-center">
              * 간이세액표 기준 예상치이며, 실제 세액과 다를 수 있습니다
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
