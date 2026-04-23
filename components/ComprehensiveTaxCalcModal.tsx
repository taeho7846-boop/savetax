"use client";

import { useState, useEffect } from "react";

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
    taxBase: "", earnedIncomeCredit: "",
    otherIncome: "", otherExpense: "", otherIncomeAmount: "", otherTaxType: "separate",
  };
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
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // 소득공제
  const [deductPersons, setDeductPersons] = useState(0); // 인적공제 명수
  const [deductElderly, setDeductElderly] = useState(0); // 70세이상
  const [deductDisabled, setDeductDisabled] = useState(0); // 장애인
  const [deductWoman, setDeductWoman] = useState(false); // 부녀자
  const [deductSingleParent, setDeductSingleParent] = useState(false); // 한부모
  const [deductUmbrella, setDeductUmbrella] = useState(""); // 노란우산공제

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
            if (saved.deductions) {
              setDeductPersons(saved.deductions.persons || 0);
              setDeductElderly(saved.deductions.elderly || 0);
              setDeductDisabled(saved.deductions.disabled || 0);
              setDeductWoman(saved.deductions.woman || false);
              setDeductSingleParent(saved.deductions.singleParent || false);
              setDeductUmbrella(saved.deductions.umbrella || "");
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
        mainTab, extraTabs,
        deductions: {
          persons: deductPersons, elderly: deductElderly, disabled: deductDisabled,
          woman: deductWoman, singleParent: deductSingleParent, umbrella: deductUmbrella,
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
  function addTab(type: "business" | "employment" | "other") {
    const names = { business: "추가 사업소득", employment: "근로소득", other: "기타소득" };
    const tab = newTab(type, names[type]);
    setExtraTabs(prev => [...prev, tab]);
    setActiveTab(tab.id);
    setAddMenuOpen(false);
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
  const basicDeduct = 1500000;
  const personDeduct = deductPersons * 1500000;
  const elderlyDeduct = deductElderly * 1000000;
  const disabledDeduct = deductDisabled * 2000000;
  const womanDeduct = deductWoman ? 500000 : 0;
  const singleParentDeduct = deductSingleParent ? 1000000 : 0;
  const umbrellaDeduct = parse(deductUmbrella);
  const totalDeduction = basicDeduct + personDeduct + elderlyDeduct + disabledDeduct + womanDeduct + singleParentDeduct + umbrellaDeduct;

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

    // 세액공제 (고정 금액)
    let totalCredit = parse(mainTab.investCredit) + parse(mainTab.employmentCredit);
    for (const biz of extraBizIncomes) { totalCredit += biz.investCredit + biz.employmentCredit; }
    // 근로소득세액공제
    for (const emp of employmentIncomes) { totalCredit += emp.credit; }

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

    return { taxBase, taxRate, computedTax, totalReduction, totalCredit, afterReduction, minTax, hitMinTax, hasStartup100, finalTax, localTax, prepaidTotal, totalTax, finalPayment };
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
        <div className="bg-gradient-to-r from-[#1a2e4a] to-[#2a4a6a] px-6 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h2 className="text-white font-semibold">{clientName} — 종합소득세 계산</h2>
            </div>
            <div className="flex items-center gap-2">
              {onApply && baseResult.finalTax > 0 && (
                <button
                  onClick={() => { onApply(extraResult ? extraResult.finalTax : baseResult.finalTax); onClose(); }}
                  className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >결정세액 반영</button>
              )}
              <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                {saving ? "저장 중..." : "💾 저장"}
              </button>
              <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {!loaded && loadData.currSales && (
              <button onClick={handleLoad} className="text-xs px-3 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30">📥 불러오기</button>
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
        </div>

        {/* 크롬 탭 바 */}
        <div className="flex items-center bg-gray-100 px-2 pt-1 shrink-0 overflow-x-auto">
          <TabBtn label="종합소득" active={activeTab === "summary"} onClick={() => setActiveTab("summary")} color="blue" />
          <TabBtn label={mainTab.name || "사업장소득"} active={activeTab === "main"} onClick={() => setActiveTab("main")} />
          {extraTabs.map(t => (
            <TabBtn key={t.id} label={t.name} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}
              onClose={() => removeTab(t.id)} />
          ))}
          <div className="relative shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setAddMenuOpen(!addMenuOpen); }}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-white rounded-lg ml-1 text-xl font-bold border border-transparent hover:border-gray-300"
            >+</button>
            {addMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 min-w-[150px]">
                <button onClick={() => addTab("business")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">📋 사업소득</button>
                <button onClick={() => addTab("employment")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">💼 근로소득</button>
                <button onClick={() => addTab("other")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50">📄 기타소득</button>
              </div>
            )}
          </div>
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 종합소득 탭 ── */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* 소득 합산 */}
              <Section title="종합소득금액">
                <SummaryRow label="사업장소득" value={mainIncome} />
                {extraBizIncomes.map(b => <SummaryRow key={b.id} label={b.name} value={b.income} />)}
                {employmentIncomes.map(e => <SummaryRow key={e.id} label="근로소득" value={e.income} />)}
                {otherIncomes.filter(o => o.taxType === "combined").map(o => <SummaryRow key={o.id} label="기타소득(종합)" value={o.income} />)}
                <div className="flex justify-between py-1.5 bg-blue-50 -mx-2 px-2 rounded font-medium text-sm">
                  <span>종합소득금액</span>
                  <span className="font-bold">{fmt(totalIncome)}원</span>
                </div>
              </Section>

              {/* 소득공제 */}
              <Section title="소득공제">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">기본공제</span><div className="font-medium mt-0.5">1,500,000원</div></div>
                  <NumField label="인적공제 (명)" value={String(deductPersons)} onChange={v => setDeductPersons(parseInt(v) || 0)} suffix="명" small />
                  <NumField label="70세이상 (명)" value={String(deductElderly)} onChange={v => setDeductElderly(parseInt(v) || 0)} suffix="명" small />
                  <NumField label="장애인 (명)" value={String(deductDisabled)} onChange={v => setDeductDisabled(parseInt(v) || 0)} suffix="명" small />
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={deductWoman} onChange={e => setDeductWoman(e.target.checked)} className="accent-[#1a2e4a]" />
                    부녀자 (50만)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={deductSingleParent} onChange={e => setDeductSingleParent(e.target.checked)} className="accent-[#1a2e4a]" />
                    한부모 (100만)
                  </label>
                  <div className="col-span-3">
                    <NumField label="노란우산공제" value={deductUmbrella} onChange={setDeductUmbrella} suffix="원" />
                  </div>
                </div>
                <div className="flex justify-between py-1.5 bg-gray-50 -mx-2 px-2 rounded text-xs font-medium mt-2">
                  <span>소득공제 합계</span>
                  <span>-{fmt(totalDeduction)}원</span>
                </div>
              </Section>

              {/* 가공경비 */}
              <Section title="가공경비 (선택)">
                <NumField label="" value={extraExpense} onChange={setExtraExpense} suffix="원" placeholder="가공경비 금액 입력" />
              </Section>

              {/* 세액 계산 결과 */}
              {totalIncome > 0 && (
                <div className={extraResult ? "grid grid-cols-2 gap-4" : ""}>
                  <ResultBlock result={baseResult} totalIncome={totalIncome} label="기본" color="blue" />
                  {extraResult && <ResultBlock result={extraResult} totalIncome={totalIncomeWithExtra} label={`가공경비 +${fmt(extraExpNum)}원`} color="green" />}
                </div>
              )}

              {extraResult && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-amber-800">가공경비 효과 (절감액)</span>
                    <span className="text-lg font-bold text-amber-700">{fmt(baseResult.finalPayment - extraResult.finalPayment)}원</span>
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
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──

function TabBtn({ label, active, onClick, onClose, color }: { label: string; active: boolean; onClick: () => void; onClose?: () => void; color?: string }) {
  const bg = active
    ? (color === "blue" ? "bg-blue-600 text-white" : "bg-white text-gray-900")
    : "bg-gray-200/60 text-gray-500 hover:bg-gray-200";
  return (
    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer shrink-0 ${bg}`} onClick={onClick}>
      {label}
      {onClose && (
        <span onClick={e => { e.stopPropagation(); onClose(); }} className="ml-1 text-gray-400 hover:text-red-500 text-[10px]">✕</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{fmt(value)}원</span>
    </div>
  );
}

function NumField({ label, value, onChange, suffix, placeholder, small }: {
  label: string; value: string; onChange: (v: string) => void; suffix: string; placeholder?: string; small?: boolean;
}) {
  return (
    <div>
      {label && <label className="text-xs text-gray-500 mb-0.5 block">{label}</label>}
      <div className="relative">
        <input
          type="text" value={value}
          onChange={e => onChange(suffix === "명" ? e.target.value.replace(/\D/g, "") : numInput(e.target.value))}
          placeholder={placeholder || "0"}
          className={`w-full border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/30 ${small ? "px-2 py-1.5 text-xs pr-6" : "px-3 py-2 text-sm pr-8"}`}
        />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 ${small ? "text-[10px]" : "text-xs"}`}>{suffix}</span>
      </div>
    </div>
  );
}

function ResultBlock({ result, totalIncome, label, color }: { result: any; totalIncome: number; label: string; color: "blue" | "green" }) {
  const bg = color === "blue" ? "from-blue-50 to-indigo-50" : "from-emerald-50 to-teal-50";
  const textColor = color === "blue" ? "text-[#1a2e4a]" : "text-emerald-700";

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{label}</div>
      <div className={`bg-gradient-to-r ${bg} rounded-xl p-3 mb-2`}>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">{result.finalPayment >= 0 ? "납부할 세액" : "환급 세액"}</span>
          <span className={`text-xl font-bold ${result.finalPayment < 0 ? "text-blue-600" : textColor}`}>{fmt(Math.abs(result.finalPayment))}원</span>
        </div>
      </div>
      <div className="text-[11px] space-y-0.5">
        <Row label="과세표준" value={result.taxBase} note={result.taxRate} bold />
        <Row label="산출세액" value={result.computedTax} />
        {result.totalReduction > 0 && <Row label="세액감면" value={result.totalReduction} sub />}
        {result.totalCredit > 0 && <Row label="세액공제" value={result.totalCredit} sub />}
        {result.hitMinTax && <Row label="최저한세" value={result.minTax} note="적용" highlight />}
        <Row label="결정세액" value={result.finalTax} bold />
        <Row label="지방소득세" value={result.localTax} />
        <Row label="총 세액" value={result.totalTax} bold />
        {result.prepaidTotal > 0 && <Row label="기납부세액" value={result.prepaidTotal} sub />}
        <Row label={result.finalPayment >= 0 ? "납부" : "환급"} value={Math.abs(result.finalPayment)} bold highlight={result.finalPayment < 0} />
      </div>
    </div>
  );
}

function Row({ label, value, sub, note, bold, highlight }: { label: string; value: number; sub?: boolean; note?: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-medium" : ""} ${highlight ? "bg-red-50 -mx-1 px-1 rounded" : ""}`}>
      <span className="text-gray-500">{label} {note && <span className="text-[9px] text-gray-400">{note}</span>}</span>
      <span className={sub ? "text-red-500" : "text-gray-800"}>{sub ? "-" : ""}{fmt(value)}원</span>
    </div>
  );
}

// ── 사업소득 입력 ──
function BusinessTabContent({ tab, onChange, isMain }: { tab: IncomeTab; onChange: (u: Partial<IncomeTab>) => void; isMain?: boolean }) {
  return (
    <div className="space-y-4">
      {!isMain && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">탭 이름</label>
          <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumField label="매출액" value={tab.revenue} onChange={v => onChange({ revenue: v })} suffix="원" />
        <NumField label="비용 (경비)" value={tab.expense} onChange={v => onChange({ expense: v })} suffix="원" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">창업중소기업 세액감면</label>
          <select value={tab.startupRate} onChange={e => onChange({ startupRate: parseInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value={0}>미적용</option>
            <option value={25}>25%</option><option value={50}>50%</option>
            <option value={75}>75%</option><option value={100}>100% (최저한세 배제)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">중소기업특별 세액감면</label>
          <select value={tab.smeRate} onChange={e => onChange({ smeRate: parseInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
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
      <div className="bg-blue-50 rounded-lg p-3 text-sm">
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
        <label className="text-xs text-gray-500 mb-1 block">탭 이름</label>
        <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
      </div>
      <NumField label="과세표준" value={tab.taxBase} onChange={v => onChange({ taxBase: v })} suffix="원" />
      <NumField label="근로소득세액공제" value={tab.earnedIncomeCredit} onChange={v => onChange({ earnedIncomeCredit: v })} suffix="원" />
      <NumField label="기납부세액" value={tab.prepaidTax} onChange={v => onChange({ prepaidTax: v })} suffix="원" />
    </div>
  );
}

// ── 기타소득 입력 ──
function OtherTabContent({ tab, onChange }: { tab: IncomeTab; onChange: (u: Partial<IncomeTab>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">탭 이름</label>
        <input type="text" value={tab.name} onChange={e => onChange({ name: e.target.value })}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" />
      </div>
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button onClick={() => onChange({ otherTaxType: "separate" })}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab.otherTaxType === "separate" ? "bg-white shadow-sm" : "text-gray-500"}`}>
          분리과세
        </button>
        <button onClick={() => onChange({ otherTaxType: "combined" })}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab.otherTaxType === "combined" ? "bg-white shadow-sm" : "text-gray-500"}`}>
          종합과세
        </button>
      </div>
      {tab.otherTaxType === "separate" && (
        <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-700">분리과세: 다른 소득과 합산되지 않습니다</div>
      )}
      <NumField label="기타소득" value={tab.otherIncome} onChange={v => onChange({ otherIncome: v })} suffix="원" />
      <NumField label="필요경비" value={tab.otherExpense} onChange={v => onChange({ otherExpense: v })} suffix="원" />
      <NumField label="기타소득금액" value={tab.otherIncomeAmount} onChange={v => onChange({ otherIncomeAmount: v })} suffix="원" />
      <NumField label="기납부세액" value={tab.prepaidTax} onChange={v => onChange({ prepaidTax: v })} suffix="원" />
    </div>
  );
}
