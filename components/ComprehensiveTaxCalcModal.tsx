"use client";

import { useState, useEffect } from "react";
import { BarChartIcon, DownloadIcon } from "@/components/icons";

// ── 세율 계산 ──
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

function getTaxRateLabel(tb: number): string {
  if (tb <= 14000000) return "6%";
  if (tb <= 50000000) return "15%";
  if (tb <= 88000000) return "24%";
  if (tb <= 150000000) return "35%";
  if (tb <= 300000000) return "38%";
  if (tb <= 500000000) return "40%";
  if (tb <= 1000000000) return "42%";
  return "45%";
}

function fmt(n: number): string { return n.toLocaleString("ko-KR"); }
function numInput(v: string): string {
  const num = v.replace(/[^\d]/g, "");
  return num ? parseInt(num).toLocaleString("ko-KR") : "";
}
function parse(v: string): number { return parseInt(v.replace(/,/g, "")) || 0; }

// ── 소득 탭 타입 ──
type IncomeTab = {
  id: string;
  name: string;
  type: "business" | "employment" | "other";
  // 사업소득
  revenue: string;
  expense: string;
  startupRate: number;
  smeRate: number;
  investCredit: string;
  employmentCredit: string;
  prepaidTax: string;
  // 근로소득
  grossSalary: string; // 총급여액
  taxBase: string;
  earnedIncomeCredit: string;
  // 기타소득
  otherIncome: string;
  otherExpense: string;
  otherIncomeAmount: string;
  otherTaxType: "separate" | "combined";
};

function newTab(type: "business" | "employment" | "other", name: string): IncomeTab {
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name, type,
    revenue: "", expense: "", startupRate: 0, smeRate: 0,
    investCredit: "", employmentCredit: "", prepaidTax: "",
    grossSalary: "", taxBase: "", earnedIncomeCredit: "",
    otherIncome: "", otherExpense: "", otherIncomeAmount: "", otherTaxType: "separate",
  };
}

type Dependent = {
  id: string;
  name: string;
  relation: "spouse" | "father" | "mother" | "child" | "other"; // 배우자/부/모/자녀/기타
  birthOrder: number; // 출생순서 (자녀인 경우 1=첫째, 2=둘째...)
  residentNumber: string; // 앞 6자리
  isDisabled: boolean;
};

function getBirthYear(residentNumber: string): number | null {
  if (residentNumber.length < 6) return null;
  const yy = parseInt(residentNumber.slice(0, 2));
  return yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
}

function isElderly(residentNumber: string, taxYear: string): boolean {
  const birthYear = getBirthYear(residentNumber);
  if (!birthYear) return false;
  return birthYear <= parseInt(taxYear) - 70; // 만 70세이상
}

function isChildTaxCredit(residentNumber: string, taxYear: string): boolean {
  const birthYear = getBirthYear(residentNumber);
  if (!birthYear) return false;
  const year = parseInt(taxYear);
  return birthYear >= year - 20 && birthYear <= year - 8; // 만 8세~만 20세
}

function calcChildCredit(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 250000; // 25만원
  if (count === 2) return 550000; // 55만원
  return 550000 + (count - 2) * 400000; // 55만 + 초과 1명당 40만
}

function calcEarnedIncomeCredit(earnedTax: number, grossSalary: number): number {
  if (earnedTax <= 0) return 0;

  // 산출세액 기준 공제액
  let creditAmt: number;
  if (earnedTax <= 1300000) {
    creditAmt = Math.round(earnedTax * 0.55);
  } else {
    creditAmt = 715000 + Math.round((earnedTax - 1300000) * 0.3);
  }

  // 한도
  let limit: number;
  if (grossSalary <= 33000000) {
    limit = 740000;
  } else if (grossSalary <= 70000000) {
    limit = Math.max(740000 - Math.round((grossSalary - 33000000) * 8 / 1000), 660000);
  } else if (grossSalary <= 120000000) {
    limit = Math.max(660000 - Math.round((grossSalary - 70000000) * 0.5), 500000);
  } else {
    limit = Math.max(500000 - Math.round((grossSalary - 120000000) * 0.5), 200000);
  }

  return Math.min(creditAmt, limit);
}

const RELATION_LABELS: Record<string, string> = {
  spouse: "배우자", father: "부", mother: "모", child: "자녀", other: "기타",
};

function calcBirthCredit(order: number): number {
  if (order === 1) return 300000; // 첫째 30만
  if (order === 2) return 500000; // 둘째 50만
  return 700000; // 셋째 이상 70만
}

type Props = {
  onClose: () => void;
  clientName: string;
  clientId: number;
  taxYear: string;
  loadData: {
    currSales: string | null;
    currIncome: string | null;
    aiStartup: string | null;
    aiSme: string | null;
  };
  onApply?: (finalTax: number) => void;
  onSaved?: () => void;
};

export function ComprehensiveTaxCalcModal({ onClose, clientName, clientId, taxYear, loadData, onApply, onSaved }: Props) {
  // 탭 상태
  const [activeTab, setActiveTab] = useState("summary"); // "summary" | "main" | tab.id
  const [mainTab, setMainTab] = useState<IncomeTab>(() => ({
    ...newTab("business", clientName),
    id: "main",
  }));
  const [extraTabs, setExtraTabs] = useState<IncomeTab[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<"business" | "employment" | "other">("business");

  // 소득공제
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [deductWoman, setDeductWoman] = useState(false);
  const [deductSingleParent, setDeductSingleParent] = useState(false);
  const [deductPension, setDeductPension] = useState(""); // 국민연금보험료
  const [deductUmbrella, setDeductUmbrella] = useState(""); // 노란우산공제

  // 세액공제
  const [pensionSaving, setPensionSaving] = useState("");
  const [retirementPension, setRetirementPension] = useState("");
  const [marriageCredit, setMarriageCredit] = useState(false);
  const [bookkeepingCredit, setBookkeepingCredit] = useState(false); // 기장세액공제

  // 가공경비
  const [extraExpense, setExtraExpense] = useState("");

  // 저장된 설정 불러오기
  useEffect(() => {
    fetch(`/api/income-tax/calc-setting?clientId=${clientId}&taxYear=${taxYear}`)
      .then(r => r.json())
      .then(data => {
        if (data.setting?.fullData) {
          try {
            const saved = JSON.parse(data.setting.fullData);
            if (saved.mainTab) setMainTab(saved.mainTab);
            if (saved.extraTabs) setExtraTabs(saved.extraTabs);
            if (saved.dependents) setDependents(saved.dependents);
            if (saved.deductions) {
              setDeductWoman(saved.deductions.woman || false);
              setDeductSingleParent(saved.deductions.singleParent || false);
              setDeductPension(saved.deductions.pension || "");
              setDeductUmbrella(saved.deductions.umbrella || "");
            }
            if (saved.credits) {
              setPensionSaving(saved.credits.pensionSaving || "");
              setRetirementPension(saved.credits.retirementPension || "");
              setMarriageCredit(saved.credits.marriageCredit || false);
              setBookkeepingCredit(saved.credits.bookkeepingCredit || false);
            }
            if (saved.extraExpense) setExtraExpense(saved.extraExpense);
            setLoaded(true);
          } catch {}
        }
      })
      .catch(() => {});
  }, [clientId, taxYear]);

  // 불러오기 (당기 데이터)
  function handleLoad() {
    const sales = parse(loadData.currSales || "0");
    const inc = parse(loadData.currIncome || "0");
    const exp = Math.max(sales - inc, 0);
    setMainTab(prev => ({
      ...prev,
      revenue: sales > 0 ? numInput(String(sales)) : "",
      expense: exp > 0 ? numInput(String(exp)) : "",
    }));
    setLoaded(true);
  }

  // 저장
  async function handleSave() {
    setSaving(true);
    try {
      const fullData = JSON.stringify({
        mainTab, extraTabs, dependents,
        deductions: {
          woman: deductWoman, singleParent: deductSingleParent,
          pension: deductPension, umbrella: deductUmbrella,
        },
        credits: {
          pensionSaving, retirementPension, marriageCredit, bookkeepingCredit,
        },
        extraExpense,
      });
      await fetch("/api/income-tax/calc-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, taxYear,
          revenue: mainTab.revenue.replace(/,/g, "") || null,
          expense: mainTab.expense.replace(/,/g, "") || null,
          income: null, useIncome: false,
          startupRate: mainTab.startupRate, smeRate: mainTab.smeRate,
          investCredit: mainTab.investCredit.replace(/,/g, "") || null,
          employmentCredit: mainTab.employmentCredit.replace(/,/g, "") || null,
          extraExpense: extraExpense.replace(/,/g, "") || null,
          fullData,
        }),
      });
      onSaved?.();
      alert("저장 완료!");
    } catch { alert("저장 실패"); }
    finally { setSaving(false); }
  }

  // 탭 추가
  function handleAddTab() {
    if (!addName.trim()) return alert("이름을 입력해주세요.");
    const tab = newTab(addType, addName.trim());
    setExtraTabs(prev => [...prev, tab]);
    setActiveTab(tab.id);
    setAddModal(false);
    setAddName("");
  }

  function removeTab(id: string) {
    if (!confirm("이 소득 탭을 삭제하시겠습니까?")) return;
    setExtraTabs(prev => prev.filter(t => t.id !== id));
    setActiveTab("summary");
  }

  function updateExtra(id: string, updates: Partial<IncomeTab>) {
    setExtraTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  // ── 계산 ──
  const mainIncome = Math.max(parse(mainTab.revenue) - parse(mainTab.expense), 0);
  const extraExpNum = parse(extraExpense);
  const mainIncomeWithExtra = Math.max(parse(mainTab.revenue) - parse(mainTab.expense) - extraExpNum, 0);

  // 추가 사업소득 합계
  const extraBizIncomes = extraTabs.filter(t => t.type === "business").map(t => ({
    id: t.id, name: t.name, income: Math.max(parse(t.revenue) - parse(t.expense), 0),
    startupRate: t.startupRate, smeRate: t.smeRate,
    investCredit: parse(t.investCredit), employmentCredit: parse(t.employmentCredit),
    prepaidTax: parse(t.prepaidTax),
  }));
  const extraBizTotal = extraBizIncomes.reduce((s, b) => s + b.income, 0);

  // 근로소득
  const employmentIncomes = extraTabs.filter(t => t.type === "employment").map(t => ({
    id: t.id, income: parse(t.taxBase), credit: parse(t.earnedIncomeCredit), prepaidTax: parse(t.prepaidTax),
  }));
  const employmentTotal = employmentIncomes.reduce((s, e) => s + e.income, 0);

  // 기타소득 (종합과세만)
  const otherIncomes = extraTabs.filter(t => t.type === "other").map(t => ({
    id: t.id, income: parse(t.otherIncomeAmount), taxType: t.otherTaxType, prepaidTax: parse(t.prepaidTax),
  }));
  const otherCombinedTotal = otherIncomes.filter(o => o.taxType === "combined").reduce((s, o) => s + o.income, 0);

  // 종합소득금액 (가공경비 미포함)
  const totalIncome = mainIncome + extraBizTotal + employmentTotal + otherCombinedTotal;
  // 종합소득금액 (가공경비 포함)
  const totalIncomeWithExtra = mainIncomeWithExtra + extraBizTotal + employmentTotal + otherCombinedTotal;

  // 소득공제 합계
  const basicDeduct = 1500000; // 본인
  const elderlyCount = dependents.filter(d => isElderly(d.residentNumber, taxYear)).length;
  const disabledCount = dependents.filter(d => d.isDisabled).length;
  const personDeduct = dependents.length * 1500000;
  const elderlyDeduct = elderlyCount * 1000000;
  const disabledDeduct = disabledCount * 2000000;
  const womanDeduct = deductWoman ? 500000 : 0;
  const singleParentDeduct = deductSingleParent ? 1000000 : 0;
  const pensionDeduct = parse(deductPension);
  const umbrellaDeduct = parse(deductUmbrella);
  const totalDeduction = basicDeduct + personDeduct + elderlyDeduct + disabledDeduct + womanDeduct + singleParentDeduct + pensionDeduct + umbrellaDeduct;

  function calcResult(incomeTotal: number) {
    const taxBase = Math.max(incomeTotal - totalDeduction, 0);
    const taxRate = getTaxRateLabel(taxBase);
    const computedTax = Math.round(calcTax(taxBase));

    // 세액감면 (소득비율 적용)
    let totalReduction = 0;
    // 메인 사업장 감면
    if (mainTab.startupRate > 0 && incomeTotal > 0) {
      const ratio = (incomeTotal === totalIncomeWithExtra ? mainIncomeWithExtra : mainIncome) / incomeTotal;
      totalReduction += Math.round(computedTax * mainTab.startupRate / 100 * ratio);
    }
    if (mainTab.smeRate > 0 && incomeTotal > 0) {
      const ratio = (incomeTotal === totalIncomeWithExtra ? mainIncomeWithExtra : mainIncome) / incomeTotal;
      totalReduction += Math.round(computedTax * mainTab.smeRate / 100 * ratio);
    }
    // 추가 사업장 감면
    for (const biz of extraBizIncomes) {
      if (biz.startupRate > 0 && incomeTotal > 0) {
        totalReduction += Math.round(computedTax * biz.startupRate / 100 * (biz.income / incomeTotal));
      }
      if (biz.smeRate > 0 && incomeTotal > 0) {
        totalReduction += Math.round(computedTax * biz.smeRate / 100 * (biz.income / incomeTotal));
      }
    }

    // 표준세액공제
    const standardCredit = 70000;

    // 세액공제 (고정 금액)
    let totalCredit = standardCredit + parse(mainTab.investCredit) + parse(mainTab.employmentCredit);
    for (const biz of extraBizIncomes) { totalCredit += biz.investCredit + biz.employmentCredit; }

    // 근로소득세액공제 (자동계산)
    let earnedIncomeCreditTotal = 0;
    for (const emp of employmentIncomes) {
      if (emp.income > 0 && incomeTotal > 0) {
        const earnedTax = Math.round(computedTax * (emp.income / incomeTotal));
        const empTab = extraTabs.find(t => t.id === emp.id);
        const grossSalary = empTab ? parse(empTab.grossSalary) : 0;
        const credit = calcEarnedIncomeCredit(earnedTax, grossSalary);
        earnedIncomeCreditTotal += credit;
      }
    }
    totalCredit += earnedIncomeCreditTotal;
    // 자녀세액공제 (기본)
    const childCreditCount = dependents.filter(d => d.relation === "child" && isChildTaxCredit(d.residentNumber, taxYear)).length;
    const childCreditAmt = calcChildCredit(childCreditCount);
    totalCredit += childCreditAmt;

    // 자녀세액공제 (출산)
    const birthCreditAmt = dependents
      .filter(d => d.relation === "child" && d.birthOrder > 0 && getBirthYear(d.residentNumber) === parseInt(taxYear))
      .reduce((sum, d) => sum + calcBirthCredit(d.birthOrder), 0);
    totalCredit += birthCreditAmt;

    // 혼인세액공제
    const marriageCreditAmt = marriageCredit ? 500000 : 0;
    totalCredit += marriageCreditAmt;

    // 기장세액공제 (산출세액 × 사업소득금액/종합소득금액 × 20%, 한도 100만원)
    let bookkeepingCreditAmt = 0;
    if (bookkeepingCredit && incomeTotal > 0) {
      const mainIncomeAmt = incomeTotal === totalIncomeWithExtra ? mainIncomeWithExtra : mainIncome;
      bookkeepingCreditAmt = Math.min(Math.round(computedTax * (mainIncomeAmt / incomeTotal) * 0.2), 1000000);
      totalCredit += bookkeepingCreditAmt;
    }

    // 연금계좌세액공제
    const pSaving = parse(pensionSaving);
    const rPension = parse(retirementPension);
    const pensionTotal = pSaving + rPension;
    const pensionLimit = 6000000 + Math.min(rPension, 3000000); // 600만 + min(퇴직연금, 300만)
    const pensionBase = Math.min(pensionTotal, pensionLimit);
    const pensionRate = incomeTotal <= 45000000 ? 0.15 : 0.12;
    const pensionCreditAmt = Math.round(pensionBase * pensionRate);
    totalCredit += pensionCreditAmt;

    const afterReduction = Math.max(computedTax - totalReduction - totalCredit, 0);

    // 최저한세
    const minTax = calcMinTax(computedTax);
    // 창중감 100%가 있는지 확인
    const hasStartup100 = mainTab.startupRate === 100 || extraBizIncomes.some(b => b.startupRate === 100);
    const hitMinTax = !hasStartup100 && afterReduction < minTax;
    const finalTax = hasStartup100 ? afterReduction : Math.max(afterReduction, minTax);
    const localTax = Math.round(finalTax * 0.1);

    // 기납부세액 합계
    const prepaidTotal = parse(mainTab.prepaidTax) +
      extraBizIncomes.reduce((s, b) => s + b.prepaidTax, 0) +
      employmentIncomes.reduce((s, e) => s + e.prepaidTax, 0) +
      otherIncomes.reduce((s, o) => s + o.prepaidTax, 0);

    const totalTax = finalTax + localTax;
    const finalPayment = totalTax - prepaidTotal;

    return { taxBase, taxRate, computedTax, totalReduction, totalCredit, standardCredit, childCreditAmt, birthCreditAmt, marriageCreditAmt, bookkeepingCreditAmt, earnedIncomeCreditTotal, pensionCreditAmt, afterReduction, minTax, hitMinTax, hasStartup100, finalTax, localTax, prepaidTotal, totalTax, finalPayment };
  }

  const baseResult = calcResult(totalIncome);
  const extraResult = extraExpNum > 0 ? calcResult(totalIncomeWithExtra) : null;

  // 현재 보고 있는 탭
  const currentExtra = extraTabs.find(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[94vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-[#3182F6] to-[#2a4a6a] px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChartIcon width={18} height={18} className="text-white" />
              <h2 className="text-white font-bold">{clientName} — 종합소득세 계산</h2>
            </div>
            <div className="flex items-center gap-2">
              {onApply && baseResult.finalTax > 0 && (
                <button
                  onClick={() => { onApply(extraResult ? extraResult.finalTax : baseResult.finalTax); onClose(); }}
                  className="text-xs px-3 py-1.5 bg-[#1AB266] text-white rounded-lg hover:bg-[#16A865]"
                >결정세액 반영</button>
              )}
              <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                {saving ? "저장 중..." : "💾 저장"}
              </button>
              <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {loadData.currSales && (
              <button onClick={handleLoad} className="text-xs px-3 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 inline-flex items-center gap-1">
                <DownloadIcon width={12} height={12} />
                {loaded ? "다시 불러오기" : "불러오기"}
              </button>
            )}
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
        </div>

        {/* 크롬 탭 바 */}
        <div className="flex items-center bg-[#F2F4F6] px-2 pt-1 shrink-0 overflow-x-auto">
          <TabBtn label="종합소득" active={activeTab === "summary"} onClick={() => setActiveTab("summary")} color="blue" />
          <TabBtn label={mainTab.name || "사업장소득"} active={activeTab === "main"} onClick={() => setActiveTab("main")} />
          {extraTabs.map(t => (
            <TabBtn key={t.id} label={t.name} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}
              onClose={() => removeTab(t.id)} />
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); setAddModal(true); }}
            className="w-8 h-8 flex items-center justify-center text-[#6B7684] hover:text-[#191F28] hover:bg-white rounded-lg ml-1 text-xl font-bold border border-transparent hover:border-[#D1D6DB] shrink-0"
          >+</button>
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 종합소득 탭 ── */}
          {activeTab === "summary" && (
            <div className="space-y-5">
              {/* 소득 합산 카드 */}
              <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB]">
                  <h3 className="text-sm font-bold text-[#333D4B]">종합소득금액</h3>
                </div>
                <div className="px-4 py-3 space-y-1">
                  <SummaryRow label="사업장소득" value={mainIncome} />
                  {extraBizIncomes.map(b => <SummaryRow key={b.id} label={b.name} value={b.income} />)}
                  {employmentIncomes.map(e => <SummaryRow key={e.id} label="근로소득" value={e.income} />)}
                  {otherIncomes.filter(o => o.taxType === "combined").map(o => <SummaryRow key={o.id} label="기타소득(종합)" value={o.income} />)}
                </div>
                <div className="flex justify-between px-4 py-3 bg-[#F5F9FF] border-t border-blue-100">
                  <span className="text-sm font-bold text-blue-800">종합소득금액</span>
                  <span className="text-lg font-bold text-blue-900">{fmt(totalIncome)}원</span>
                </div>
              </div>

              {/* 소득공제 카드 */}
              <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB]">
                  <h3 className="text-sm font-bold text-[#333D4B]">소득공제</h3>
                </div>
                <div className="px-4 py-3 space-y-4">
                  {/* 기본공제 (본인) */}
                  <div className="flex items-center justify-between bg-[#F5F9FF] rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-[#1B64DA]">기본공제 (본인)</span>
                    <span className="text-xs font-bold text-blue-800">1,500,000원</span>
                  </div>

                  {/* 인적공제 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#4E5968]">추가 인적공제</span>
                      <button
                        onClick={() => setDependents(prev => [...prev, { id: `dep_${Date.now()}`, name: "", relation: "child", residentNumber: "", isDisabled: false, birthOrder: 0 }])}
                        className="text-[10px] px-2 py-1 bg-[#3182F6] text-white rounded-lg hover:bg-[#1B64DA]"
                      >+ 추가</button>
                    </div>
                    {dependents.length === 0 && (
                      <div className="text-xs text-[#8B95A1] text-center py-2">추가 인적공제 대상이 없습니다</div>
                    )}
                    {dependents.map((dep, idx) => {
                      const elderly = isElderly(dep.residentNumber, taxYear);
                      const childCredit = dep.relation === "child" && isChildTaxCredit(dep.residentNumber, taxYear);
                      return (
                        <div key={dep.id} className="flex items-center gap-1.5 mb-2 bg-[#F9FAFB] rounded-lg px-3 py-2">
                          <span className="text-xs text-[#8B95A1] w-4 shrink-0">{idx + 1}</span>
                          <input
                            type="text" value={dep.name} placeholder="이름"
                            onChange={e => setDependents(prev => prev.map(d => d.id === dep.id ? { ...d, name: e.target.value } : d))}
                            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-2 py-1.5 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-[#3182F6]/30"
                          />
                          <select
                            value={dep.relation}
                            onChange={e => setDependents(prev => prev.map(d => d.id === dep.id ? { ...d, relation: e.target.value as Dependent["relation"] } : d))}
                            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-1 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#3182F6]/30"
                          >
                            <option value="child">자녀</option>
                            <option value="spouse">배우자</option>
                            <option value="father">부</option>
                            <option value="mother">모</option>
                            <option value="other">기타</option>
                          </select>
                          <input
                            type="text" value={dep.residentNumber} placeholder="앞6자리"
                            maxLength={6}
                            onChange={e => setDependents(prev => prev.map(d => d.id === dep.id ? { ...d, residentNumber: e.target.value.replace(/\D/g, "") } : d))}
                            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-2 py-1.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-[#3182F6]/30"
                          />
                          {elderly && <span className="text-[10px] px-1.5 py-0.5 bg-[#E8F3FF] text-[#1B64DA] rounded shrink-0">70+</span>}
                          {childCredit && <span className="text-[10px] px-1.5 py-0.5 bg-[#E7F7EE] text-[#15803D] rounded shrink-0">자녀공제</span>}
                          {dep.relation === "child" && getBirthYear(dep.residentNumber) === parseInt(taxYear) && (
                            <select
                              value={dep.birthOrder}
                              onChange={e => setDependents(prev => prev.map(d => d.id === dep.id ? { ...d, birthOrder: parseInt(e.target.value) } : d))}
                              className="border border-[#E5E8EB] rounded px-1 py-0.5 text-[10px] focus:outline-none"
                            >
                              <option value={0}>출산순서</option>
                              <option value={1}>첫째</option>
                              <option value={2}>둘째</option>
                              <option value={3}>셋째+</option>
                            </select>
                          )}
                          {dep.birthOrder > 0 && getBirthYear(dep.residentNumber) === parseInt(taxYear) && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded shrink-0">출산{fmt(calcBirthCredit(dep.birthOrder))}원</span>
                          )}
                          <label className="flex items-center gap-1 text-[10px] text-[#6B7684] shrink-0 cursor-pointer">
                            <input type="checkbox" checked={dep.isDisabled}
                              onChange={e => setDependents(prev => prev.map(d => d.id === dep.id ? { ...d, isDisabled: e.target.checked } : d))}
                              className="accent-[#3182F6] w-3 h-3" />
                            장애인
                          </label>
                          <div className="flex-1" />
                          <span className="text-[10px] text-[#8B95A1] shrink-0">
                            {fmt(1500000 + (elderly ? 1000000 : 0) + (dep.isDisabled ? 2000000 : 0))}원
                          </span>
                          <button
                            onClick={() => setDependents(prev => prev.filter(d => d.id !== dep.id))}
                            className="text-[#B0B8C1] hover:text-[#E02E2E] text-sm shrink-0"
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* 부녀자 / 한부모 */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[#4E5968] cursor-pointer bg-[#F9FAFB] rounded-lg px-3 py-2 flex-1">
                      <input type="checkbox" checked={deductWoman} onChange={e => setDeductWoman(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                      부녀자 (50만원)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[#4E5968] cursor-pointer bg-[#F9FAFB] rounded-lg px-3 py-2 flex-1">
                      <input type="checkbox" checked={deductSingleParent} onChange={e => setDeductSingleParent(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                      한부모가족 (100만원)
                    </label>
                  </div>

                  {/* 국민연금 + 노란우산 */}
                  <div className="grid grid-cols-2 gap-3">
                    <NumField label="국민연금보험료" value={deductPension} onChange={setDeductPension} suffix="원" />
                    <NumField label="노란우산공제" value={deductUmbrella} onChange={setDeductUmbrella} suffix="원" />
                  </div>
                </div>
                <div className="flex justify-between px-4 py-2.5 bg-[#F9FAFB] border-t border-[#E5E8EB]">
                  <span className="text-xs font-bold text-[#4E5968]">소득공제 합계</span>
                  <span className="text-sm font-bold text-[#191F28]">-{fmt(totalDeduction)}원</span>
                </div>
              </div>

              {/* 세액공제 카드 */}
              <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB]">
                  <h3 className="text-sm font-bold text-[#333D4B]">세액공제</h3>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[#4E5968] cursor-pointer bg-[#F9FAFB] rounded-lg px-3 py-2 flex-1">
                      <input type="checkbox" checked={marriageCredit} onChange={e => setMarriageCredit(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                      혼인세액공제 (50만원)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[#4E5968] cursor-pointer bg-[#F9FAFB] rounded-lg px-3 py-2 flex-1">
                      <input type="checkbox" checked={bookkeepingCredit} onChange={e => setBookkeepingCredit(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                      기장세액공제 (간편장부→복식부기)
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumField label="연금저축 납입액" value={pensionSaving} onChange={setPensionSaving} suffix="원" />
                    <NumField label="퇴직연금 납입액" value={retirementPension} onChange={setRetirementPension} suffix="원" />
                  </div>
                  {(parse(pensionSaving) > 0 || parse(retirementPension) > 0) && (() => {
                    const ps = parse(pensionSaving), rp = parse(retirementPension);
                    const limit = 6000000 + Math.min(rp, 3000000);
                    const base = Math.min(ps + rp, limit);
                    const rate = totalIncome <= 45000000 ? 15 : 12;
                    return (
                      <div className="bg-[#F5F9FF] rounded-lg px-3 py-2 text-xs text-[#1B64DA]">
                        연금계좌세액공제: {fmt(base)}원 × {rate}% = <strong>{fmt(Math.round(base * rate / 100))}원</strong>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 가공경비 카드 */}
              <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB]">
                  <h3 className="text-sm font-bold text-[#333D4B]">가공경비 <span className="font-normal text-[#8B95A1]">(선택)</span></h3>
                </div>
                <div className="px-4 py-3">
                  <NumField label="" value={extraExpense} onChange={setExtraExpense} suffix="원" placeholder="가공경비 금액 입력" />
                </div>
              </div>

              {/* 세액 계산 결과 */}
              {totalIncome > 0 && (
                <div className={extraResult ? "grid grid-cols-2 gap-4" : ""}>
                  <ResultBlock result={baseResult} totalIncome={totalIncome} label="기본" color="blue" />
                  {extraResult && <ResultBlock result={extraResult} totalIncome={totalIncomeWithExtra} label={`가공경비 +${fmt(extraExpNum)}원`} color="green" />}
                </div>
              )}

              {extraResult && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold text-amber-800">가공경비 효과</div>
                      <div className="text-[11px] text-[#D97706] mt-0.5">가공경비 {fmt(extraExpNum)}원 대비 절감률 {extraExpNum > 0 ? ((( baseResult.finalPayment - extraResult.finalPayment) / extraExpNum) * 100).toFixed(1) : 0}%</div>
                    </div>
                    <span className="text-2xl font-bold text-[#B45309]">{fmt(baseResult.finalPayment - extraResult.finalPayment)}원</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 사업장소득 탭 ── */}
          {activeTab === "main" && (
            <BusinessTabContent tab={mainTab} onChange={updates => setMainTab(prev => ({ ...prev, ...updates }))} isMain />
          )}

          {/* ── 추가 탭들 ── */}
          {currentExtra?.type === "business" && (
            <BusinessTabContent tab={currentExtra} onChange={updates => updateExtra(currentExtra.id, updates)} />
          )}
          {currentExtra?.type === "employment" && (
            <EmploymentTabContent tab={currentExtra} onChange={updates => updateExtra(currentExtra.id, updates)} />
          )}
          {currentExtra?.type === "other" && (
            <OtherTabContent tab={currentExtra} onChange={updates => updateExtra(currentExtra.id, updates)} />
          )}
        </div>

        {/* 소득 추가 모달 */}
        {addModal && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50 rounded-2xl" onClick={() => setAddModal(false)}>
            <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-[#191F28] mb-4">소득 추가</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#6B7684] mb-1 block">이름</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="예: OO사업장, 근로소득"
                    className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-[#6B7684] mb-1 block">소득 종류</label>
                  <div className="flex gap-2">
                    {([["business", "사업소득"], ["employment", "근로소득"], ["other", "기타소득"]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setAddType(key)}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                          addType === key ? "bg-[#3182F6] text-white" : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAddTab}
                  className="flex-1 py-2 bg-[#3182F6] text-white text-sm font-medium rounded-lg hover:bg-[#1B64DA]"
                >확인</button>
                <button
                  onClick={() => setAddModal(false)}
                  className="px-4 py-2 text-sm text-[#6B7684] hover:bg-[#F2F4F6] rounded-lg"
                >취소</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──

function TabBtn({ label, active, onClick, onClose, color }: { label: string; active: boolean; onClick: () => void; onClose?: () => void; color?: string }) {
  const bg = active
    ? (color === "blue" ? "bg-[#3182F6] text-white" : "bg-white text-[#191F28]")
    : "bg-[#E5E8EB]/60 text-[#6B7684] hover:bg-[#E5E8EB]";
  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer shrink-0 ${bg}`} onClick={onClick}>
      {label}
      {onClose && (
        <span onClick={e => { e.stopPropagation(); onClose(); }} className="ml-1 text-[#8B95A1] hover:text-[#E02E2E] text-[10px]">✕</span>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-[#F2F4F6] text-sm">
      <span className="text-[#6B7684]">{label}</span>
      <span className="font-medium text-[#191F28]">{fmt(value)}원</span>
    </div>
  );
}

function NumField({ label, value, onChange, suffix, placeholder, small }: {
  label: string; value: string; onChange: (v: string) => void; suffix: string; placeholder?: string; small?: boolean;
}) {
  return (
    <div>
      {label && <label className="text-xs text-[#6B7684] mb-0.5 block">{label}</label>}
      <div className="relative">
        <input
          type="text" value={value}
          onChange={e => onChange(suffix === "명" ? e.target.value.replace(/\D/g, "") : numInput(e.target.value))}
          placeholder={placeholder || "0"}
          className={`w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] text-right focus:outline-none focus:border-[#3182F6] ${small ? "px-2 py-1.5 text-xs pr-6" : "px-3 py-2 text-sm pr-8"}`}
        />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[#8B95A1] ${small ? "text-[10px]" : "text-xs"}`}>{suffix}</span>
      </div>
    </div>
  );
}

function ResultBlock({ result, totalIncome, label, color }: { result: any; totalIncome: number; label: string; color: "blue" | "green" }) {
  const bgCard = color === "blue" ? "from-blue-50 to-indigo-50 border-[#A3CAFD]" : "from-emerald-50 to-teal-50 border-emerald-200";
  const textColor = color === "blue" ? "text-[#3182F6]" : "text-emerald-700";

  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden">
      <div className="bg-[#F9FAFB] px-4 py-2 border-b border-[#E5E8EB]">
        <span className="text-xs font-bold text-[#6B7684] uppercase">{label}</span>
      </div>
      <div className={`bg-gradient-to-r ${bgCard} px-4 py-3 border-b`}>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-[#4E5968]">{result.finalPayment >= 0 ? "납부할 세액" : "환급 세액"}</span>
          <span className={`text-2xl font-bold ${result.finalPayment < 0 ? "text-[#3182F6]" : textColor}`}>{fmt(Math.abs(result.finalPayment))}원</span>
        </div>
      </div>
      <div className="px-4 py-3 text-[11px] space-y-1">
        <Row label="과세표준" value={result.taxBase} note={result.taxRate} bold />
        <Row label="산출세액" value={result.computedTax} />
        {result.totalReduction > 0 && <Row label="세액감면" value={result.totalReduction} sub />}
        <Row label="표준세액공제" value={result.standardCredit} sub />
        {result.childCreditAmt > 0 && <Row label="자녀세액공제 (기본)" value={result.childCreditAmt} sub />}
        {result.birthCreditAmt > 0 && <Row label="자녀세액공제 (출산)" value={result.birthCreditAmt} sub />}
        {result.marriageCreditAmt > 0 && <Row label="혼인세액공제" value={result.marriageCreditAmt} sub />}
        {result.bookkeepingCreditAmt > 0 && <Row label="기장세액공제" value={result.bookkeepingCreditAmt} sub />}
        {result.earnedIncomeCreditTotal > 0 && <Row label="근로소득세액공제" value={result.earnedIncomeCreditTotal} sub />}
        {result.pensionCreditAmt > 0 && <Row label="연금계좌세액공제" value={result.pensionCreditAmt} sub />}
        {(() => { const etc = result.totalCredit - (result.standardCredit||0) - (result.childCreditAmt||0) - (result.birthCreditAmt||0) - (result.marriageCreditAmt||0) - (result.bookkeepingCreditAmt||0) - (result.earnedIncomeCreditTotal||0) - (result.pensionCreditAmt||0); return etc > 0 ? <Row label="기타 세액공제" value={etc} sub /> : null; })()}
        {result.hitMinTax && <Row label="최저한세" value={result.minTax} note="적용" highlight />}
        <div className="border-t border-[#F2F4F6] pt-1 mt-1" />
        <Row label="결정세액" value={result.finalTax} bold />
        <Row label="지방소득세 (10%)" value={result.localTax} />
        <Row label="총 세액" value={result.totalTax} bold />
        {result.prepaidTotal > 0 && (
          <>
            <div className="border-t border-[#F2F4F6] pt-1 mt-1" />
            <Row label="기납부세액" value={result.prepaidTotal} sub />
          </>
        )}
        <div className={`flex justify-between py-2 mt-1 -mx-4 px-4 ${result.finalPayment < 0 ? "bg-[#F5F9FF]" : "bg-[#F9FAFB]"} border-t`}>
          <span className="font-bold text-[#333D4B]">{result.finalPayment >= 0 ? "최종 납부" : "최종 환급"}</span>
          <span className={`font-bold text-base ${result.finalPayment < 0 ? "text-[#3182F6]" : "text-[#191F28]"}`}>{fmt(Math.abs(result.finalPayment))}원</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, note, bold, highlight }: { label: string; value: number; sub?: boolean; note?: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-medium" : ""} ${highlight ? "bg-[#FEF2F2] -mx-1 px-1 rounded" : ""}`}>
      <span className="text-[#6B7684]">{label} {note && <span className="text-[9px] text-[#8B95A1]">{note}</span>}</span>
      <span className={sub ? "text-[#E02E2E]" : "text-[#191F28]"}>{sub ? "-" : ""}{fmt(value)}원</span>
    </div>
  );
}

// ── 사업소득 입력 ──
function BusinessTabContent({ tab, onChange, isMain }: { tab: IncomeTab; onChange: (u: Partial<IncomeTab>) => void; isMain?: boolean }) {
  return (
    <div className="space-y-4">
      {!isMain && (
        <div>
          <label className="text-xs text-[#6B7684] mb-1 block">탭 이름</label>
          <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm w-full" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumField label="매출액" value={tab.revenue} onChange={v => onChange({ revenue: v })} suffix="원" />
        <NumField label="비용 (경비)" value={tab.expense} onChange={v => onChange({ expense: v })} suffix="원" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#6B7684] mb-1 block">창업중소기업 세액감면</label>
          <select value={tab.startupRate} onChange={e => onChange({ startupRate: parseInt(e.target.value) })}
            className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm">
            <option value={0}>미적용</option>
            <option value={25}>25%</option><option value={50}>50%</option>
            <option value={75}>75%</option><option value={100}>100% (최저한세 배제)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-[#6B7684] mb-1 block">중소기업특별 세액감면</label>
          <select value={tab.smeRate} onChange={e => onChange({ smeRate: parseInt(e.target.value) })}
            className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm">
            <option value={0}>미적용</option>
            <option value={10}>10%</option><option value={20}>20%</option><option value={30}>30%</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="통합투자 세액공제" value={tab.investCredit} onChange={v => onChange({ investCredit: v })} suffix="원" />
        <NumField label="고용증대 세액공제" value={tab.employmentCredit} onChange={v => onChange({ employmentCredit: v })} suffix="원" />
      </div>
      {!isMain && (
        <NumField label="기납부세액" value={tab.prepaidTax} onChange={v => onChange({ prepaidTax: v })} suffix="원" />
      )}
      <div className="bg-[#F5F9FF] rounded-lg p-3 text-sm">
        <div className="flex justify-between font-medium">
          <span>사업소득금액</span>
          <span>{fmt(Math.max(parse(tab.revenue) - parse(tab.expense), 0))}원</span>
        </div>
      </div>
    </div>
  );
}

// ── 근로소득 입력 ──
function EmploymentTabContent({ tab, onChange }: { tab: IncomeTab; onChange: (u: Partial<IncomeTab>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-[#6B7684] mb-1 block">탭 이름</label>
        <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm w-full" />
      </div>
      <NumField label="총급여액" value={tab.grossSalary} onChange={v => onChange({ grossSalary: v })} suffix="원" />
      <NumField label="과세표준 (근로소득금액)" value={tab.taxBase} onChange={v => onChange({ taxBase: v })} suffix="원" />
      <NumField label="기납부세액" value={tab.prepaidTax} onChange={v => onChange({ prepaidTax: v })} suffix="원" />
      <div className="bg-[#F5F9FF] rounded-lg px-3 py-2 text-xs text-[#1B64DA]">
        근로소득세액공제는 종합소득 탭에서 자동 계산됩니다
      </div>
    </div>
  );
}

// ── 기타소득 입력 ──
function OtherTabContent({ tab, onChange }: { tab: IncomeTab; onChange: (u: Partial<IncomeTab>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-[#6B7684] mb-1 block">탭 이름</label>
        <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm w-full" />
      </div>
      <div className="flex bg-[#F2F4F6] rounded-lg p-1">
        <button onClick={() => onChange({ otherTaxType: "separate" })}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab.otherTaxType === "separate" ? "bg-white shadow-sm" : "text-[#6B7684]"}`}>
          분리과세
        </button>
        <button onClick={() => onChange({ otherTaxType: "combined" })}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab.otherTaxType === "combined" ? "bg-white shadow-sm" : "text-[#6B7684]"}`}>
          종합과세
        </button>
      </div>
      {tab.otherTaxType === "separate" && (
        <div className="bg-[#FFFBEB] rounded-lg p-2 text-xs text-[#B45309]">분리과세: 다른 소득과 합산되지 않습니다</div>
      )}
      <NumField label="기타소득" value={tab.otherIncome} onChange={v => onChange({ otherIncome: v })} suffix="원" />
      <NumField label="필요경비" value={tab.otherExpense} onChange={v => onChange({ otherExpense: v })} suffix="원" />
      <NumField label="기타소득금액" value={tab.otherIncomeAmount} onChange={v => onChange({ otherIncomeAmount: v })} suffix="원" />
      <NumField label="기납부세액" value={tab.prepaidTax} onChange={v => onChange({ prepaidTax: v })} suffix="원" />
    </div>
  );
}
