"use client";

import { useState } from "react";

// 소득세율 (2026년)
function calcTax(taxBase: number): number {
  if (taxBase <= 0) return 0;
  if (taxBase <= 14000000) return taxBase * 0.06;
  if (taxBase <= 50000000) return 1260000 + (taxBase - 14000000) * 0.15;
  if (taxBase <= 88000000) return 5760000 + (taxBase - 50000000) * 0.24;
  if (taxBase <= 150000000) return 15440000 + (taxBase - 88000000) * 0.35;
  if (taxBase <= 300000000) return 19940000 + (taxBase - 150000000) * 0.38;
  if (taxBase <= 500000000) return 25940000 + (taxBase - 300000000) * 0.40;
  if (taxBase <= 1000000000) return 35940000 + (taxBase - 500000000) * 0.42;
  return 65940000 + (taxBase - 1000000000) * 0.45;
}

// 최저한세 계산
function calcMinTax(computedTax: number): number {
  if (computedTax <= 30000000) return Math.round(computedTax * 0.35);
  return Math.round(30000000 * 0.35 + (computedTax - 30000000) * 0.45);
}

// 감면 적용 + 최저한세 반영
function applyReduction(
  computedTax: number,
  startupRate: number, // 0, 25, 50, 75, 100
  smeRate: number, // 0, 10, 20, 30
): { startupReduction: number; smeReduction: number; minTax: number; finalTax: number } {
  const startupReduction = Math.round(computedTax * startupRate / 100);
  const afterStartup = computedTax - startupReduction;
  const smeReduction = Math.round(afterStartup * smeRate / 100);
  const afterAll = afterStartup - smeReduction;

  // 최저한세
  const minTax = calcMinTax(computedTax);

  // 창업중소기업 100%는 최저한세 적용 배제
  if (startupRate === 100) {
    return { startupReduction, smeReduction, minTax: 0, finalTax: Math.max(afterAll, 0) };
  }

  // 나머지는 최저한세 이상 납부
  const finalTax = Math.max(afterAll, minTax);
  return { startupReduction, smeReduction, minTax, finalTax };
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function numInput(v: string): string {
  const num = v.replace(/[^\d]/g, "");
  return num ? parseInt(num).toLocaleString("ko-KR") : "";
}

function parse(v: string): number {
  return parseInt(v.replace(/,/g, "")) || 0;
}

// 과세표준 구간별 세율 표시
function getTaxRateLabel(taxBase: number): string {
  if (taxBase <= 14000000) return "6%";
  if (taxBase <= 50000000) return "15%";
  if (taxBase <= 88000000) return "24%";
  if (taxBase <= 150000000) return "35%";
  if (taxBase <= 300000000) return "38%";
  if (taxBase <= 500000000) return "40%";
  if (taxBase <= 1000000000) return "42%";
  return "45%";
}

type CalcResult = {
  revenue: number;
  expense: number;
  income: number;
  deduction: number;
  taxBase: number;
  taxRate: string;
  computedTax: number;
  startupReduction: number;
  smeReduction: number;
  minTax: number;
  finalTax: number;
  localTax: number;
  totalTax: number;
};

function calculate(
  revenue: number,
  expense: number,
  startupRate: number,
  smeRate: number,
): CalcResult {
  const income = Math.max(revenue - expense, 0);
  const deduction = 1500000; // 기본공제
  const taxBase = Math.max(income - deduction, 0);
  const taxRate = getTaxRateLabel(taxBase);
  const computedTax = Math.round(calcTax(taxBase));
  const { startupReduction, smeReduction, minTax, finalTax } = applyReduction(computedTax, startupRate, smeRate);
  const localTax = Math.round(finalTax * 0.1);
  const totalTax = finalTax + localTax;
  return { revenue, expense, income, deduction, taxBase, taxRate, computedTax, startupReduction, smeReduction, minTax, finalTax, localTax, totalTax };
}

function ResultCard({ result, label, color }: { result: CalcResult; label: string; color: "blue" | "green" }) {
  const bg = color === "blue" ? "from-blue-50 to-indigo-50" : "from-emerald-50 to-teal-50";
  const textColor = color === "blue" ? "text-[#1a2e4a]" : "text-emerald-700";

  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</h3>

      {/* 총 납부세액 */}
      <div className={`bg-gradient-to-r ${bg} rounded-xl p-3.5`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">총 납부세액</span>
          <span className={`text-xl font-bold ${textColor}`}>{fmt(result.totalTax)}원</span>
        </div>
      </div>

      {/* 상세 */}
      <div className="text-xs space-y-0.5">
        <Row label="매출액" value={result.revenue} />
        <Row label="비용" value={result.expense} sub />
        <RowBold label="사업소득금액" value={result.income} />
        <Row label="기본공제" value={result.deduction} sub />
        <RowBold label="과세표준" value={result.taxBase} note={result.taxRate} />
        <Row label="산출세액" value={result.computedTax} />
        {result.startupReduction > 0 && <Row label="창업중소기업 감면" value={result.startupReduction} sub red />}
        {result.smeReduction > 0 && <Row label="중소기업특별 감면" value={result.smeReduction} sub red />}
        {result.minTax > 0 && <Row label="최저한세" value={result.minTax} note="하한" />}
        <RowBold label="결정세액 (소득세)" value={result.finalTax} />
        <Row label="지방소득세 (10%)" value={result.localTax} />
      </div>
    </div>
  );
}

function Row({ label, value, sub, red, note }: { label: string; value: number; sub?: boolean; red?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-100">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">{label}</span>
        {note && <span className="text-[10px] text-gray-400">{note}</span>}
      </div>
      <span className={`font-medium ${red ? "text-red-500" : "text-gray-700"}`}>
        {sub ? "-" : ""}{fmt(value)}원
      </span>
    </div>
  );
}

function RowBold({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 bg-gray-50/80 -mx-1.5 px-1.5 rounded border-b border-gray-100">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-gray-700">{label}</span>
        {note && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">{note}</span>}
      </div>
      <span className="font-bold text-gray-900">{fmt(value)}원</span>
    </div>
  );
}

export function BizTaxCalcModal({ onClose }: { onClose: () => void }) {
  const [revenue, setRevenue] = useState("");
  const [expense, setExpense] = useState("");
  const [extraExpense, setExtraExpense] = useState(""); // 가공경비
  const [startupRate, setStartupRate] = useState(0);
  const [smeRate, setSmeRate] = useState(0);

  const revenueNum = parse(revenue);
  const expenseNum = parse(expense);
  const extraNum = parse(extraExpense);

  const base = calculate(revenueNum, expenseNum, startupRate, smeRate);
  const withExtra = extraNum > 0 ? calculate(revenueNum, expenseNum + extraNum, startupRate, smeRate) : null;
  const taxDiff = withExtra ? base.totalTax - withExtra.totalTax : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-[#1a2e4a] to-[#2a4a6a] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="text-white font-semibold text-lg">사업소득세 간이계산기</h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <p className="text-white/50 text-xs mt-1">2026년 세율 기준 · 프로토타입</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 입력 영역 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">매출액</label>
              <div className="relative">
                <input
                  type="text"
                  value={revenue}
                  onChange={e => setRevenue(numInput(e.target.value))}
                  placeholder="100,000,000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">비용 (경비)</label>
              <div className="relative">
                <input
                  type="text"
                  value={expense}
                  onChange={e => setExpense(numInput(e.target.value))}
                  placeholder="60,000,000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
            </div>
          </div>

          {/* 세액감면 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">창업중소기업 세액감면</label>
              <select
                value={startupRate}
                onChange={e => setStartupRate(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30"
              >
                <option value={0}>미적용</option>
                <option value={25}>25% 감면</option>
                <option value={50}>50% 감면</option>
                <option value={75}>75% 감면</option>
                <option value={100}>100% 감면 (최저한세 배제)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">중소기업특별 세액감면</label>
              <select
                value={smeRate}
                onChange={e => setSmeRate(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30"
              >
                <option value={0}>미적용</option>
                <option value={10}>10% 감면</option>
                <option value={20}>20% 감면</option>
                <option value={30}>30% 감면</option>
              </select>
            </div>
          </div>

          {/* 가공경비 비교 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              가공경비 추가 시 비교 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={extraExpense}
                onChange={e => setExtraExpense(numInput(e.target.value))}
                placeholder="가공경비 금액 입력"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {revenueNum > 0 && (
          <div className="px-6 pb-6">
            {withExtra ? (
              <>
                {/* 비교 모드 */}
                <div className="grid grid-cols-2 gap-4">
                  <ResultCard result={base} label="기본" color="blue" />
                  <ResultCard result={withExtra} label={`가공경비 +${fmt(extraNum)}원`} color="green" />
                </div>

                {/* 차이 요약 */}
                <div className="mt-4 bg-amber-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-800">가공경비 효과 (세금 절감액)</span>
                    <span className="text-xl font-bold text-amber-700">{fmt(taxDiff)}원</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    가공경비 {fmt(extraNum)}원 대비 절감률 {extraNum > 0 ? ((taxDiff / extraNum) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </>
            ) : (
              <ResultCard result={base} label="계산 결과" color="blue" />
            )}

            <p className="text-[10px] text-gray-400 mt-4 text-center">
              * 간이 계산 예상치이며, 실제 세액과 다를 수 있습니다. 소득공제 항목은 추후 추가 예정
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
