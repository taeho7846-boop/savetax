"use client";

import { useState } from "react";
import { BarChartIcon, DownloadIcon } from "@/components/icons";

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

function calcMinTax(computedTax: number): number {
  if (computedTax <= 30000000) return Math.round(computedTax * 0.35);
  return Math.round(30000000 * 0.35 + (computedTax - 30000000) * 0.45);
}

function fmt(n: number): string { return n.toLocaleString("ko-KR"); }
function numInput(v: string): string {
  const num = v.replace(/[^\d]/g, "");
  return num ? parseInt(num).toLocaleString("ko-KR") : "";
}
function parse(v: string): number { return parseInt(v.replace(/,/g, "")) || 0; }

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

type CalcInput = {
  revenue: number;
  expense: number;
  income: number;
  useIncome: boolean;
  // 소득공제
  hasSpouse: boolean;
  dependentCount: number;
  pension: number;
  umbrella: number;
  // 세액감면
  startupRate: number;
  smeRate: number;
  // 세액공제
  investCredit: number;
  employmentCredit: number;
  standardCredit: boolean;
  bookkeepingCredit: boolean;
  // 기납부세액
  prepaidTax: number;
};

type CalcResult = {
  revenue: number;
  expense: number;
  income: number;
  basicDeduct: number;
  spouseDeduct: number;
  dependentDeduct: number;
  pensionDeduct: number;
  umbrellaDeduct: number;
  deduction: number;
  taxBase: number;
  taxRate: string;
  computedTax: number;
  // 최저한세 적용대상
  startupReduction: number;
  smeReduction: number;
  investCredit: number;
  employmentCredit: number;
  afterMinTaxCredits: number;
  minTax: number;
  hitMinTax: boolean;
  afterMinTax: number;
  // 최저한세 적용제외
  standardCreditAmt: number;
  bookkeepingCreditAmt: number;
  finalTax: number;
  localTax: number;
  totalTax: number;
  prepaidTax: number;
  finalPayment: number; // 양수=납부, 음수=환급
};

function calculate(input: CalcInput): CalcResult {
  const baseIncome = input.useIncome
    ? input.income
    : Math.max(input.revenue - input.expense, 0);

  // 소득공제
  const basicDeduct = 1500000;
  const spouseDeduct = input.hasSpouse ? 1500000 : 0;
  const dependentDeduct = input.dependentCount * 1500000;
  const pensionDeduct = input.pension;
  const umbrellaDeduct = input.umbrella;
  const deduction = basicDeduct + spouseDeduct + dependentDeduct + pensionDeduct + umbrellaDeduct;

  const taxBase = Math.max(baseIncome - deduction, 0);
  const taxRate = getTaxRateLabel(taxBase);
  const computedTax = Math.round(calcTax(taxBase));

  // ── 최저한세 적용대상 (감면 + 일부 세액공제) ──
  const startupReduction = Math.round(computedTax * input.startupRate / 100);
  const afterStartup = computedTax - startupReduction;
  const smeReduction = Math.round(afterStartup * input.smeRate / 100);
  const afterSme = afterStartup - smeReduction;
  const afterMinTaxCredits = Math.max(afterSme - input.investCredit - input.employmentCredit, 0);

  // ── 최저한세 비교 ──
  const minTax = calcMinTax(computedTax);
  const hitMinTax = input.startupRate !== 100 && afterMinTaxCredits < minTax;
  const afterMinTax = input.startupRate === 100 ? afterMinTaxCredits : Math.max(afterMinTaxCredits, minTax);

  // ── 최저한세 적용제외 (표준·기장세액공제는 최저한세 이후 차감) ──
  const standardCreditAmt = input.standardCredit ? 70000 : 0;
  const bookkeepingCreditAmt = input.bookkeepingCredit
    ? Math.min(Math.round(computedTax * 0.2), 1000000)
    : 0;

  const finalTax = Math.max(afterMinTax - standardCreditAmt - bookkeepingCreditAmt, 0);

  const localTax = Math.round(finalTax * 0.1);
  const totalTax = finalTax + localTax;
  const finalPayment = totalTax - input.prepaidTax;

  return {
    revenue: input.revenue, expense: input.expense, income: baseIncome,
    basicDeduct, spouseDeduct, dependentDeduct, pensionDeduct, umbrellaDeduct, deduction,
    taxBase, taxRate, computedTax,
    startupReduction, smeReduction,
    investCredit: input.investCredit, employmentCredit: input.employmentCredit,
    afterMinTaxCredits, minTax, hitMinTax, afterMinTax,
    standardCreditAmt, bookkeepingCreditAmt,
    finalTax, localTax, totalTax,
    prepaidTax: input.prepaidTax, finalPayment,
  };
}

// 결정세액 0원이 되는 가공경비 (binary search)
function findZeroTaxGakgong(input: CalcInput): number {
  if (input.useIncome) return 0;
  const base = calculate({ ...input, expense: input.expense });
  if (base.finalTax <= 0) return 0;
  // 매출 한도까지 binary search (가공경비 더해 비용 = 매출 되면 소득금액 0)
  let lo = 0;
  let hi = Math.max(input.revenue - input.expense, 0);
  // hi가 작아도 못 만들면 반환 0
  const hiResult = calculate({ ...input, expense: input.expense + hi });
  if (hiResult.finalTax > 0) return -1; // 만들 수 없음
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = calculate({ ...input, expense: input.expense + mid });
    if (r.finalTax <= 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function ResultCard({ result, label, color }: { result: CalcResult; label: string; color: "blue" | "green" }) {
  const hasPrepaid = result.prepaidTax > 0;
  const isRefund = result.finalPayment < 0;

  // 큰 결과 박스: 기납부세액 있으면 납부/환급 표시, 없으면 총 세액
  let resultLabel: string;
  let resultValue: number;
  let resultBg: string;
  let resultTextColor: string;
  if (hasPrepaid) {
    if (isRefund) {
      resultLabel = "환급 세액";
      resultValue = -result.finalPayment;
      resultBg = "from-blue-50 to-indigo-50";
      resultTextColor = "text-[#3182F6]";
    } else {
      resultLabel = "납부할 세액";
      resultValue = result.finalPayment;
      resultBg = "from-amber-50 to-orange-50";
      resultTextColor = "text-[#B45309]";
    }
  } else {
    resultLabel = "총 납부세액";
    resultValue = result.totalTax;
    resultBg = color === "blue" ? "from-blue-50 to-indigo-50" : "from-emerald-50 to-teal-50";
    resultTextColor = color === "blue" ? "text-[#3182F6]" : "text-emerald-700";
  }

  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-bold text-[#6B7684] uppercase tracking-wider">{label}</h3>

      <div className={`bg-gradient-to-r ${resultBg} rounded-xl p-3.5`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#4E5968]">{resultLabel}</span>
          <span className={`text-xl font-bold ${resultTextColor}`}>{fmt(resultValue)}원</span>
        </div>
      </div>

      <div className="text-xs space-y-0.5">
        {result.revenue > 0 && <Row label="매출액" value={result.revenue} />}
        {result.expense > 0 && <Row label="비용" value={result.expense} sub />}
        <RowBold label="사업소득금액" value={result.income} />
        <Row label="본인 기본공제" value={result.basicDeduct} sub />
        {result.spouseDeduct > 0 && <Row label="배우자공제" value={result.spouseDeduct} sub />}
        {result.dependentDeduct > 0 && <Row label="부양가족공제" value={result.dependentDeduct} sub />}
        {result.pensionDeduct > 0 && <Row label="국민연금" value={result.pensionDeduct} sub />}
        {result.umbrellaDeduct > 0 && <Row label="노란우산공제" value={result.umbrellaDeduct} sub />}
        <RowBold label="과세표준" value={result.taxBase} note={result.taxRate} />
        <Row label="산출세액" value={result.computedTax} />
        {result.startupReduction > 0 && <Row label="창업중소기업 감면" value={result.startupReduction} sub red />}
        {result.smeReduction > 0 && <Row label="중소기업특별 감면" value={result.smeReduction} sub red />}
        {result.investCredit > 0 && <Row label="통합투자 세액공제" value={result.investCredit} sub red />}
        {result.employmentCredit > 0 && <Row label="고용증대 세액공제" value={result.employmentCredit} sub red />}
        {result.minTax > 0 && (
          <div className={`flex items-center justify-between py-1.5 border-b border-[#F2F4F6] ${result.hitMinTax ? "bg-[#FEF2F2]/50 -mx-1.5 px-1.5 rounded" : ""}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-[#6B7684]">최저한세</span>
              {result.hitMinTax && <span className="text-[10px] px-1.5 py-0.5 bg-[#FEF2F2] text-[#DC2626] rounded font-medium">적용</span>}
            </div>
            <span className="font-medium text-[#333D4B]">{fmt(result.minTax)}원</span>
          </div>
        )}
        {(result.minTax > 0 || result.standardCreditAmt > 0 || result.bookkeepingCreditAmt > 0) && (
          <Row label={result.hitMinTax ? "최저한세 적용 후 세액" : "최저한세 비교 후 세액"} value={result.afterMinTax} />
        )}
        {result.standardCreditAmt > 0 && <Row label="표준세액공제 (최저한세 적용제외)" value={result.standardCreditAmt} sub red />}
        {result.bookkeepingCreditAmt > 0 && <Row label="기장세액공제 (20%, 한도 100만, 최저한세 적용제외)" value={result.bookkeepingCreditAmt} sub red />}
        <div className={`flex items-center justify-between py-1.5 -mx-1.5 px-1.5 rounded border-b border-[#F2F4F6] ${result.hitMinTax ? "bg-[#FEF2F2]/80" : "bg-[#F9FAFB]/80"}`}>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#333D4B]">결정세액 (소득세)</span>
            {result.hitMinTax && <span className="text-[10px] text-[#E02E2E]">최저한세 적용</span>}
          </div>
          <span className="font-bold text-[#191F28]">{fmt(result.finalTax)}원</span>
        </div>
        <Row label="지방소득세 (10%)" value={result.localTax} />
        <div className="flex items-center justify-between py-1.5 bg-[#F9FAFB]/80 -mx-1.5 px-1.5 rounded border-b border-[#F2F4F6]">
          <span className="font-medium text-[#333D4B]">총 세액</span>
          <span className="font-bold text-[#191F28]">{fmt(result.totalTax)}원</span>
        </div>
        {hasPrepaid && (
          <>
            <Row label="기납부세액" value={result.prepaidTax} sub red />
            <div className={`flex items-center justify-between py-2 -mx-1.5 px-1.5 rounded ${isRefund ? "bg-blue-50/60" : "bg-amber-50/60"}`}>
              <span className={`font-bold ${isRefund ? "text-[#3182F6]" : "text-[#B45309]"}`}>
                {isRefund ? "환급할 세액" : "납부할 세액"}
              </span>
              <span className={`font-bold ${isRefund ? "text-[#3182F6]" : "text-[#B45309]"}`}>
                {fmt(Math.abs(result.finalPayment))}원
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, sub, red, note }: { label: string; value: number; sub?: boolean; red?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#F2F4F6]">
      <div className="flex items-center gap-1.5">
        <span className="text-[#6B7684]">{label}</span>
        {note && <span className="text-[10px] text-[#8B95A1]">{note}</span>}
      </div>
      <span className={`font-medium ${red ? "text-[#E02E2E]" : "text-[#333D4B]"}`}>
        {sub ? "-" : ""}{fmt(value)}원
      </span>
    </div>
  );
}

function RowBold({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 bg-[#F9FAFB]/80 -mx-1.5 px-1.5 rounded border-b border-[#F2F4F6]">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-[#333D4B]">{label}</span>
        {note && <span className="text-[10px] px-1.5 py-0.5 bg-[#E5E8EB] rounded text-[#4E5968]">{note}</span>}
      </div>
      <span className="font-bold text-[#191F28]">{fmt(value)}원</span>
    </div>
  );
}

type BizTaxCalcProps = {
  onClose: () => void;
  clientName?: string;
  clientId?: number;
  taxYear?: string;
  loadData?: {
    currSales: string | null;
    currIncome: string | null;
    aiStartup: string | null;
    aiSme: string | null;
  };
  onApply?: (finalTax: number) => void;
  onSaved?: () => void;
};

export function BizTaxCalcModal({ onClose, clientName, clientId, taxYear, loadData, onApply, onSaved }: BizTaxCalcProps) {
  const [revenue, setRevenue] = useState("");
  const [expense, setExpense] = useState("");
  const [income, setIncome] = useState("");
  const [useIncome, setUseIncome] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // 소득공제
  const [hasSpouse, setHasSpouse] = useState(false);
  const [dependentCount, setDependentCount] = useState("0");
  const [pensionInput, setPensionInput] = useState("");
  const [umbrellaInput, setUmbrellaInput] = useState("");

  // 가공경비 / 감면
  const [extraExpense, setExtraExpense] = useState("");
  const [startupRate, setStartupRate] = useState(0);
  const [smeRate, setSmeRate] = useState(0);
  const [investCreditInput, setInvestCreditInput] = useState("");
  const [employmentCreditInput, setEmploymentCreditInput] = useState("");

  // 세액공제
  const [standardCredit, setStandardCredit] = useState(true); // 기본 적용
  const [bookkeepingCredit, setBookkeepingCredit] = useState(false);

  // 기납부세액
  const [prepaidTaxInput, setPrepaidTaxInput] = useState("");

  // 저장된 설정 불러오기
  useState(() => {
    if (!clientId || !taxYear) return;
    fetch(`/api/income-tax/calc-setting?clientId=${clientId}&taxYear=${taxYear}`)
      .then(r => r.json())
      .then(data => {
        if (data.setting) {
          const s = data.setting;
          if (s.revenue) setRevenue(numInput(s.revenue));
          if (s.expense) setExpense(numInput(s.expense));
          if (s.income) setIncome(numInput(s.income));
          setUseIncome(s.useIncome || false);
          setStartupRate(s.startupRate || 0);
          setSmeRate(s.smeRate || 0);
          if (s.investCredit) setInvestCreditInput(numInput(s.investCredit));
          if (s.employmentCredit) setEmploymentCreditInput(numInput(s.employmentCredit));
          if (s.extraExpense) setExtraExpense(numInput(s.extraExpense));
          // fullData에서 새 필드 복원
          const f = s.fullData || {};
          if (f.hasSpouse) setHasSpouse(!!f.hasSpouse);
          if (f.dependentCount != null) setDependentCount(String(f.dependentCount));
          if (f.pension) setPensionInput(numInput(String(f.pension)));
          if (f.umbrella) setUmbrellaInput(numInput(String(f.umbrella)));
          if (f.standardCredit != null) setStandardCredit(!!f.standardCredit);
          if (f.bookkeepingCredit != null) setBookkeepingCredit(!!f.bookkeepingCredit);
          if (f.prepaidTax) setPrepaidTaxInput(numInput(String(f.prepaidTax)));
          setSavedOnce(true);
          setLoaded(true);
        }
      })
      .catch(() => {});
  });

  async function handleSave() {
    if (!clientId || !taxYear) return;
    setSaving(true);
    try {
      await fetch("/api/income-tax/calc-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, taxYear,
          revenue: revenue.replace(/,/g, "") || null,
          expense: expense.replace(/,/g, "") || null,
          income: income.replace(/,/g, "") || null,
          useIncome,
          startupRate, smeRate,
          investCredit: investCreditInput.replace(/,/g, "") || null,
          employmentCredit: employmentCreditInput.replace(/,/g, "") || null,
          extraExpense: extraExpense.replace(/,/g, "") || null,
          fullData: {
            hasSpouse,
            dependentCount: parseInt(dependentCount) || 0,
            pension: parse(pensionInput),
            umbrella: parse(umbrellaInput),
            standardCredit,
            bookkeepingCredit,
            prepaidTax: parse(prepaidTaxInput),
          },
        }),
      });
      setSavedOnce(true);
      onSaved?.();
      alert("저장 완료!");
    } catch { alert("저장 실패"); }
    finally { setSaving(false); }
  }

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
  const pensionNum = parse(pensionInput);
  const umbrellaNum = parse(umbrellaInput);
  const dependentCountNum = parseInt(dependentCount) || 0;

  const prepaidTaxNum = parse(prepaidTaxInput);

  const baseInput: CalcInput = {
    revenue: revenueNum, expense: expenseNum, income: incomeNum, useIncome,
    hasSpouse, dependentCount: dependentCountNum,
    pension: pensionNum, umbrella: umbrellaNum,
    startupRate, smeRate,
    investCredit: investCreditNum, employmentCredit: employmentCreditNum,
    standardCredit, bookkeepingCredit,
    prepaidTax: prepaidTaxNum,
  };

  const base = calculate(baseInput);
  const withExtra = extraNum > 0 && !useIncome
    ? calculate({ ...baseInput, expense: expenseNum + extraNum })
    : null;
  const taxDiff = withExtra ? base.totalTax - withExtra.totalTax : 0;

  // 결정세액 0 만들기 추천 가공경비
  const zeroTaxGakgong = !useIncome && revenueNum > 0 ? findZeroTaxGakgong(baseInput) : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-[#3182F6] to-[#2a4a6a] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChartIcon width={20} height={20} className="text-white" />
              <h2 className="text-white font-bold text-lg">
                {clientName ? `${clientName} — 세액계산` : "사업소득세 간이계산기"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {onApply && (useIncome ? incomeNum > 0 : revenueNum > 0) && (
                <button
                  onClick={() => {
                    const tax = withExtra ? withExtra.finalTax : base.finalTax;
                    onApply(tax);
                    onClose();
                  }}
                  className="text-xs px-3 py-1.5 bg-[#1AB266] text-white rounded-lg hover:bg-[#16A865]"
                >
                  결정세액 반영
                </button>
              )}
              {clientId && taxYear && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "💾 저장"}
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
                  className="text-xs px-3 py-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30 inline-flex items-center gap-1"
                >
                  <DownloadIcon width={12} height={12} />
                  당기 데이터 불러오기
                </button>
              )}
              {loaded && <span className="text-xs text-white/50">✅ 불러오기 완료</span>}
              {loadData.aiStartup && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${loadData.aiStartup === "O" ? "bg-[#1AB266]/30 text-green-200" : "bg-[#E02E2E]/30 text-red-200"}`}>
                  창중감 {loadData.aiStartup === "O" ? "가능" : "불가"}
                </span>
              )}
              {loadData.aiSme && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${loadData.aiSme === "O" ? "bg-[#1AB266]/30 text-green-200" : "bg-[#E02E2E]/30 text-red-200"}`}>
                  중특감 {loadData.aiSme === "O" ? "가능" : "불가"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 입력 모드 전환 */}
          <div className="flex bg-[#F2F4F6] rounded-xl p-1">
            <button
              onClick={() => setUseIncome(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!useIncome ? "bg-white text-[#3182F6] shadow-sm" : "text-[#6B7684]"}`}
            >
              매출 - 비용
            </button>
            <button
              onClick={() => setUseIncome(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${useIncome ? "bg-white text-[#3182F6] shadow-sm" : "text-[#6B7684]"}`}
            >
              종합소득금액 직접 입력
            </button>
          </div>

          {/* 입력 영역 */}
          {useIncome ? (
            <div>
              <label className="text-xs font-medium text-[#6B7684] mb-1 block">종합소득금액</label>
              <div className="relative">
                <input
                  type="text"
                  value={income}
                  onChange={e => setIncome(numInput(e.target.value))}
                  placeholder="40,000,000"
                  className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6] text-right pr-8"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6B7684] mb-1 block">매출액</label>
                <div className="relative">
                  <input
                    type="text"
                    value={revenue}
                    onChange={e => setRevenue(numInput(e.target.value))}
                    placeholder="100,000,000"
                    className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6] text-right pr-8"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#6B7684] mb-1 block">비용 (경비)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={expense}
                    onChange={e => setExpense(numInput(e.target.value))}
                    placeholder="60,000,000"
                    className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm font-bold text-[#191F28] focus:outline-none focus:border-[#3182F6] text-right pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
                </div>
              </div>
            </div>
          )}

          {/* 소득공제 */}
          <div className="bg-[#F9FAFB] rounded-xl p-3 border border-[#E5E8EB]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-[#4E5968]">소득공제</h3>
              <span className="text-[10px] text-[#8B95A1]">본인 150만 자동</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#E5E8EB] cursor-pointer">
                <input type="checkbox" checked={hasSpouse} onChange={e => setHasSpouse(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                <span className="text-xs text-[#4E5968]">배우자공제 (150만)</span>
              </label>
              <div className="bg-white rounded-lg px-3 py-1.5 border border-[#E5E8EB] flex items-center gap-2">
                <span className="text-[11px] text-[#6B7684] shrink-0">부양가족</span>
                <select
                  value={dependentCount}
                  onChange={e => setDependentCount(e.target.value)}
                  className="flex-1 text-xs border-0 focus:outline-none bg-transparent"
                >
                  {[0,1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}명 ({fmt(n*1500000)})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#6B7684] mb-0.5 block">국민연금</label>
                <div className="relative">
                  <input type="text" value={pensionInput} onChange={e => setPensionInput(numInput(e.target.value))}
                    placeholder="0"
                    className="w-full border border-[#E5E8EB] rounded-lg px-2.5 py-1.5 text-xs text-right pr-7 focus:outline-none focus:border-[#3182F6]" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">원</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#6B7684] mb-0.5 block">노란우산공제</label>
                <div className="relative">
                  <input type="text" value={umbrellaInput} onChange={e => setUmbrellaInput(numInput(e.target.value))}
                    placeholder="0"
                    className="w-full border border-[#E5E8EB] rounded-lg px-2.5 py-1.5 text-xs text-right pr-7 focus:outline-none focus:border-[#3182F6]" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">원</span>
                </div>
              </div>
            </div>
          </div>

          {/* 세액감면 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#6B7684] mb-1 block">창업중소기업 세액감면</label>
              <select
                value={startupRate}
                onChange={e => setStartupRate(parseInt(e.target.value))}
                className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                <option value={0}>미적용</option>
                <option value={25}>25% 감면</option>
                <option value={50}>50% 감면</option>
                <option value={75}>75% 감면</option>
                <option value={100}>100% 감면 (최저한세 배제)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#6B7684] mb-1 block">중소기업특별 세액감면</label>
              <select
                value={smeRate}
                onChange={e => setSmeRate(parseInt(e.target.value))}
                className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6]"
              >
                <option value={0}>미적용</option>
                <option value={10}>10% 감면</option>
                <option value={20}>20% 감면</option>
                <option value={30}>30% 감면</option>
              </select>
            </div>
          </div>

          {/* 세액공제 */}
          <div className="bg-[#F9FAFB] rounded-xl p-3 border border-[#E5E8EB]">
            <h3 className="text-xs font-bold text-[#4E5968] mb-2">세액공제</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-[#6B7684] mb-0.5 block">통합투자 세액공제</label>
                <div className="relative">
                  <input type="text" value={investCreditInput} onChange={e => setInvestCreditInput(numInput(e.target.value))}
                    placeholder="0"
                    className="w-full border border-[#E5E8EB] rounded-lg px-2.5 py-1.5 text-xs text-right pr-7 focus:outline-none focus:border-[#3182F6]" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">원</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#6B7684] mb-0.5 block">고용증대 세액공제</label>
                <div className="relative">
                  <input type="text" value={employmentCreditInput} onChange={e => setEmploymentCreditInput(numInput(e.target.value))}
                    placeholder="0"
                    className="w-full border border-[#E5E8EB] rounded-lg px-2.5 py-1.5 text-xs text-right pr-7 focus:outline-none focus:border-[#3182F6]" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">원</span>
                </div>
              </div>
              <label className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#E5E8EB] cursor-pointer">
                <input type="checkbox" checked={standardCredit} onChange={e => setStandardCredit(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                <span className="text-xs text-[#4E5968]">표준세액공제 (7만원)</span>
              </label>
              <label className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200 bg-amber-50 cursor-pointer">
                <input type="checkbox" checked={bookkeepingCredit} onChange={e => setBookkeepingCredit(e.target.checked)} className="accent-amber-600 w-3.5 h-3.5" />
                <span className="text-xs text-amber-800 font-medium">기장세액공제 (20%, 한도 100만)</span>
              </label>
            </div>
            <p className="text-[10px] text-[#8B95A1] mt-2">
              기장세액공제 = 간편장부 대상자가 복식부기로 작성한 경우 산출세액의 20% 감면 (한도 100만원)
            </p>
          </div>

          {/* 기납부세액 */}
          <div>
            <label className="text-xs font-medium text-[#6B7684] mb-1 block">
              기납부세액 <span className="text-[#8B95A1] font-normal">(원천징수·중간예납 등)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={prepaidTaxInput}
                onChange={e => setPrepaidTaxInput(numInput(e.target.value))}
                placeholder="0"
                className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] text-right pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
            </div>
          </div>

          {/* 가공경비 비교 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#6B7684]">
                가공경비 추가 시 비교 <span className="text-[#8B95A1] font-normal">(선택)</span>
              </label>
              {!useIncome && zeroTaxGakgong > 0 && (
                <button
                  onClick={() => setExtraExpense(numInput(String(zeroTaxGakgong)))}
                  className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium"
                >
                  🎯 결정세액 0원: {fmt(zeroTaxGakgong)}원
                </button>
              )}
              {!useIncome && zeroTaxGakgong === -1 && (
                <span className="text-[10px] px-2 py-1 bg-[#F2F4F6] text-[#8B95A1] rounded-lg">
                  매출 한도 내에서 0원 불가능
                </span>
              )}
              {!useIncome && zeroTaxGakgong === 0 && base.finalTax === 0 && revenueNum > 0 && (
                <span className="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                  ✓ 이미 0원
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={extraExpense}
                onChange={e => setExtraExpense(numInput(e.target.value))}
                placeholder="가공경비 금액 입력"
                className="w-full border border-[#E5E8EB] rounded-xl px-3 py-2.5 text-sm text-[#191F28] focus:outline-none focus:border-[#3182F6] text-right pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {(useIncome ? incomeNum > 0 : revenueNum > 0) && (
          <div className="px-6 pb-6">
            {/* 납부세액 0 도달 안내 */}
            {!useIncome && base.totalTax === 0 && (
              <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <span className="text-emerald-600 text-lg">🎯</span>
                <span className="text-sm font-bold text-emerald-700">납부세액 0원 도달!</span>
              </div>
            )}

            {withExtra ? (
              <>
                {/* 비교 모드 */}
                <div className="grid grid-cols-2 gap-4">
                  <ResultCard result={base} label="기본" color="blue" />
                  <ResultCard result={withExtra} label={`가공경비 +${fmt(extraNum)}원`} color="green" />
                </div>

                {/* 차이 요약 */}
                <div className="mt-4 bg-[#FFFBEB] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-800">가공경비 효과 (세금 절감액)</span>
                    <span className="text-xl font-bold text-[#B45309]">{fmt(taxDiff)}원</span>
                  </div>
                  <p className="text-xs text-[#D97706] mt-1">
                    가공경비 {fmt(extraNum)}원 대비 절감률 {extraNum > 0 ? ((taxDiff / extraNum) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </>
            ) : (
              <ResultCard result={base} label="계산 결과" color="blue" />
            )}

            <p className="text-[10px] text-[#8B95A1] mt-4 text-center">
              * 간이 계산 예상치이며, 실제 세액과 다를 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
