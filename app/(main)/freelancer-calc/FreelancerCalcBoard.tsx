"use client";

import { useState, useCallback, useMemo } from "react";

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

// ── 업종코드별 경비율 (2025 귀속, 일반율) ──
type BizCode = {
  code: string;
  name: string;
  simpleRate: number;   // 단순경비율 일반율 (%)
  standardRate: number; // 기준경비율 일반율 (%)
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

// 통계 기반 권장 비율 (프리랜서 평균 비용구조)
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

const ENTERTAINMENT_BASE_LIMIT = 12000000; // 기본한도

type AllocatedExpense = {
  key: string;
  name: string;
  amount: number;
  ratio: number;
};

function randomAllocate(total: number, ratios: CategoryRatio[], entertainmentLimit: number): AllocatedExpense[] {
  if (total <= 0) return ratios.map(r => ({ key: r.key, name: r.name, amount: 0, ratio: 0 }));

  const rawRatios = ratios.map(r => {
    const range = r.max - r.min;
    return r.min + Math.random() * range;
  });
  const sum = rawRatios.reduce((a, b) => a + b, 0);
  const normalized = rawRatios.map(r => r / sum);

  let results = normalized.map((ratio, i) => {
    let amount = Math.round(total * ratio);
    if (ratios[i].key === "entertainment") {
      amount = Math.min(amount, entertainmentLimit);
    }
    return { key: ratios[i].key, name: ratios[i].name, amount, ratio: ratio * 100 };
  });

  // 합계 보정 (반올림 오차 + 접대비 한도 차감분) → 지급수수료에 반영
  const allocated = results.reduce((s, r) => s + r.amount, 0);
  const diff = total - allocated;
  const commissionIdx = results.findIndex(r => r.key === "commission");
  if (commissionIdx >= 0) results[commissionIdx].amount += diff;

  const finalTotal = results.reduce((s, r) => s + r.amount, 0);
  results = results.map(r => ({ ...r, ratio: finalTotal > 0 ? (r.amount / finalTotal) * 100 : 0 }));

  return results;
}

export function FreelancerCalcBoard() {
  // 매출
  const [revenue, setRevenue] = useState("");
  const [prepaidTax, setPrepaidTax] = useState("");
  const [prepaidManual, setPrepaidManual] = useState(false);

  // 업종
  const [bizCode, setBizCode] = useState<string>(BIZ_CODES[0].code);

  // 연말정산간소화 실제 사용액
  const [creditCard, setCreditCard] = useState("");
  const [debitCard, setDebitCard] = useState("");
  const [cashReceipt, setCashReceipt] = useState("");

  // 소득공제
  const [pension, setPension] = useState("");
  const [dependentCount, setDependentCount] = useState("0");
  const [hasSpouse, setHasSpouse] = useState(false);

  // 가공경비
  const [extraExpense, setExtraExpense] = useState("");
  const [ratios, setRatios] = useState<CategoryRatio[]>(DEFAULT_RATIOS);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    new Set(["commission", "travel", "entertainment", "supplies", "vehicle", "other"])
  );
  const [allocated, setAllocated] = useState<AllocatedExpense[]>([]);
  const [generated, setGenerated] = useState(false);

  const selectedBiz = useMemo(() => BIZ_CODES.find(b => b.code === bizCode), [bizCode]);

  // 자동 기납부세액 (3.3%)
  const revenueNum = parse(revenue);
  const autoPrepaid = Math.round(revenueNum * 0.033);
  const effectivePrepaid = prepaidManual ? parse(prepaidTax) : autoPrepaid;

  // 실제경비 합계
  const actualExpense = parse(creditCard) + parse(debitCard) + parse(cashReceipt);
  const extraExpNum = parse(extraExpense);
  const totalExpense = actualExpense + extraExpNum;

  // 경비율 가이드 (단순경비율 기준 권장 한도)
  const simpleRateLimit = selectedBiz ? Math.round(revenueNum * selectedBiz.simpleRate / 100) : 0;
  const expenseRatio = revenueNum > 0 ? (totalExpense / revenueNum) * 100 : 0;
  const recommendedExtra = Math.max(simpleRateLimit - actualExpense, 0); // 권장 가공경비

  // 경비율 위험도 판단
  let riskLevel: "safe" | "caution" | "danger" = "safe";
  if (selectedBiz && revenueNum > 0) {
    if (expenseRatio > selectedBiz.simpleRate + 5) riskLevel = "danger";
    else if (expenseRatio > selectedBiz.simpleRate) riskLevel = "caution";
  }

  // 접대비 한도 = 1,200만원 + 매출의 0.3% (간편장부 기준 단순화)
  const entertainmentLimit = ENTERTAINMENT_BASE_LIMIT + Math.round(revenueNum * 0.003);

  // 소득금액
  const income = Math.max(revenueNum - totalExpense, 0);

  // 소득공제
  const basicDeduct = 1500000;
  const depCount = parseInt(dependentCount) || 0;
  const dependentDeduct = depCount * 1500000;
  const spouseDeduct = hasSpouse ? 1500000 : 0;
  const pensionDeduct = parse(pension);
  const totalDeduction = basicDeduct + dependentDeduct + spouseDeduct + pensionDeduct;

  // 과세표준 / 세액
  const taxBase = Math.max(income - totalDeduction, 0);
  const computedTax = Math.round(calcTax(taxBase));
  const standardCredit = 70000;
  const totalCredit = standardCredit;
  const determinedTax = Math.max(computedTax - totalCredit, 0);
  const localTax = Math.round(determinedTax * 0.1);
  const totalTax = determinedTax + localTax;
  const finalPayment = totalTax - effectivePrepaid;

  // 가공경비 미투입 시 비교
  const incomeNoExtra = Math.max(revenueNum - actualExpense, 0);
  const tbNoExtra = Math.max(incomeNoExtra - totalDeduction, 0);
  const ctNoExtra = Math.round(calcTax(tbNoExtra));
  const dtNoExtra = Math.max(ctNoExtra - totalCredit, 0);
  const totalTaxNoExtra = dtNoExtra + Math.round(dtNoExtra * 0.1);
  const taxSaved = totalTaxNoExtra - totalTax;

  const handleGenerate = useCallback(() => {
    const enabledRatios = ratios.filter(r => enabledKeys.has(r.key));
    const result = randomAllocate(extraExpNum, enabledRatios, entertainmentLimit);
    setAllocated(result);
    setGenerated(true);
  }, [extraExpNum, ratios, enabledKeys, entertainmentLimit]);

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

  const applyRecommended = () => {
    if (recommendedExtra > 0) {
      setExtraExpense(fmt(recommendedExtra));
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182F6] to-[#1B64DA] flex items-center justify-center shadow-lg shadow-blue-200">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#191F28]">프리랜서 간편장부 계산기</h1>
          <p className="text-xs text-[#8B95A1]">업종별 경비율 가이드 · 가공경비 통계 배분 · 종합소득세 즉시 산출</p>
        </div>
      </div>

      {/* 업종 + 매출 한 줄 카드 */}
      <Card title="업종 & 매출 정보" accent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[#6B7684] mb-1 block">업종코드</label>
            <select
              value={bizCode}
              onChange={e => setBizCode(e.target.value)}
              className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]"
            >
              {BIZ_CODES.map(b => (
                <option key={b.code} value={b.code}>{b.code} {b.name}</option>
              ))}
            </select>
          </div>
          <NumField label="총 수입금액 (매출)" value={revenue} onChange={setRevenue} suffix="원" placeholder="프리랜서 수입금액" />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <NumField
                label="기납부세액 (3.3%)"
                value={prepaidManual ? prepaidTax : (autoPrepaid > 0 ? fmt(autoPrepaid) : "")}
                onChange={v => { setPrepaidManual(true); setPrepaidTax(v); }}
                suffix="원"
                placeholder="자동계산"
              />
            </div>
            {prepaidManual && (
              <button
                onClick={() => { setPrepaidManual(false); setPrepaidTax(""); }}
                className="mt-5 text-[10px] px-2 py-1 bg-[#F2F4F6] text-[#6B7684] rounded hover:bg-[#E5E8EB]"
              >자동</button>
            )}
          </div>
        </div>

        {/* 경비율 가이드 */}
        {selectedBiz && revenueNum > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <RateBox
              label="단순경비율"
              value={`${selectedBiz.simpleRate}%`}
              amount={Math.round(revenueNum * selectedBiz.simpleRate / 100)}
              hint="이 안쪽이면 안전"
              tone="green"
            />
            <RateBox
              label="기준경비율"
              value={`${selectedBiz.standardRate}%`}
              amount={Math.round(revenueNum * selectedBiz.standardRate / 100)}
              hint="추계신고시 주요경비外"
              tone="blue"
            />
            <RateBox
              label="현재 총경비율"
              value={`${expenseRatio.toFixed(1)}%`}
              amount={totalExpense}
              hint={
                riskLevel === "danger" ? "위험: 경비 과다" :
                riskLevel === "caution" ? "주의: 단순경비율 초과" :
                "양호"
              }
              tone={riskLevel === "danger" ? "red" : riskLevel === "caution" ? "amber" : "green"}
            />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 좌측: 입력 */}
        <div className="space-y-4">
          {/* 연말정산간소화 */}
          <Card title="연말정산간소화 실제 사용액">
            <div className="space-y-3">
              <NumField label="신용카드" value={creditCard} onChange={setCreditCard} suffix="원" />
              <NumField label="직불카드 (체크카드)" value={debitCard} onChange={setDebitCard} suffix="원" />
              <NumField label="현금영수증" value={cashReceipt} onChange={setCashReceipt} suffix="원" />
              <div className="bg-[#F5F9FF] rounded-lg px-3 py-2 flex justify-between items-center">
                <span className="text-xs font-medium text-[#1B64DA]">실제 사용액 합계</span>
                <span className="text-sm font-bold text-[#1B64DA]">{fmt(actualExpense)}원</span>
              </div>
              {selectedBiz && revenueNum > 0 && recommendedExtra > 0 && (
                <button
                  onClick={applyRecommended}
                  className="w-full text-xs px-3 py-2 bg-[#F0FDF4] text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                >
                  💡 권장 가공경비: <strong>{fmt(recommendedExtra)}원</strong> 자동입력
                  <span className="text-[10px] text-emerald-600 ml-1">(단순경비율 한도 기준)</span>
                </button>
              )}
            </div>
          </Card>

          {/* 소득공제 */}
          <Card title="소득공제">
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-[#F9FAFB] rounded-lg px-3 py-2">
                <span className="text-xs text-[#6B7684]">기본공제 (본인)</span>
                <span className="text-xs font-bold text-[#191F28] ml-auto">1,500,000원</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#4E5968] cursor-pointer bg-[#F9FAFB] rounded-lg px-3 py-2">
                <input type="checkbox" checked={hasSpouse} onChange={e => setHasSpouse(e.target.checked)} className="accent-[#3182F6] w-3.5 h-3.5" />
                배우자 공제 (150만원)
              </label>
              <div>
                <label className="text-xs text-[#6B7684] mb-1 block">부양가족 수 (배우자 제외)</label>
                <select
                  value={dependentCount}
                  onChange={e => setDependentCount(e.target.value)}
                  className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]"
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}명 ({fmt(n * 1500000)}원)</option>
                  ))}
                </select>
              </div>
              <NumField label="국민연금 납입액" value={pension} onChange={setPension} suffix="원" />
              <div className="bg-[#F9FAFB] rounded-lg px-3 py-2 flex justify-between items-center border-t border-[#E5E8EB]">
                <span className="text-xs font-bold text-[#4E5968]">소득공제 합계</span>
                <span className="text-sm font-bold text-[#191F28]">{fmt(totalDeduction)}원</span>
              </div>
            </div>
          </Card>
        </div>

        {/* 우측: 가공경비 + 결과 */}
        <div className="space-y-4">
          {/* 가공경비 배분 */}
          <Card title="가공경비 배분 (통계 기반)" accent>
            <div className="space-y-4">
              <NumField label="가공경비 총액" value={extraExpense} onChange={setExtraExpense} suffix="원" placeholder="투입할 가공경비 금액" />

              {/* 위험도 경고 */}
              {riskLevel === "danger" && (
                <div className="bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  ⚠️ 총경비율 {expenseRatio.toFixed(1)}%가 단순경비율({selectedBiz?.simpleRate}%)을 5%p 이상 초과합니다. 의심받을 수 있어요.
                </div>
              )}
              {riskLevel === "caution" && (
                <div className="bg-[#FFFBEB] border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  ⚡ 총경비율 {expenseRatio.toFixed(1)}%가 단순경비율({selectedBiz?.simpleRate}%)을 살짝 초과합니다. 가공경비를 줄여보세요.
                </div>
              )}

              {/* 비율 설정 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#4E5968]">계정과목별 비율 범위 (%)</span>
                  <button
                    onClick={() => { setRatios(DEFAULT_RATIOS); setEnabledKeys(new Set(["commission", "travel", "entertainment", "supplies", "vehicle", "other"])); }}
                    className="text-[10px] px-2 py-1 bg-[#F2F4F6] text-[#6B7684] rounded hover:bg-[#E5E8EB]"
                  >초기화</button>
                </div>
                <div className="space-y-1.5">
                  {ratios.map(r => {
                    const enabled = enabledKeys.has(r.key);
                    return (
                      <div key={r.key} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${enabled ? "bg-[#F9FAFB]" : "bg-[#F2F4F6] opacity-50"}`}>
                        <input
                          type="checkbox" checked={enabled}
                          onChange={() => toggleCategory(r.key)}
                          className="accent-[#3182F6] w-3.5 h-3.5"
                        />
                        <div className="w-24 shrink-0">
                          <div className="text-xs text-[#4E5968]">{r.name}</div>
                          {r.note && <div className="text-[9px] text-[#8B95A1]">{r.note}</div>}
                        </div>
                        <input
                          type="number" min={0} max={100} value={r.min} disabled={!enabled}
                          onChange={e => updateRatio(r.key, "min", parseInt(e.target.value) || 0)}
                          className="w-12 border border-[#E5E8EB] rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-[#3182F6] disabled:bg-[#F2F4F6]"
                        />
                        <span className="text-[10px] text-[#8B95A1]">~</span>
                        <input
                          type="number" min={0} max={100} value={r.max} disabled={!enabled}
                          onChange={e => updateRatio(r.key, "max", parseInt(e.target.value) || 0)}
                          className="w-12 border border-[#E5E8EB] rounded px-1.5 py-1 text-xs text-center focus:outline-none focus:border-[#3182F6] disabled:bg-[#F2F4F6]"
                        />
                        <span className="text-[10px] text-[#8B95A1]">%</span>
                      </div>
                    );
                  })}
                </div>
                {revenueNum > 0 && enabledKeys.has("entertainment") && (
                  <div className="text-[10px] text-[#8B95A1] mt-1.5">
                    접대비 한도: 1,200만원 + 매출 0.3%({fmt(Math.round(revenueNum * 0.003))}원) = <strong>{fmt(entertainmentLimit)}원</strong>
                  </div>
                )}
              </div>

              {/* 랜덤 생성 버튼 */}
              <button
                onClick={handleGenerate}
                disabled={extraExpNum <= 0}
                className="w-full py-3 bg-gradient-to-r from-[#3182F6] to-[#1B64DA] text-white font-bold rounded-xl hover:from-[#1B64DA] hover:to-[#1551B0] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
              >
                🎲 랜덤 배분 생성
              </button>

              {/* 배분 결과 */}
              {generated && allocated.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#333D4B]">배분 결과</span>
                    <button
                      onClick={handleGenerate}
                      className="text-[10px] px-2 py-1 bg-[#E8F3FF] text-[#1B64DA] rounded hover:bg-[#D4E8FF]"
                    >🔄 다시 생성</button>
                  </div>
                  {allocated.map(item => (
                    <div key={item.key} className="flex items-center justify-between bg-white border border-[#E5E8EB] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#4E5968]">{item.name}</span>
                        <span className="text-[10px] text-[#8B95A1]">({item.ratio.toFixed(1)}%)</span>
                      </div>
                      <span className="text-sm font-bold text-[#191F28]">{fmt(item.amount)}원</span>
                    </div>
                  ))}
                  <div className="bg-[#F5F9FF] rounded-lg px-3 py-2 flex justify-between items-center border border-blue-100">
                    <span className="text-xs font-bold text-[#1B64DA]">가공경비 합계</span>
                    <span className="text-sm font-bold text-[#1B64DA]">{fmt(allocated.reduce((s, a) => s + a.amount, 0))}원</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 세액 계산 결과 */}
          {revenueNum > 0 && (
            <Card title="종합소득세 계산 결과" result>
              <div className="space-y-1 text-[12px]">
                <ResultRow label="총 수입금액" value={revenueNum} />
                <ResultRow label="실제 경비 (간소화자료)" value={actualExpense} sub />
                <ResultRow label="가공경비" value={extraExpNum} sub />
                <div className="border-t border-[#E5E8EB] pt-1">
                  <ResultRow label="총 경비" value={totalExpense} bold />
                </div>
                <ResultRow label="소득금액" value={income} bold />
                <ResultRow label="소득공제" value={totalDeduction} sub />
                <div className="border-t border-[#E5E8EB] pt-1">
                  <ResultRow label="과세표준" value={taxBase} bold note={getTaxRateLabel(taxBase)} />
                </div>
                <ResultRow label="산출세액" value={computedTax} />
                <ResultRow label="세액공제 (표준)" value={standardCredit} sub />
                <div className="border-t border-[#E5E8EB] pt-1">
                  <ResultRow label="결정세액" value={determinedTax} bold />
                  <ResultRow label="지방소득세 (10%)" value={localTax} />
                  <ResultRow label="총 세액" value={totalTax} bold />
                </div>
                <ResultRow label="기납부세액" value={effectivePrepaid} sub />

                <div className={`mt-2 -mx-4 px-4 py-3 ${finalPayment >= 0 ? "bg-gradient-to-r from-amber-50 to-orange-50" : "bg-gradient-to-r from-blue-50 to-indigo-50"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#333D4B]">
                      {finalPayment >= 0 ? "납부할 세액" : "환급 세액"}
                    </span>
                    <span className={`text-2xl font-bold ${finalPayment >= 0 ? "text-[#B45309]" : "text-[#3182F6]"}`}>
                      {fmt(Math.abs(finalPayment))}원
                    </span>
                  </div>
                </div>

                {/* 가공경비 효과 */}
                {extraExpNum > 0 && taxSaved > 0 && (
                  <div className="mt-3 bg-[#F0FDF4] border border-emerald-200 rounded-lg px-3 py-2">
                    <div className="flex justify-between items-center">
                      <div className="text-[11px] text-emerald-700">
                        <strong>가공경비 절세효과</strong>
                        <span className="block text-[10px] text-emerald-600">{fmt(extraExpNum)}원 투입 → 절감률 {((taxSaved / extraExpNum) * 100).toFixed(1)}%</span>
                      </div>
                      <span className="text-base font-bold text-emerald-700">-{fmt(taxSaved)}원</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, accent, result }: { title: string; children: React.ReactNode; accent?: boolean; result?: boolean }) {
  const headerBg = accent
    ? "bg-gradient-to-r from-[#3182F6] to-[#1B64DA] text-white"
    : result
      ? "bg-gradient-to-r from-[#2a4a6a] to-[#1a3a5a] text-white"
      : "bg-[#F9FAFB] text-[#333D4B]";
  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden shadow-sm">
      <div className={`px-4 py-2.5 border-b border-[#E5E8EB] ${headerBg}`}>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

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

function ResultRow({ label, value, sub, bold, note }: { label: string; value: number; sub?: boolean; bold?: boolean; note?: string }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-medium" : ""}`}>
      <span className="text-[#6B7684]">{label} {note && <span className="text-[9px] text-[#8B95A1]">({note})</span>}</span>
      <span className={sub ? "text-[#E02E2E]" : "text-[#191F28]"}>{sub ? "-" : ""}{fmt(value)}원</span>
    </div>
  );
}

function RateBox({ label, value, amount, hint, tone }: {
  label: string; value: string; amount: number; hint: string; tone: "green" | "blue" | "amber" | "red";
}) {
  const tones = {
    green: "bg-[#F0FDF4] border-emerald-200 text-emerald-700",
    blue: "bg-[#F5F9FF] border-blue-200 text-blue-700",
    amber: "bg-[#FFFBEB] border-amber-200 text-amber-700",
    red: "bg-[#FEF2F2] border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium opacity-80">{label}</span>
        <span className="text-sm font-bold">{value}</span>
      </div>
      <div className="text-sm font-bold mt-0.5">{fmt(amount)}원</div>
      <div className="text-[9px] opacity-70 mt-0.5">{hint}</div>
    </div>
  );
}
