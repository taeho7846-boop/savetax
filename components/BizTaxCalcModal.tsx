"use client";

import { useState } from "react";

// 소득세율 (2026년)
function calcTax(taxBase: number): number {
  if (taxBase <= 0) return 0;
  if (taxBase <= 14000000) return taxBase * 0.06;
  if (taxBase <= 50000000) return 840000 + (taxBase - 14000000) * 0.15;
  if (taxBase <= 88000000) return 6240000 + (taxBase - 50000000) * 0.24;
  if (taxBase <= 150000000) return 15360000 + (taxBase - 88000000) * 0.35;
  if (taxBase <= 300000000) return 37060000 + (taxBase - 150000000) * 0.38;
  if (taxBase <= 500000000) return 94060000 + (taxBase - 300000000) * 0.40;
  if (taxBase <= 1000000000) return 174060000 + (taxBase - 500000000) * 0.42;
  return 384060000 + (taxBase - 1000000000) * 0.45;
}

// 최저한세 계산
function calcMinTax(computedTax: number): number {
  if (computedTax <= 30000000) return Math.round(computedTax * 0.35);
  return Math.round(30000000 * 0.35 + (computedTax - 30000000) * 0.45);
}

// 감면 적용 + 최저한세 반영
function applyReduction(
  computedTax: number,
  startupRate: number,
  smeRate: number,
  investCredit: number,
  employmentCredit: number,
): { startupReduction: number; smeReduction: number; investCredit: number; employmentCredit: number; afterReduction: number; minTax: number; hitMinTax: boolean; finalTax: number } {
  const startupReduction = Math.round(computedTax * startupRate / 100);
  const afterStartup = computedTax - startupReduction;
  const smeReduction = Math.round(afterStartup * smeRate / 100);
  const afterSme = afterStartup - smeReduction;
  const afterReduction = Math.max(afterSme - investCredit - employmentCredit, 0);

  const minTax = calcMinTax(computedTax);

  if (startupRate === 100) {
    return { startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax: 0, hitMinTax: false, finalTax: afterReduction };
  }

  const hitMinTax = afterReduction < minTax;
  const finalTax = Math.max(afterReduction, minTax);
  return { startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax, hitMinTax, finalTax };
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
  investCredit: number;
  employmentCredit: number;
  afterReduction: number;
  minTax: number;
  hitMinTax: boolean;
  finalTax: number;
  localTax: number;
  totalTax: number;
};

function calculate(
  revenue: number,
  expense: number,
  startupRate: number,
  smeRate: number,
  investCreditAmt: number = 0,
  employmentCreditAmt: number = 0,
): CalcResult {
  const income = Math.max(revenue - expense, 0);
  const deduction = 1500000;
  const taxBase = Math.max(income - deduction, 0);
  const taxRate = getTaxRateLabel(taxBase);
  const computedTax = Math.round(calcTax(taxBase));
  const { startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax, hitMinTax, finalTax } = applyReduction(computedTax, startupRate, smeRate, investCreditAmt, employmentCreditAmt);
  const localTax = Math.round(finalTax * 0.1);
  const totalTax = finalTax + localTax;
  return { revenue, expense, income, deduction, taxBase, taxRate, computedTax, startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax, hitMinTax, finalTax, localTax, totalTax };
}

function calculateFromIncome(
  incomeAmt: number,
  startupRate: number,
  smeRate: number,
  investCreditAmt: number = 0,
  employmentCreditAmt: number = 0,
): CalcResult {
  const deduction = 1500000;
  const taxBase = Math.max(incomeAmt - deduction, 0);
  const taxRate = getTaxRateLabel(taxBase);
  const computedTax = Math.round(calcTax(taxBase));
  const { startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax, hitMinTax, finalTax } = applyReduction(computedTax, startupRate, smeRate, investCreditAmt, employmentCreditAmt);
  const localTax = Math.round(finalTax * 0.1);
  const totalTax = finalTax + localTax;
  return { revenue: 0, expense: 0, income: incomeAmt, deduction, taxBase, taxRate, computedTax, startupReduction, smeReduction, investCredit, employmentCredit, afterReduction, minTax, hitMinTax, finalTax, localTax, totalTax };
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
        {result.revenue > 0 && <Row label="매출액" value={result.revenue} />}
        {result.expense > 0 && <Row label="비용" value={result.expense} sub />}
        <RowBold label="사업소득금액" value={result.income} />
        <Row label="기본공제" value={result.deduction} sub />
        <RowBold label="과세표준" value={result.taxBase} note={result.taxRate} />
        <Row label="산출세액" value={result.computedTax} />
        {result.startupReduction > 0 && <Row label="창업중소기업 감면" value={result.startupReduction} sub red />}
        {result.smeReduction > 0 && <Row label="중소기업특별 감면" value={result.smeReduction} sub red />}
        {result.investCredit > 0 && <Row label="통합투자 세액공제" value={result.investCredit} sub red />}
        {result.employmentCredit > 0 && <Row label="고용증대 세액공제" value={result.employmentCredit} sub red />}
        {(result.startupReduction > 0 || result.smeReduction > 0) && (
          <Row label="감면 후 세액" value={result.afterReduction} />
        )}
        {result.minTax > 0 && (
          <div className={`flex items-center justify-between py-1.5 border-b border-gray-100 ${result.hitMinTax ? "bg-red-50/50 -mx-1.5 px-1.5 rounded" : ""}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">최저한세</span>
              {result.hitMinTax && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">적용</span>}
            </div>
            <span className="font-medium text-gray-700">{fmt(result.minTax)}원</span>
          </div>
        )}
        <div className={`flex items-center justify-between py-1.5 -mx-1.5 px-1.5 rounded border-b border-gray-100 ${result.hitMinTax ? "bg-red-50/80" : "bg-gray-50/80"}`}>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-700">결정세액 (소득세)</span>
            {result.hitMinTax && <span className="text-[10px] text-red-500">= 최저한세</span>}
            {(result.startupReduction > 0 || result.smeReduction > 0) && !result.hitMinTax && <span className="text-[10px] text-blue-500">= 감면 후 세액</span>}
          </div>
          <span className="font-bold text-gray-900">{fmt(result.finalTax)}원</span>
        </div>
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

type BizTaxCalcProps = {
  onClose: () => void;
  clientName?: string;
  loadData?: {
    currSales: string | null;
    currIncome: string | null;
    aiStartup: string | null;
    aiSme: string | null;
  };
  onApply?: (finalTax: number) => void;
};

export function BizTaxCalcModal({ onClose, clientName, loadData, onApply }: BizTaxCalcProps) {
  const [revenue, setRevenue] = useState("");
  const [expense, setExpense] = useState("");
  const [income, setIncome] = useState("");
  const [useIncome, setUseIncome] = useState(false);
  const [loaded, setLoaded] = useState(false); // 종합소득금액 직접 입력 모드
  const [extraExpense, setExtraExpense] = useState("");
  const [startupRate, setStartupRate] = useState(0);
  const [smeRate, setSmeRate] = useState(0);
  const [investCreditInput, setInvestCreditInput] = useState("");
  const [employmentCreditInput, setEmploymentCreditInput] = useState("");

  function handleLoad() {
    if (!loadData) return;
    const sales = parse(loadData.currSales || "0");
    const inc = parse(loadData.currIncome || "0");
    const exp = Math.max(sales - inc, 0);
    setRevenue(sales > 0 ? numInput(String(sales)) : "");
    setExpense(exp > 0 ? numInput(String(exp)) : "");
    setIncome(inc > 0 ? numInput(String(inc)) : "");
    setUseIncome(false);
    setLoaded(true);
  }

  const revenueNum = parse(revenue);
  const expenseNum = parse(expense);
  const incomeNum = parse(income);
  const extraNum = parse(extraExpense);
  const investCreditNum = parse(investCreditInput);
  const employmentCreditNum = parse(employmentCreditInput);

  const base = useIncome
    ? calculateFromIncome(incomeNum, startupRate, smeRate, investCreditNum, employmentCreditNum)
    : calculate(revenueNum, expenseNum, startupRate, smeRate, investCreditNum, employmentCreditNum);
  const withExtra = extraNum > 0
    ? (useIncome
      ? calculateFromIncome(incomeNum, startupRate, smeRate, investCreditNum, employmentCreditNum) // 가공경비는 매출-비용 모드에서만
      : calculate(revenueNum, expenseNum + extraNum, startupRate, smeRate, investCreditNum, employmentCreditNum))
    : null;
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
              <h2 className="text-white font-semibold text-lg">
                {clientName ? `${clientName} — 세액계산` : "사업소득세 간이계산기"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {onApply && base.finalTax > 0 && (
                <button
                  onClick={() => { onApply(base.finalTax); onClose(); }}
                  className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  결정세액 반영
                </button>
              )}
              <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
            </div>
          </div>
          <p className="text-white/50 text-xs mt-1">2026년 세율 기준</p>
          {loadData && (
            <div className="flex items-center gap-2 mt-2">
              {!loaded && (
                <button
                  onClick={handleLoad}
                  className="text-xs px-3 py-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30"
                >
                  📥 당기 데이터 불러오기
                </button>
              )}
              {loaded && <span className="text-xs text-white/50">✅ 불러오기 완료</span>}
              {loadData.aiStartup && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${loadData.aiStartup === "O" ? "bg-green-500/30 text-green-200" : "bg-red-500/30 text-red-200"}`}>
                  창중감 {loadData.aiStartup === "O" ? "가능" : "불가"}
                </span>
              )}
              {loadData.aiSme && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${loadData.aiSme === "O" ? "bg-green-500/30 text-green-200" : "bg-red-500/30 text-red-200"}`}>
                  중특감 {loadData.aiSme === "O" ? "가능" : "불가"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 입력 모드 전환 */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setUseIncome(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!useIncome ? "bg-white text-[#1a2e4a] shadow-sm" : "text-gray-500"}`}
            >
              매출 - 비용
            </button>
            <button
              onClick={() => setUseIncome(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${useIncome ? "bg-white text-[#1a2e4a] shadow-sm" : "text-gray-500"}`}
            >
              종합소득금액 직접 입력
            </button>
          </div>

          {/* 입력 영역 */}
          {useIncome ? (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">종합소득금액</label>
              <div className="relative">
                <input
                  type="text"
                  value={income}
                  onChange={e => setIncome(numInput(e.target.value))}
                  placeholder="40,000,000"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
            </div>
          ) : (
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
          )}

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

          {/* 세액공제 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">통합투자 세액공제</label>
              <div className="relative">
                <input
                  type="text"
                  value={investCreditInput}
                  onChange={e => setInvestCreditInput(numInput(e.target.value))}
                  placeholder="금액 입력"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">고용증대 세액공제</label>
              <div className="relative">
                <input
                  type="text"
                  value={employmentCreditInput}
                  onChange={e => setEmploymentCreditInput(numInput(e.target.value))}
                  placeholder="금액 입력"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 text-right pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
              </div>
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
        {(useIncome ? incomeNum > 0 : revenueNum > 0) && (
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
