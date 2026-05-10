"use client";

import { useState, useCallback, useMemo } from "react";

// ── 헬퍼 ──
function fmt(n: number): string { return n.toLocaleString("ko-KR"); }
function numInput(v: string): string {
  const num = v.replace(/[^\d]/g, "");
  return num ? parseInt(num).toLocaleString("ko-KR") : "";
}
function parse(v: string): number { return parseInt(v.replace(/,/g, "")) || 0; }

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

function getBirthYear(rn: string): number | null {
  if (rn.length < 6) return null;
  const yy = parseInt(rn.slice(0, 2));
  return yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
}
function isElderly(rn: string, taxYear: number): boolean {
  const by = getBirthYear(rn);
  return by ? by <= taxYear - 70 : false;
}
function isChildCreditAge(rn: string, taxYear: number): boolean {
  const by = getBirthYear(rn);
  if (!by) return false;
  return by >= taxYear - 20 && by <= taxYear - 8;
}
function calcChildCredit(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 250000;
  if (count === 2) return 550000;
  return 550000 + (count - 2) * 400000;
}
function calcBirthCredit(order: number): number {
  if (order === 1) return 300000;
  if (order === 2) return 500000;
  return 700000;
}

// ── 업종코드 (2025 귀속, 일반율) ──
type BizCode = {
  code: string;
  name: string;
  simpleRate: number;
  standardRate: number;
};

const BIZ_CODES: BizCode[] = [
  { code: "851101", name: "요양병원 (보건업)", simpleRate: 78.6, standardRate: 19.0 },
  { code: "940100", name: "저술가 (작가) — 학술·문예 번역 포함", simpleRate: 58.7, standardRate: 7.2 },
  { code: "940200", name: "화가 및 관련예술가 (회화·서예·조각·만화·삽화·도예)", simpleRate: 68.0, standardRate: 16.6 },
  { code: "940301", name: "작곡가 (작곡·편곡·작사·각색영화편집)", simpleRate: 49.7, standardRate: 5.8 },
  { code: "940302", name: "배우·탤런트 (성우·MC·코메디언·개그맨·만담가)", simpleRate: 29.0, standardRate: 5.9 },
  { code: "940303", name: "모델 (탤런트·배우 등 광고모델수입 포함)", simpleRate: 40.9, standardRate: 10.0 },
  { code: "940304", name: "가수", simpleRate: 13.5, standardRate: 5.7 },
  { code: "940305", name: "성악가 등 (국악인·무용가·고전음악연주가·악사·영화감독·연출가)", simpleRate: 61.6, standardRate: 26.6 },
  { code: "940306", name: "1인미디어 콘텐츠창작자 (유튜버·BJ·크리에이터)", simpleRate: 64.1, standardRate: 12.1 },
  { code: "940500", name: "연예보조서비스 (엑스트라·조명·촬영·장치·녹음·분장)", simpleRate: 70.9, standardRate: 16.2 },
  { code: "940600", name: "자문·감독·지도료·고문료·교정료 (일시적 자문 등)", simpleRate: 58.4, standardRate: 7.6 },
  { code: "940901", name: "바둑기사", simpleRate: 62.6, standardRate: 16.9 },
  { code: "940902", name: "꽃꽂이교사 (꽃꽂이·무용·음악·사교댄스·요리교사)", simpleRate: 81.8, standardRate: 22.3 },
  { code: "940903", name: "학원강사·강사·과외교습자·재단사", simpleRate: 61.7, standardRate: 15.4 },
  { code: "940904", name: "직업운동가 (지도자·심판·경륜·경정·기수·기록계·감독)", simpleRate: 54.5, standardRate: 15.7 },
  { code: "940905", name: "유흥접객원 및 댄서", simpleRate: 61.7, standardRate: 23.5 },
  { code: "940906", name: "보험설계사", simpleRate: 77.6, standardRate: 28.5 },
  { code: "940907", name: "음료품배달원 (요구르트·우유배달판매)", simpleRate: 80.0, standardRate: 34.7 },
  { code: "940908", name: "방문판매원 (서적·학습지·화장품·정수기·자동차·일반)", simpleRate: 75.0, standardRate: 19.9 },
  { code: "940909", name: "기타자영업 (컴퓨터프로그래머·조율사·검침원 등)", simpleRate: 64.1, standardRate: 17.4 },
  { code: "940910", name: "다단계판매원의 후원수당", simpleRate: 67.8, standardRate: 14.1 },
  { code: "940911", name: "기타모집수당·채권회수수당 (증권·저축 권유, 분양알선)", simpleRate: 67.7, standardRate: 15.8 },
  { code: "940912", name: "개인간병인 (방문·파출간병)", simpleRate: 80.2, standardRate: 34.0 },
  { code: "940913", name: "대리운전기사", simpleRate: 73.7, standardRate: 32.2 },
  { code: "940914", name: "골프장캐디", simpleRate: 74.3, standardRate: 20.9 },
  { code: "940915", name: "목욕관리사", simpleRate: 78.2, standardRate: 39.7 },
  { code: "940916", name: "행사도우미 (자사 상품·시설 홍보)", simpleRate: 69.8, standardRate: 15.5 },
  { code: "940917", name: "심부름용역원 (말벗서비스·심부름센터)", simpleRate: 71.5, standardRate: 25.6 },
  { code: "940918", name: "퀵서비스배달원", simpleRate: 79.4, standardRate: 19.8 },
  { code: "940919", name: "기타물품운반원 (의류·이삿짐·짐운반)", simpleRate: 74.2, standardRate: 27.6 },
  { code: "940920", name: "학습지 방문강사", simpleRate: 75.0, standardRate: 31.5 },
  { code: "940921", name: "교육교구 방문강사", simpleRate: 75.6, standardRate: 28.6 },
  { code: "940922", name: "대여제품 방문점검원", simpleRate: 75.0, standardRate: 29.9 },
  { code: "940923", name: "대출모집인", simpleRate: 67.5, standardRate: 28.6 },
  { code: "940924", name: "신용카드회원 모집인", simpleRate: 71.3, standardRate: 29.2 },
  { code: "940925", name: "방과후강사", simpleRate: 69.3, standardRate: 19.3 },
  { code: "940926", name: "소프트웨어프리랜서", simpleRate: 64.4, standardRate: 20.9 },
  { code: "940927", name: "관광통역안내사", simpleRate: 64.1, standardRate: 17.0 },
  { code: "940928", name: "어린이통학버스기사", simpleRate: 72.4, standardRate: 19.8 },
  { code: "940929", name: "중고자동차판매원 (중고차딜러)", simpleRate: 75.0, standardRate: 24.2 },
];

function lookupBizCode(code: string): BizCode | undefined {
  return BIZ_CODES.find(b => b.code === code);
}

// ── 가공경비 비율 ──
type CategoryRatio = {
  name: string;
  key: string;
  min: number;
  max: number;
  note?: string;
};

const DEFAULT_RATIOS: CategoryRatio[] = [
  { name: "지급수수료", key: "commission", min: 22, max: 38, note: "안전·소명용이" },
  { name: "여비교통비", key: "travel", min: 15, max: 28, note: "출장·이동" },
  { name: "접대비", key: "entertainment", min: 10, max: 18, note: "결혼·부고 등 (한도 적용)" },
  { name: "소모품비", key: "supplies", min: 10, max: 20, note: "사무용품" },
  { name: "차량유지비", key: "vehicle", min: 8, max: 15, note: "차량 보유시" },
  { name: "기타", key: "other", min: 8, max: 18, note: "통신비·잡비 포함" },
];

const ENTERTAINMENT_BASE_LIMIT = 12000000;

type AllocatedExpense = { key: string; name: string; amount: number; ratio: number };

function randomAllocate(total: number, ratios: CategoryRatio[], entertainmentLimit: number): AllocatedExpense[] {
  if (total <= 0) return ratios.map(r => ({ key: r.key, name: r.name, amount: 0, ratio: 0 }));
  const raw = ratios.map(r => r.min + Math.random() * (r.max - r.min));
  const sum = raw.reduce((a, b) => a + b, 0);
  const norm = raw.map(r => r / sum);
  let res = norm.map((ratio, i) => {
    let amount = Math.round(total * ratio);
    if (ratios[i].key === "entertainment") amount = Math.min(amount, entertainmentLimit);
    return { key: ratios[i].key, name: ratios[i].name, amount, ratio: ratio * 100 };
  });
  const allocated = res.reduce((s, r) => s + r.amount, 0);
  const diff = total - allocated;
  const ci = res.findIndex(r => r.key === "commission");
  if (ci >= 0) res[ci].amount += diff;
  const ft = res.reduce((s, r) => s + r.amount, 0);
  res = res.map(r => ({ ...r, ratio: ft > 0 ? (r.amount / ft) * 100 : 0 }));
  return res;
}

// ── 사업장 / 부양가족 타입 ──
type Business = {
  id: string;
  bizCode: string;
  bizName: string;
  simpleRate: number;
  standardRate: number;
  rateManual: boolean;
  revenue: string;
  creditCard: string;
  debitCard: string;
  cashReceipt: string;
  extraExpense: string;
  allocated: AllocatedExpense[];
  generated: boolean;
  isDoubleEntry: boolean;
};

function newBusiness(): Business {
  return {
    id: `biz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    bizCode: "", bizName: "", simpleRate: 0, standardRate: 0, rateManual: false,
    revenue: "", creditCard: "", debitCard: "", cashReceipt: "",
    extraExpense: "", allocated: [], generated: false, isDoubleEntry: false,
  };
}

type Dependent = {
  id: string;
  name: string;
  relation: "spouse" | "father" | "mother" | "child" | "other";
  birthOrder: number;
  residentNumber: string;
  isDisabled: boolean;
};

export function FreelancerCalcBoard() {
  const taxYear = new Date().getFullYear() - 1;

  // 사업장 목록
  const [businesses, setBusinesses] = useState<Business[]>([newBusiness()]);

  // 기납부세액
  const [prepaidTax, setPrepaidTax] = useState("");
  const [prepaidManual, setPrepaidManual] = useState(false);

  // 가공경비 비율 (전체 공통)
  const [ratios, setRatios] = useState<CategoryRatio[]>(DEFAULT_RATIOS);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    new Set(["commission", "travel", "entertainment", "supplies", "vehicle", "other"])
  );
  const [showRatioConfig, setShowRatioConfig] = useState(false);

  // 소득공제
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [hasSpouse, setHasSpouse] = useState(false);
  const [deductWoman, setDeductWoman] = useState(false);
  const [deductSingleParent, setDeductSingleParent] = useState(false);
  const [pension, setPension] = useState("");
  const [umbrella, setUmbrella] = useState("");

  // 세액공제
  const [marriageCredit, setMarriageCredit] = useState(false);
  const [pensionSaving, setPensionSaving] = useState("");
  const [retirementPension, setRetirementPension] = useState("");

  // ── 계산 ──
  const totalRevenue = businesses.reduce((s, b) => s + parse(b.revenue), 0);
  const autoPrepaid = Math.round(totalRevenue * 0.033);
  const effectivePrepaid = prepaidManual ? parse(prepaidTax) : autoPrepaid;

  // 사업장별 소득금액
  const bizIncomes = businesses.map(b => {
    const rev = parse(b.revenue);
    const actual = parse(b.creditCard) + parse(b.debitCard) + parse(b.cashReceipt);
    const extra = parse(b.extraExpense);
    const expense = actual + extra;
    const income = Math.max(rev - expense, 0);
    const expenseRatio = rev > 0 ? (expense / rev) * 100 : 0;
    const simpleLimit = Math.round(rev * b.simpleRate / 100);
    return { id: b.id, rev, actual, extra, expense, income, expenseRatio, simpleLimit, isDoubleEntry: b.isDoubleEntry };
  });

  const totalIncome = bizIncomes.reduce((s, b) => s + b.income, 0);
  const totalActualExpense = bizIncomes.reduce((s, b) => s + b.actual, 0);
  const totalExtraExpense = bizIncomes.reduce((s, b) => s + b.extra, 0);
  const doubleEntryIncome = bizIncomes.filter(b => b.isDoubleEntry).reduce((s, b) => s + b.income, 0);

  // 소득공제
  const basicDeduct = 1500000;
  const spouseDeduct = hasSpouse ? 1500000 : 0;
  const personDeduct = dependents.length * 1500000;
  const elderlyCount = dependents.filter(d => isElderly(d.residentNumber, taxYear)).length;
  const elderlyDeduct = elderlyCount * 1000000;
  const disabledCount = dependents.filter(d => d.isDisabled).length;
  const disabledDeduct = disabledCount * 2000000;
  const womanDeduct = deductWoman ? 500000 : 0;
  const singleParentDeduct = deductSingleParent ? 1000000 : 0;
  const pensionDeduct = parse(pension);
  const umbrellaDeduct = parse(umbrella);
  const totalDeduction = basicDeduct + spouseDeduct + personDeduct + elderlyDeduct + disabledDeduct + womanDeduct + singleParentDeduct + pensionDeduct + umbrellaDeduct;

  // 과세표준 / 산출세액
  const taxBase = Math.max(totalIncome - totalDeduction, 0);
  const computedTax = Math.round(calcTax(taxBase));

  // 세액공제
  const standardCredit = 70000;

  // 자녀세액공제
  const childCount = dependents.filter(d => d.relation === "child" && isChildCreditAge(d.residentNumber, taxYear)).length;
  const childCreditAmt = calcChildCredit(childCount);

  // 출산세액공제
  const birthCreditAmt = dependents
    .filter(d => d.relation === "child" && d.birthOrder > 0 && getBirthYear(d.residentNumber) === taxYear)
    .reduce((s, d) => s + calcBirthCredit(d.birthOrder), 0);

  // 혼인세액공제
  const marriageCreditAmt = marriageCredit ? 500000 : 0;

  // 기장세액공제 (복식부기 소득금액 / 종합소득금액 × 산출세액 × 20%, 한도 100만)
  const bookkeepingCreditAmt = totalIncome > 0 && doubleEntryIncome > 0
    ? Math.min(Math.round(computedTax * (doubleEntryIncome / totalIncome) * 0.2), 1000000)
    : 0;

  // 연금계좌 세액공제
  const pSaving = parse(pensionSaving);
  const rPension = parse(retirementPension);
  const pensionLimit = 6000000 + Math.min(rPension, 3000000);
  const pensionBase = Math.min(pSaving + rPension, pensionLimit);
  const pensionRate = totalIncome <= 45000000 ? 0.15 : 0.12;
  const pensionCreditAmt = Math.round(pensionBase * pensionRate);

  const totalCredit = standardCredit + childCreditAmt + birthCreditAmt + marriageCreditAmt + bookkeepingCreditAmt + pensionCreditAmt;

  const determinedTax = Math.max(computedTax - totalCredit, 0);
  const localTax = Math.round(determinedTax * 0.1);
  const totalTax = determinedTax + localTax;
  const finalPayment = totalTax - effectivePrepaid;

  // ── 핸들러 ──
  function updateBusiness(id: string, updates: Partial<Business>) {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }

  function handleCodeChange(id: string, code: string) {
    const found = lookupBizCode(code);
    if (found) {
      updateBusiness(id, { bizCode: code, bizName: found.name, simpleRate: found.simpleRate, standardRate: found.standardRate, rateManual: false });
    } else {
      updateBusiness(id, { bizCode: code });
    }
  }

  function addBusiness() {
    setBusinesses(prev => [...prev, newBusiness()]);
  }

  function removeBusiness(id: string) {
    if (businesses.length === 1) return alert("최소 1개의 사업장은 있어야 합니다.");
    if (!confirm("이 사업장을 삭제하시겠습니까?")) return;
    setBusinesses(prev => prev.filter(b => b.id !== id));
  }

  const handleGenerate = useCallback((id: string) => {
    const b = businesses.find(x => x.id === id);
    if (!b) return;
    const rev = parse(b.revenue);
    const entertainmentLimit = ENTERTAINMENT_BASE_LIMIT + Math.round(rev * 0.003);
    const enabledRatios = ratios.filter(r => enabledKeys.has(r.key));
    const result = randomAllocate(parse(b.extraExpense), enabledRatios, entertainmentLimit);
    updateBusiness(id, { allocated: result, generated: true });
  }, [businesses, ratios, enabledKeys]);

  const updateRatio = (key: string, field: "min" | "max", value: number) => {
    setRatios(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const toggleCategory = (key: string) => {
    setEnabledKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182F6] to-[#1B64DA] flex items-center justify-center shadow-lg shadow-blue-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#191F28]">프리랜서 간편장부 계산기</h1>
          <p className="text-xs text-[#8B95A1]">다중 사업장 · 가공경비 통계 배분 · 종합소득세 즉시 산출 ({taxYear}귀속)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRatioConfig(s => !s)}
            className="text-xs px-3 py-2 bg-[#F2F4F6] text-[#4E5968] rounded-lg hover:bg-[#E5E8EB]"
          >⚙️ 비율 설정</button>
        </div>
      </div>

      {/* 비율 설정 (접이식) */}
      {showRatioConfig && (
        <div className="bg-white border border-[#E5E8EB] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#333D4B]">가공경비 계정과목별 비율 범위 (전체 공통)</h3>
            <button
              onClick={() => { setRatios(DEFAULT_RATIOS); setEnabledKeys(new Set(["commission", "travel", "entertainment", "supplies", "vehicle", "other"])); }}
              className="text-[10px] px-2 py-1 bg-[#F2F4F6] text-[#6B7684] rounded hover:bg-[#E5E8EB]"
            >초기화</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ratios.map(r => {
              const enabled = enabledKeys.has(r.key);
              return (
                <div key={r.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${enabled ? "bg-[#F9FAFB]" : "bg-[#F2F4F6] opacity-50"}`}>
                  <input type="checkbox" checked={enabled} onChange={() => toggleCategory(r.key)} className="accent-[#3182F6] w-3.5 h-3.5" />
                  <div className="w-24 shrink-0">
                    <div className="text-xs text-[#4E5968]">{r.name}</div>
                    {r.note && <div className="text-[9px] text-[#8B95A1]">{r.note}</div>}
                  </div>
                  <input type="number" min={0} max={100} value={r.min} disabled={!enabled}
                    onChange={e => updateRatio(r.key, "min", parseInt(e.target.value) || 0)}
                    className="w-12 border border-[#E5E8EB] rounded px-1.5 py-1 text-xs text-center disabled:bg-[#F2F4F6]" />
                  <span className="text-[10px] text-[#8B95A1]">~</span>
                  <input type="number" min={0} max={100} value={r.max} disabled={!enabled}
                    onChange={e => updateRatio(r.key, "max", parseInt(e.target.value) || 0)}
                    className="w-12 border border-[#E5E8EB] rounded px-1.5 py-1 text-xs text-center disabled:bg-[#F2F4F6]" />
                  <span className="text-[10px] text-[#8B95A1]">%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 사업장 목록 */}
      <datalist id="bizcodes-list">
        {BIZ_CODES.map(b => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
      </datalist>

      {businesses.map((b, idx) => (
        <BusinessCard
          key={b.id}
          business={b}
          index={idx}
          incomeData={bizIncomes[idx]}
          onChange={updates => updateBusiness(b.id, updates)}
          onCodeChange={code => handleCodeChange(b.id, code)}
          onRemove={() => removeBusiness(b.id)}
          onGenerate={() => handleGenerate(b.id)}
          showRemove={businesses.length > 1}
        />
      ))}

      <button
        onClick={addBusiness}
        className="w-full py-3 border-2 border-dashed border-[#A3CAFD] rounded-xl text-sm font-medium text-[#3182F6] hover:bg-[#F5F9FF] hover:border-[#3182F6]"
      >+ 사업장 추가</button>

      {/* 기납부세액 */}
      <div className="bg-white border border-[#E5E8EB] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="text-xs text-[#6B7684] mb-1">기납부세액 (3.3% 원천징수)</div>
            <div className="relative">
              <input
                type="text"
                value={prepaidManual ? prepaidTax : (autoPrepaid > 0 ? fmt(autoPrepaid) : "")}
                onChange={e => { setPrepaidManual(true); setPrepaidTax(numInput(e.target.value)); }}
                placeholder="자동계산"
                className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm text-right pr-8 focus:outline-none focus:border-[#3182F6]"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">원</span>
            </div>
          </div>
          {prepaidManual && (
            <button
              onClick={() => { setPrepaidManual(false); setPrepaidTax(""); }}
              className="mt-5 text-[10px] px-2 py-1.5 bg-[#F2F4F6] text-[#6B7684] rounded hover:bg-[#E5E8EB]"
            >자동복원</button>
          )}
          <div className="text-[11px] text-[#8B95A1] mt-5 w-40 text-right">
            매출합계 {fmt(totalRevenue)} × 3.3%
          </div>
        </div>
      </div>

      {/* 소득공제 */}
      <DeductionCard
        taxYear={taxYear}
        dependents={dependents} setDependents={setDependents}
        hasSpouse={hasSpouse} setHasSpouse={setHasSpouse}
        deductWoman={deductWoman} setDeductWoman={setDeductWoman}
        deductSingleParent={deductSingleParent} setDeductSingleParent={setDeductSingleParent}
        pension={pension} setPension={setPension}
        umbrella={umbrella} setUmbrella={setUmbrella}
        totalDeduction={totalDeduction}
      />

      {/* 세액공제 */}
      <CreditCard
        marriageCredit={marriageCredit} setMarriageCredit={setMarriageCredit}
        pensionSaving={pensionSaving} setPensionSaving={setPensionSaving}
        retirementPension={retirementPension} setRetirementPension={setRetirementPension}
        totalIncome={totalIncome}
        bookkeepingCreditAmt={bookkeepingCreditAmt}
        doubleEntryIncome={doubleEntryIncome}
        childCreditAmt={childCreditAmt}
        birthCreditAmt={birthCreditAmt}
        pensionCreditAmt={pensionCreditAmt}
      />

      {/* 결과 */}
      {totalRevenue > 0 && (
        <ResultCard
          totalRevenue={totalRevenue}
          totalActualExpense={totalActualExpense}
          totalExtraExpense={totalExtraExpense}
          totalIncome={totalIncome}
          totalDeduction={totalDeduction}
          taxBase={taxBase}
          computedTax={computedTax}
          standardCredit={standardCredit}
          childCreditAmt={childCreditAmt}
          birthCreditAmt={birthCreditAmt}
          marriageCreditAmt={marriageCreditAmt}
          bookkeepingCreditAmt={bookkeepingCreditAmt}
          pensionCreditAmt={pensionCreditAmt}
          determinedTax={determinedTax}
          localTax={localTax}
          totalTax={totalTax}
          effectivePrepaid={effectivePrepaid}
          finalPayment={finalPayment}
        />
      )}
    </div>
  );
}

// ── 사업장 카드 ──
function BusinessCard({ business: b, index, incomeData, onChange, onCodeChange, onRemove, onGenerate, showRemove }: {
  business: Business;
  index: number;
  incomeData: { rev: number; actual: number; extra: number; expense: number; income: number; expenseRatio: number; simpleLimit: number; };
  onChange: (u: Partial<Business>) => void;
  onCodeChange: (code: string) => void;
  onRemove: () => void;
  onGenerate: () => void;
  showRemove: boolean;
}) {
  const known = !!lookupBizCode(b.bizCode);
  const allocatedSum = b.allocated.reduce((s, a) => s + a.amount, 0);

  // 위험도
  let risk: "safe" | "caution" | "danger" = "safe";
  if (b.simpleRate > 0 && incomeData.rev > 0) {
    if (incomeData.expenseRatio > b.simpleRate + 5) risk = "danger";
    else if (incomeData.expenseRatio > b.simpleRate) risk = "caution";
  }
  const riskColor = risk === "danger" ? "text-red-600" : risk === "caution" ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-[#3182F6] to-[#1B64DA] px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">사업장 {index + 1} {b.bizName && `· ${b.bizName}`}</h3>
        {showRemove && (
          <button onClick={onRemove} className="text-white/70 hover:text-white text-sm">✕ 삭제</button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* 1행: 업종코드 + 매출 + 복식부기 */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-5">
            <label className="text-xs text-[#6B7684] mb-1 block">업종코드</label>
            <input
              type="text" value={b.bizCode} onChange={e => onCodeChange(e.target.value.replace(/\D/g, ""))}
              list="bizcodes-list" maxLength={6} placeholder="예: 940903"
              className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]"
            />
            <div className="text-[10px] mt-1 min-h-[14px]">
              {known ? (
                <span className="text-[#1B64DA]">✓ {b.bizName}</span>
              ) : b.bizCode ? (
                <span className="text-amber-600">코드 미등록 — 경비율 직접 입력</span>
              ) : (
                <span className="text-[#8B95A1]">코드 입력시 자동완성</span>
              )}
            </div>
          </div>
          <div className="col-span-5">
            <NumField label="매출 (수입금액)" value={b.revenue} onChange={v => onChange({ revenue: v })} suffix="원" />
          </div>
          <div className="col-span-2 flex items-end pb-1">
            <label className="flex items-center gap-1.5 text-xs text-[#4E5968] cursor-pointer bg-[#F5F9FF] rounded-lg px-2 py-2 w-full justify-center border border-blue-100">
              <input type="checkbox" checked={b.isDoubleEntry} onChange={e => onChange({ isDoubleEntry: e.target.checked })} className="accent-[#3182F6] w-3.5 h-3.5" />
              <span className="font-medium">복식부기</span>
            </label>
          </div>
        </div>

        {/* 경비율 (자동/수동) */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-[#6B7684] block mb-0.5">단순경비율 (일반율)</label>
            <div className="relative">
              <input type="number" min={0} max={100} step={0.1} value={b.simpleRate || ""}
                onChange={e => onChange({ simpleRate: parseFloat(e.target.value) || 0, rateManual: true })}
                className={`w-full border rounded-[10px] px-2 py-1.5 text-sm text-right pr-6 ${known && !b.rateManual ? "border-[#E5E8EB] bg-[#F0FDF4] text-emerald-700" : "border-[#F2F4F6] bg-[#F9FAFB]"}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#6B7684] block mb-0.5">기준경비율 (일반율)</label>
            <div className="relative">
              <input type="number" min={0} max={100} step={0.1} value={b.standardRate || ""}
                onChange={e => onChange({ standardRate: parseFloat(e.target.value) || 0, rateManual: true })}
                className={`w-full border rounded-[10px] px-2 py-1.5 text-sm text-right pr-6 ${known && !b.rateManual ? "border-[#E5E8EB] bg-[#F5F9FF] text-blue-700" : "border-[#F2F4F6] bg-[#F9FAFB]"}`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8B95A1]">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#6B7684] block mb-0.5">현재 총경비율</label>
            <div className={`border rounded-[10px] px-2 py-1.5 text-sm text-right font-bold ${
              risk === "danger" ? "border-red-200 bg-red-50 text-red-700" :
              risk === "caution" ? "border-amber-200 bg-amber-50 text-amber-700" :
              "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              {incomeData.expenseRatio.toFixed(1)}%
            </div>
          </div>
        </div>

        {b.simpleRate > 0 && incomeData.rev > 0 && (
          <div className={`text-[11px] ${riskColor} bg-[#F9FAFB] rounded-lg px-3 py-2`}>
            단순경비율 한도 {fmt(incomeData.simpleLimit)}원 / 현재경비 {fmt(incomeData.expense)}원
            {risk === "danger" && " — ⚠ 한도 5%p 이상 초과, 의심 위험"}
            {risk === "caution" && " — ⚡ 한도 살짝 초과"}
            {risk === "safe" && " — ✓ 안전 범위"}
          </div>
        )}

        {/* 실제 사용액 */}
        <div className="grid grid-cols-3 gap-3">
          <NumField label="신용카드" value={b.creditCard} onChange={v => onChange({ creditCard: v })} suffix="원" />
          <NumField label="직불카드" value={b.debitCard} onChange={v => onChange({ debitCard: v })} suffix="원" />
          <NumField label="현금영수증" value={b.cashReceipt} onChange={v => onChange({ cashReceipt: v })} suffix="원" />
        </div>

        {/* 가공경비 */}
        <div className="bg-gradient-to-br from-[#F5F9FF] to-[#EFF6FF] border border-blue-100 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-8">
              <NumField label="가공경비 총액" value={b.extraExpense} onChange={v => onChange({ extraExpense: v })} suffix="원" placeholder="투입할 가공경비" />
            </div>
            <div className="col-span-4">
              <button
                onClick={onGenerate}
                disabled={parse(b.extraExpense) <= 0}
                className="w-full py-2 bg-gradient-to-r from-[#3182F6] to-[#1B64DA] text-white text-sm font-bold rounded-[10px] hover:from-[#1B64DA] hover:to-[#1551B0] disabled:opacity-40 transition-all shadow shadow-blue-200/50"
              >🎲 랜덤 배분</button>
            </div>
          </div>

          {b.generated && b.allocated.length > 0 && (
            <div className="space-y-1.5">
              {b.allocated.map(item => (
                <div key={item.key} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#4E5968]">{item.name}</span>
                    <span className="text-[10px] text-[#8B95A1]">({item.ratio.toFixed(1)}%)</span>
                  </div>
                  <span className="text-sm font-bold text-[#191F28]">{fmt(item.amount)}원</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-blue-100 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-[#1B64DA]">합계</span>
                <span className="text-sm font-bold text-[#1B64DA]">{fmt(allocatedSum)}원</span>
              </div>
            </div>
          )}
        </div>

        {/* 사업장 소득금액 */}
        <div className="flex items-center justify-between bg-[#F9FAFB] rounded-lg px-4 py-2.5 border border-[#E5E8EB]">
          <span className="text-xs font-bold text-[#4E5968]">사업장 소득금액</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#8B95A1]">매출 {fmt(incomeData.rev)} − 경비 {fmt(incomeData.expense)} =</span>
            <span className="text-base font-bold text-[#191F28]">{fmt(incomeData.income)}원</span>
            {b.isDoubleEntry && <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-[#1B64DA] rounded font-medium">복식부기</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 소득공제 카드 ──
function DeductionCard({
  taxYear, dependents, setDependents,
  hasSpouse, setHasSpouse,
  deductWoman, setDeductWoman,
  deductSingleParent, setDeductSingleParent,
  pension, setPension,
  umbrella, setUmbrella,
  totalDeduction,
}: any) {
  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl shadow-sm overflow-hidden">
      <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB] flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#333D4B]">소득공제</h3>
        <span className="text-xs text-[#8B95A1]">합계 {fmt(totalDeduction)}원</span>
      </div>
      <div className="p-4 space-y-3">
        {/* 본인 + 배우자 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-[#F5F9FF] rounded-lg px-3 py-2 border border-blue-100">
            <span className="text-xs font-medium text-[#1B64DA]">기본공제 (본인)</span>
            <span className="text-xs font-bold text-blue-800 ml-auto">1,500,000원</span>
          </div>
          <label className="flex-1 flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={hasSpouse} onChange={(e: any) => setHasSpouse(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
            <span className="text-xs text-[#4E5968]">배우자공제 (1,500,000원)</span>
          </label>
        </div>

        {/* 부양가족 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#4E5968]">부양가족 (배우자 외)</span>
            <button
              onClick={() => setDependents((prev: Dependent[]) => [...prev, { id: `dep_${Date.now()}`, name: "", relation: "child", residentNumber: "", isDisabled: false, birthOrder: 0 }])}
              className="text-[10px] px-2 py-1 bg-[#3182F6] text-white rounded hover:bg-[#1B64DA]"
            >+ 추가</button>
          </div>
          {dependents.length === 0 && (
            <div className="text-xs text-[#8B95A1] text-center py-2 bg-[#F9FAFB] rounded-lg">부양가족이 없습니다</div>
          )}
          {dependents.map((dep: Dependent, idx: number) => {
            const elderly = isElderly(dep.residentNumber, taxYear);
            const childCredit = dep.relation === "child" && isChildCreditAge(dep.residentNumber, taxYear);
            const personSum = 1500000 + (elderly ? 1000000 : 0) + (dep.isDisabled ? 2000000 : 0);
            return (
              <div key={dep.id} className="flex items-center gap-1.5 mb-1.5 bg-[#F9FAFB] rounded-lg px-3 py-2">
                <span className="text-[10px] text-[#8B95A1] w-4 shrink-0">{idx + 1}</span>
                <input type="text" value={dep.name} placeholder="이름"
                  onChange={(e: any) => setDependents((prev: Dependent[]) => prev.map(d => d.id === dep.id ? { ...d, name: e.target.value } : d))}
                  className="border border-[#E5E8EB] bg-white rounded px-2 py-1 text-xs w-16" />
                <select value={dep.relation}
                  onChange={(e: any) => setDependents((prev: Dependent[]) => prev.map(d => d.id === dep.id ? { ...d, relation: e.target.value as Dependent["relation"] } : d))}
                  className="border border-[#E5E8EB] bg-white rounded px-1 py-1 text-xs">
                  <option value="child">자녀</option>
                  <option value="father">부</option>
                  <option value="mother">모</option>
                  <option value="other">기타</option>
                </select>
                <input type="text" value={dep.residentNumber} placeholder="앞6자리" maxLength={6}
                  onChange={(e: any) => setDependents((prev: Dependent[]) => prev.map(d => d.id === dep.id ? { ...d, residentNumber: e.target.value.replace(/\D/g, "") } : d))}
                  className="border border-[#E5E8EB] bg-white rounded px-2 py-1 text-xs w-20" />
                {elderly && <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-[#1B64DA] rounded shrink-0">70+</span>}
                {childCredit && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded shrink-0">자녀공제</span>}
                {dep.relation === "child" && getBirthYear(dep.residentNumber) === taxYear && (
                  <select value={dep.birthOrder}
                    onChange={(e: any) => setDependents((prev: Dependent[]) => prev.map(d => d.id === dep.id ? { ...d, birthOrder: parseInt(e.target.value) } : d))}
                    className="border border-[#E5E8EB] bg-white rounded px-1 py-1 text-[10px]">
                    <option value={0}>출산순서</option><option value={1}>첫째</option><option value={2}>둘째</option><option value={3}>셋째+</option>
                  </select>
                )}
                <label className="flex items-center gap-1 text-[10px] text-[#6B7684] shrink-0 cursor-pointer">
                  <input type="checkbox" checked={dep.isDisabled}
                    onChange={(e: any) => setDependents((prev: Dependent[]) => prev.map(d => d.id === dep.id ? { ...d, isDisabled: e.target.checked } : d))}
                    className="accent-[#3182F6] w-3 h-3" />
                  장애
                </label>
                <div className="flex-1" />
                <span className="text-[10px] text-[#191F28] font-medium shrink-0">{fmt(personSum)}원</span>
                <button onClick={() => setDependents((prev: Dependent[]) => prev.filter(d => d.id !== dep.id))} className="text-[#B0B8C1] hover:text-red-600 text-sm shrink-0">✕</button>
              </div>
            );
          })}
        </div>

        {/* 부녀자 / 한부모 */}
        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={deductWoman} onChange={(e: any) => setDeductWoman(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
            <span className="text-xs text-[#4E5968]">부녀자공제 (500,000원)</span>
          </label>
          <label className="flex-1 flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={deductSingleParent} onChange={(e: any) => setDeductSingleParent(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
            <span className="text-xs text-[#4E5968]">한부모가족 (1,000,000원)</span>
          </label>
        </div>

        {/* 국민연금 + 노란우산 */}
        <div className="grid grid-cols-2 gap-3">
          <NumField label="국민연금 납입액" value={pension} onChange={setPension} suffix="원" />
          <NumField label="노란우산공제" value={umbrella} onChange={setUmbrella} suffix="원" />
        </div>
      </div>
    </div>
  );
}

// ── 세액공제 카드 ──
function CreditCard({
  marriageCredit, setMarriageCredit,
  pensionSaving, setPensionSaving,
  retirementPension, setRetirementPension,
  totalIncome, bookkeepingCreditAmt, doubleEntryIncome,
  childCreditAmt, birthCreditAmt, pensionCreditAmt,
}: any) {
  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl shadow-sm overflow-hidden">
      <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E8EB]">
        <h3 className="text-sm font-bold text-[#333D4B]">세액공제</h3>
      </div>
      <div className="p-4 space-y-3">
        {/* 자동 표시 (정보) */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {childCreditAmt > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 flex justify-between">
              <span className="text-emerald-700">자녀세액공제 (자동)</span>
              <span className="font-bold text-emerald-800">{fmt(childCreditAmt)}원</span>
            </div>
          )}
          {birthCreditAmt > 0 && (
            <div className="bg-pink-50 border border-pink-200 rounded-lg px-3 py-1.5 flex justify-between">
              <span className="text-pink-700">출산세액공제 (자동)</span>
              <span className="font-bold text-pink-800">{fmt(birthCreditAmt)}원</span>
            </div>
          )}
          {bookkeepingCreditAmt > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex justify-between col-span-2">
              <span className="text-amber-700">기장세액공제 (복식부기 소득 {fmt(doubleEntryIncome)}원, 한도 100만)</span>
              <span className="font-bold text-amber-800">{fmt(bookkeepingCreditAmt)}원</span>
            </div>
          )}
        </div>

        {/* 혼인 */}
        <label className="flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={marriageCredit} onChange={(e: any) => setMarriageCredit(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
          <span className="text-xs text-[#4E5968]">혼인세액공제 (500,000원)</span>
        </label>

        {/* 연금계좌 */}
        <div className="grid grid-cols-2 gap-3">
          <NumField label="연금저축 납입액" value={pensionSaving} onChange={setPensionSaving} suffix="원" />
          <NumField label="퇴직연금 납입액" value={retirementPension} onChange={setRetirementPension} suffix="원" />
        </div>
        {pensionCreditAmt > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 flex justify-between text-[11px]">
            <span className="text-blue-700">연금계좌세액공제 ({totalIncome <= 45000000 ? "15%" : "12%"} 적용)</span>
            <span className="font-bold text-blue-800">{fmt(pensionCreditAmt)}원</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 결과 카드 ──
function ResultCard({
  totalRevenue, totalActualExpense, totalExtraExpense,
  totalIncome, totalDeduction, taxBase, computedTax,
  standardCredit, childCreditAmt, birthCreditAmt, marriageCreditAmt,
  bookkeepingCreditAmt, pensionCreditAmt,
  determinedTax, localTax, totalTax, effectivePrepaid, finalPayment,
}: any) {
  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#2a4a6a] to-[#1a3a5a] px-4 py-2.5">
        <h3 className="text-sm font-bold text-white">종합소득세 계산 결과</h3>
      </div>
      <div className="p-4 space-y-1 text-[12px]">
        <Row label="총 수입금액" value={totalRevenue} />
        <Row label="실제 경비 (간소화)" value={totalActualExpense} sub />
        <Row label="가공경비" value={totalExtraExpense} sub />
        <div className="border-t border-[#E5E8EB] pt-1">
          <Row label="종합소득금액" value={totalIncome} bold />
        </div>
        <Row label="소득공제" value={totalDeduction} sub />
        <div className="border-t border-[#E5E8EB] pt-1">
          <Row label="과세표준" value={taxBase} bold note={getTaxRateLabel(taxBase)} />
        </div>
        <Row label="산출세액" value={computedTax} />
        <Row label="표준세액공제" value={standardCredit} sub />
        {childCreditAmt > 0 && <Row label="자녀세액공제" value={childCreditAmt} sub />}
        {birthCreditAmt > 0 && <Row label="출산세액공제" value={birthCreditAmt} sub />}
        {marriageCreditAmt > 0 && <Row label="혼인세액공제" value={marriageCreditAmt} sub />}
        {bookkeepingCreditAmt > 0 && <Row label="기장세액공제" value={bookkeepingCreditAmt} sub />}
        {pensionCreditAmt > 0 && <Row label="연금계좌세액공제" value={pensionCreditAmt} sub />}
        <div className="border-t border-[#E5E8EB] pt-1">
          <Row label="결정세액" value={determinedTax} bold />
          <Row label="지방소득세 (10%)" value={localTax} />
          <Row label="총 세액" value={totalTax} bold />
        </div>
        <Row label="기납부세액" value={effectivePrepaid} sub />

        <div className={`mt-2 -mx-4 px-4 py-3 ${finalPayment >= 0 ? "bg-gradient-to-r from-amber-50 to-orange-50" : "bg-gradient-to-r from-blue-50 to-indigo-50"}`}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-[#333D4B]">{finalPayment >= 0 ? "납부할 세액" : "환급 세액"}</span>
            <span className={`text-2xl font-bold ${finalPayment >= 0 ? "text-[#B45309]" : "text-[#3182F6]"}`}>
              {fmt(Math.abs(finalPayment))}원
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 공통 컴포넌트 ──
function NumField({ label, value, onChange, suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; suffix: string; placeholder?: string;
}) {
  return (
    <div>
      {label && <label className="text-xs text-[#6B7684] mb-0.5 block">{label}</label>}
      <div className="relative">
        <input
          type="text" value={value}
          onChange={e => onChange(numInput(e.target.value))}
          placeholder={placeholder || "0"}
          className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm text-right focus:outline-none focus:border-[#3182F6] pr-8"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#8B95A1]">{suffix}</span>
      </div>
    </div>
  );
}

function Row({ label, value, sub, bold, note }: { label: string; value: number; sub?: boolean; bold?: boolean; note?: string }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-medium" : ""}`}>
      <span className="text-[#6B7684]">{label} {note && <span className="text-[9px] text-[#8B95A1]">({note})</span>}</span>
      <span className={sub ? "text-[#E02E2E]" : "text-[#191F28]"}>{sub ? "-" : ""}{fmt(value)}원</span>
    </div>
  );
}
