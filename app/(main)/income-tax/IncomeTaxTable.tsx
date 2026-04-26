"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleIncomeTaxCheck, updateIncomeTaxField, setIncomeTaxMemo } from "@/app/actions/income-tax";
import { ComprehensiveTaxCalcModal } from "@/components/ComprehensiveTaxCalcModal";
import { PinIcon } from "@/components/icons";

type ITRecord = {
  bookkeepingDuty: string | null;
  filingType: string | null;
  noticeSent: boolean;
  linkPass: boolean;
  depreciation: boolean;
  interestExpense: boolean;
  insurance: boolean;
  donation: boolean;
  preSettlement: boolean;
  prevSales: string | null;
  prevIncome: string | null;
  prevTax: string | null;
  currSales: string | null;
  currIncome: string | null;
  currTax: string | null;
  bookkeepingCredit: boolean;
  startupReduction: boolean;
  smeReduction: boolean;
  investCredit: boolean;
  employmentCredit: boolean;
  depositReceived: boolean;
  filingDone: boolean;
  paymentSent: boolean;
  adjustmentFee: string | null;
  memo: string | null;
};

type Client = {
  id: number;
  name: string;
  clientType: string;
  ceoName?: string | null;
  residentNumber?: string | null;
  bizCategory?: string | null;
  aiStartupReduction?: string | null;
  aiSmeReduction?: string | null;
  assignedUserName?: string | null;
  incomeTaxRecords: ITRecord[];
};

function getRecord(client: Client): ITRecord {
  return client.incomeTaxRecords[0] ?? {
    bookkeepingDuty: null, filingType: null,
    noticeSent: false, linkPass: false, depreciation: false, interestExpense: false,
    insurance: false, donation: false, preSettlement: false,
    prevSales: null, prevIncome: null, prevTax: null,
    currSales: null, currIncome: null, currTax: null,
    bookkeepingCredit: false, startupReduction: false, smeReduction: false,
    investCredit: false, employmentCredit: false, depositReceived: false, filingDone: false, paymentSent: false,
    adjustmentFee: null, memo: null,
  };
}

function formatNumber(val: string | null): string {
  if (!val) return "";
  const num = parseInt(val);
  if (isNaN(num)) return val;
  return num.toLocaleString("ko-KR");
}

// 헤더 그룹 색상
const GROUP_COLORS: Record<string, string> = {
  기본: "bg-[#F9FAFB]",
  준비: "bg-[#F5F9FF]",
  가결산: "bg-[#FEFCE8]",
  전기: "bg-[#F5F9FF]",
  당기: "bg-emerald-50",
  감면: "bg-[#FFFBEB]",
  완료: "bg-[#F1FBF4]",
};

export function IncomeTaxTable({ clients, taxYear, showAssignedUser = false, activeTab = "bookkeeping" }: { clients: Client[]; taxYear: string; showAssignedUser?: boolean; activeTab?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [taxCalcModal, setTaxCalcModal] = useState<{
    clientId: number;
    clientName: string;
    currSales: string | null;
    currIncome: string | null;
    aiStartup: string | null;
    aiSme: string | null;
  } | null>(null);
  const [savedCalcIds, setSavedCalcIds] = useState<Set<number>>(new Set());

  // 저장된 세액계산 거래처 목록 조회
  useState(() => {
    fetch(`/api/income-tax/calc-setting?list=1&taxYear=${taxYear}`)
      .then(r => r.json())
      .then(data => {
        if (data.clientIds) setSavedCalcIds(new Set(data.clientIds));
      })
      .catch(() => {});
  });

  function handleYearChange(delta: number) {
    const y = parseInt(taxYear) + delta;
    router.push(`/income-tax?year=${y}&tab=${activeTab}`);
  }

  function handleTabChange(tab: string) {
    router.push(`/income-tax?year=${taxYear}&tab=${tab}`);
  }

  function handleToggle(clientId: number, field: string) {
    startTransition(async () => {
      await toggleIncomeTaxCheck(clientId, taxYear, field);
    });
  }

  function handleFieldBlur(clientId: number, field: string, value: string) {
    startTransition(async () => {
      await updateIncomeTaxField(clientId, taxYear, field, value);
    });
  }

  // 담당자 목록 추출
  const assignedUsers = [...new Set(clients.map(c => c.assignedUserName).filter(Boolean))] as string[];

  // 필터 적용
  let filteredClients = clients;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredClients = filteredClients.filter(c => c.name.toLowerCase().includes(q));
  }
  if (userFilter) {
    filteredClients = filteredClients.filter(c => c.assignedUserName === userFilter);
  }

  const doneCount = filteredClients.filter(c => getRecord(c).filingDone).length;

  const total = filteredClients.length;
  const donePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">종합소득세 신고 시즌</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">종합소득세 · {taxYear}년 귀속</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 glass rounded-2xl px-1 h-10">
            <button
              onClick={() => handleYearChange(-1)}
              className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
            >
              ◀
            </button>
            <span className="text-[13px] font-bold text-[#191F28] min-w-[70px] text-center">
              {taxYear}년
            </span>
            <button
              onClick={() => handleYearChange(1)}
              className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* 시즌 진행 배너 */}
      <div className="glass rounded-2xl p-3 mb-3 bg-gradient-to-br from-[#FBBF24]/10 to-[#F59E0B]/5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-[#92400E] font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded-full">
              5월 시즌
            </span>
            <span className="text-[14px] font-bold text-[#191F28]">5월 31일 마감</span>
          </div>
          <div className="w-px h-6 bg-[#F59E0B]/30" />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11.5px] text-[#6B7684] font-bold">신고 진행</span>
              <span className="text-[12.5px] font-bold tabular-nums">
                <span className="text-[#10B981]">{doneCount}</span>
                <span className="text-[#6B7684]"> / {total}</span>
                <span className="text-[#10B981] ml-1">({donePct}%)</span>
              </span>
            </div>
            <div className="progress"><div className="progress-fill gradient-emerald" style={{ width: `${donePct}%` }} /></div>
          </div>
        </div>
      </div>

      {/* 컨트롤 카드: 기장/단건 탭 + 검색 + 담당자 필터 */}
      <div className="glass rounded-2xl p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex bg-white/60 rounded-xl p-0.5">
          <button
            onClick={() => handleTabChange("bookkeeping")}
            className={`px-4 py-1.5 text-[12.5px] font-bold rounded-lg transition-all ${
              activeTab === "bookkeeping"
                ? "bg-white text-[#3182F6] shadow-sm"
                : "text-[#6B7684] hover:text-[#191F28]"
            }`}
          >
            기장
          </button>
          <button
            onClick={() => handleTabChange("single")}
            className={`px-4 py-1.5 text-[12.5px] font-bold rounded-lg transition-all ${
              activeTab === "single"
                ? "bg-white text-[#3182F6] shadow-sm"
                : "text-[#6B7684] hover:text-[#191F28]"
            }`}
          >
            단건
          </button>
        </div>

        <div className="flex-1 bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9 min-w-[200px]">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24">
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="거래처 검색..."
            className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]"
          />
        </div>

        {showAssignedUser && assignedUsers.length > 1 && (
          <select
            value={userFilter ?? ""}
            onChange={e => setUserFilter(e.target.value || null)}
            className="bg-white/80 border-0 rounded-xl px-3 h-9 text-[12.5px] font-bold outline-none"
          >
            <option value="">전체 담당자</option>
            {assignedUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto glass rounded-2xl">
        <table className="text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            {/* 그룹 헤더 */}
            <tr>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["기본"]} border-b border-[#E5E8EB]`} colSpan={showAssignedUser ? 6 : 5}>기본</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["준비"]} border-b border-[#A3CAFD]`} colSpan={6}>준비</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["가결산"]} border-b border-[#FDE68A]`} colSpan={1}>가결산</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["전기"]} border-b border-[#A3CAFD]`} colSpan={3}>전기</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["당기"]} border-b border-emerald-200`} colSpan={3}>당기</th>
              <th className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-200" colSpan={2}>AI판단</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["감면"]} border-b border-orange-200`} colSpan={5}>감면</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["완료"]} border-b border-[#BBF7D0]`} colSpan={3}>완료</th>
              <th className={`px-3 py-1.5 bg-rose-50 border-b border-rose-200`} colSpan={1}>조정료</th>
            </tr>
            {/* 세부 헤더 */}
            <tr className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
              <th className="px-3 py-2 text-left text-[#333D4B] font-medium sticky left-0 bg-[#F9FAFB] z-20 min-w-[100px]">고객사명</th>
              <th className="px-2 py-2 text-left text-[#4E5968] font-medium min-w-[60px]">대표자</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium w-10">메모</th>
              {showAssignedUser && (
                <th className="px-2 py-2 text-center text-[#4E5968] font-medium">담당자</th>
              )}
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기장의무</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">신고유형</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">안내문<br/>발송</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">링크<br/>패스</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">감가<br/>상각</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">이자<br/>비용</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">보험료</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기부금</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">가결산</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">매출</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">종합<br/>소득</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">결정<br/>세액</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">매출</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">종합<br/>소득</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">결정<br/>세액</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium bg-indigo-50/50">창중감</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium bg-indigo-50/50">중특감</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">기장<br/>공제</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">창중감</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">중특감</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">통합<br/>투자</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">고용<br/>증대</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">입금</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">신고<br/>완료</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">납부서<br/>발송</th>
              <th className="px-2 py-2 text-center text-[#4E5968] font-medium">조정료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F6]">
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={28} className="text-center py-12 text-[#6B7684] text-sm">
                  {clients.length === 0 ? "거래처가 없습니다" : "검색 결과가 없습니다"}
                </td>
              </tr>
            ) : (
              filteredClients.map((client, idx) => {
                const r = getRecord(client);
                // 그룹핑: 같은 대표자(이름+주민번호)인지 확인
                const groupKey = (client.ceoName || "") + (client.residentNumber || "");
                const prevClient = idx > 0 ? filteredClients[idx - 1] : null;
                const prevGroupKey = prevClient ? (prevClient.ceoName || "") + (prevClient.residentNumber || "") : "";
                const isFirstInGroup = !prevClient || groupKey !== prevGroupKey || !groupKey;
                const nextClient = idx < filteredClients.length - 1 ? filteredClients[idx + 1] : null;
                const nextGroupKey = nextClient ? (nextClient.ceoName || "") + (nextClient.residentNumber || "") : "";
                const isLastInGroup = !nextClient || groupKey !== nextGroupKey || !groupKey;
                const hasGroup = groupKey && (
                  (!isFirstInGroup) ||
                  (nextClient && nextGroupKey === groupKey)
                );
                // 그룹 크기 계산 (첫 번째일 때만)
                let groupSize = 1;
                if (isFirstInGroup && groupKey) {
                  for (let gi = idx + 1; gi < filteredClients.length; gi++) {
                    const gk = (filteredClients[gi].ceoName || "") + (filteredClients[gi].residentNumber || "");
                    if (gk === groupKey) groupSize++;
                    else break;
                  }
                }
                const showCompletionCells = !hasGroup || isFirstInGroup;

                return (
                  <tr key={client.id} className={`transition-colors ${r.filingDone ? "bg-[#F1FBF4]/50" : "hover:bg-[#F5F9FF]/30"}`} style={hasGroup && !isLastInGroup ? { borderBottom: "1px dashed #d1d5db" } : { borderBottom: "2.5px solid #9ca3af" }}>
                    {/* 고객사명 */}
                    <td className="px-3 py-2 text-[#191F28] font-medium sticky left-0 bg-white z-10 border-r border-[#F2F4F6]">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditClientId(client.id)} className="hover:underline cursor-pointer text-left">
                          {client.name}
                        </button>
                        <button
                          onClick={() => setTaxCalcModal({
                            clientId: client.id,
                            clientName: client.name,
                            currSales: r.currSales,
                            currIncome: r.currIncome,
                            aiStartup: client.aiStartupReduction ?? null,
                            aiSme: client.aiSmeReduction ?? null,
                          })}
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            savedCalcIds.has(client.id)
                              ? "bg-[#E7F7EE] text-[#15803D] hover:bg-[#BBF7D0]"
                              : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                          }`}
                          title="세액계산"
                        >
                          {savedCalcIds.has(client.id) ? "✓계산" : "계산"}
                        </button>
                      </div>
                    </td>
                    {/* 대표자 */}
                    <td className="px-2 py-2 text-left text-xs text-[#4E5968]">
                      {isFirstInGroup ? (client.ceoName ?? <span className="text-[#B0B8C1]">-</span>) : ""}
                    </td>
                    {/* 메모 */}
                    <td className="px-1 py-2 text-center">
                      {r.memo ? (
                        <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: r.memo! })}>
                          <PinIcon width={12} height={12} className="text-[#F59E0B]" />
                          <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#3182F6] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl">{r.memo}</div>
                        </span>
                      ) : (
                        <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-[#D1D6DB] hover:text-[#F59E0B] text-xs">+</button>
                      )}
                    </td>
                    {showAssignedUser && (
                      <td className="px-2 py-2 text-center text-xs text-[#4E5968]">
                        {client.assignedUserName ?? <span className="text-[#B0B8C1]">-</span>}
                      </td>
                    )}

                    {/* 기장의무 */}
                    <td className="px-1 py-1 text-center">
                      <SelectCell
                        value={r.bookkeepingDuty}
                        options={["간편장부", "복식부기", "성실신고"]}
                        onSave={(v) => handleFieldBlur(client.id, "bookkeepingDuty", v)}
                      />
                    </td>

                    {/* 신고유형 */}
                    <td className="px-1 py-1 text-center">
                      <SelectCell
                        value={r.filingType}
                        options={["자기조정", "외부조정", "간편장부", "추계-기준율", "추계-단순율", "성실신고"]}
                        onSave={(v) => handleFieldBlur(client.id, "filingType", v)}
                      />
                    </td>

                    {/* 준비 체크 */}
                    <CheckCell checked={r.noticeSent} onToggle={() => handleToggle(client.id, "noticeSent")} disabled={isPending} />
                    <CheckCell checked={r.linkPass} onToggle={() => handleToggle(client.id, "linkPass")} disabled={isPending} />
                    <CheckCell checked={r.depreciation} onToggle={() => handleToggle(client.id, "depreciation")} disabled={isPending} />
                    <CheckCell checked={r.interestExpense} onToggle={() => handleToggle(client.id, "interestExpense")} disabled={isPending} />
                    <CheckCell checked={r.insurance} onToggle={() => handleToggle(client.id, "insurance")} disabled={isPending} />
                    <CheckCell checked={r.donation} onToggle={() => handleToggle(client.id, "donation")} disabled={isPending} />

                    {/* 가결산 */}
                    <CheckCell checked={r.preSettlement} onToggle={() => handleToggle(client.id, "preSettlement")} disabled={isPending} />

                    {/* 전기 숫자 */}
                    <NumberCell value={r.prevSales} onSave={(v) => handleFieldBlur(client.id, "prevSales", v)} />
                    <NumberCell value={r.prevIncome} onSave={(v) => handleFieldBlur(client.id, "prevIncome", v)} colorType="income" />
                    <NumberCell value={r.prevTax} onSave={(v) => handleFieldBlur(client.id, "prevTax", v)} colorType="tax" />

                    {/* 당기 숫자 */}
                    <NumberCell value={r.currSales} onSave={(v) => handleFieldBlur(client.id, "currSales", v)} />
                    <NumberCell value={r.currIncome} onSave={(v) => handleFieldBlur(client.id, "currIncome", v)} colorType="income" />
                    <NumberCell value={r.currTax} onSave={(v) => handleFieldBlur(client.id, "currTax", v)} colorType="tax" />

                    {/* 감면 체크 */}
                    {/* AI판단 */}
                    <td className="px-2 py-2 text-center text-xs font-medium bg-indigo-50/30">
                      {client.aiStartupReduction === "O" ? (
                        <span className="text-[#16A865]">O</span>
                      ) : client.aiStartupReduction === "X" ? (
                        <span className="text-[#E02E2E]">X</span>
                      ) : (
                        <span className="text-[#B0B8C1]">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-xs font-medium bg-indigo-50/30">
                      {client.aiSmeReduction === "O" ? (
                        <span className="text-[#16A865]">O</span>
                      ) : client.aiSmeReduction === "X" ? (
                        <span className="text-[#E02E2E]">X</span>
                      ) : (
                        <span className="text-[#B0B8C1]">-</span>
                      )}
                    </td>

                    <CheckCell checked={r.bookkeepingCredit} onToggle={() => handleToggle(client.id, "bookkeepingCredit")} disabled={isPending} />
                    <CheckCell checked={r.startupReduction} onToggle={() => handleToggle(client.id, "startupReduction")} disabled={isPending} />
                    <CheckCell checked={r.smeReduction} onToggle={() => handleToggle(client.id, "smeReduction")} disabled={isPending} />
                    <CheckCell checked={r.investCredit} onToggle={() => handleToggle(client.id, "investCredit")} disabled={isPending} />
                    <CheckCell checked={r.employmentCredit} onToggle={() => handleToggle(client.id, "employmentCredit")} disabled={isPending} />

                    {/* 완료: 그룹의 첫 번째 행에만 체크박스 */}
                    {showCompletionCells ? (
                      <>
                        <CheckCell checked={r.depositReceived} onToggle={() => handleToggle(client.id, "depositReceived")} disabled={isPending} />
                        <CheckCell checked={r.filingDone} onToggle={() => handleToggle(client.id, "filingDone")} disabled={isPending} />
                        <CheckCell checked={r.paymentSent} onToggle={() => handleToggle(client.id, "paymentSent")} disabled={isPending} />
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2" />
                      </>
                    )}

                    {/* 조정료 */}
                    <NumberCell value={r.adjustmentFee} onSave={(v) => handleFieldBlur(client.id, "adjustmentFee", v)} />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 메모 모달 */}
      {memoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMemoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#191F28]">메모</h3>
                <p className="text-xs text-[#8B95A1] mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="메모를 입력하세요..."
              rows={4}
              className="w-full border border-[#E5E8EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#3182F6] resize-none mb-4"
              id="it-memo-textarea"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {memoModal.value && (
                <button onClick={() => { startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, "")); setMemoModal(null); }} className="text-sm text-[#E02E2E] hover:text-[#B91C1C] px-4 py-2 rounded-lg hover:bg-[#FEF2F2] transition-colors">삭제</button>
              )}
              <button onClick={() => setMemoModal(null)} className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6] transition-colors">취소</button>
              <button
                onClick={() => {
                  const val = (document.getElementById("it-memo-textarea") as HTMLTextAreaElement)?.value ?? "";
                  startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, val));
                  setMemoModal(null);
                }}
                disabled={isPending}
                className="text-sm bg-[#3182F6] text-white px-5 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
              >저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 세액계산 모달 */}
      {taxCalcModal && (
        <ComprehensiveTaxCalcModal
          onClose={() => setTaxCalcModal(null)}
          clientName={taxCalcModal.clientName}
          clientId={taxCalcModal.clientId}
          taxYear={taxYear}
          loadData={{
            currSales: taxCalcModal.currSales,
            currIncome: taxCalcModal.currIncome,
            aiStartup: taxCalcModal.aiStartup,
            aiSme: taxCalcModal.aiSme,
          }}
          onApply={(finalTax) => {
            handleFieldBlur(taxCalcModal.clientId, "currTax", String(finalTax));
            setTaxCalcModal(null);
          }}
          onSaved={() => {
            setSavedCalcIds(prev => new Set(prev).add(taxCalcModal.clientId));
          }}
        />
      )}

      {/* 고객사 수정 모달 */}
      {editClientId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditClientId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F2F4F6] shrink-0">
              <h3 className="text-sm font-bold text-[#191F28]">고객사 수정</h3>
              <button onClick={() => setEditClientId(null)} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
            </div>
            <iframe
              src={`/clients/${editClientId}/edit?modal=1`}
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </>
  );
}

function CheckCell({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <td className="px-2 py-2 text-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer"
      />
    </td>
  );
}

function NumberCell({ value, onSave, colorType }: { value: string | null; onSave: (v: string) => void; colorType?: "income" | "tax" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  const num = value ? parseInt(value) : null;
  const isNegative = num !== null && !isNaN(num) && num < 0;
  let textColor = "text-[#333D4B]";
  if (isNegative && colorType === "income") textColor = "text-[#E02E2E] font-medium";
  if (isNegative && colorType === "tax") textColor = "text-[#3182F6] font-medium";

  if (editing) {
    return (
      <td className="px-1 py-1 text-center">
        <input
          autoFocus
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onSave(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(val); setEditing(false); } }}
          className="w-20 border border-blue-300 rounded px-1 py-0.5 text-xs text-right focus:outline-none"
        />
      </td>
    );
  }
  return (
    <td
      className={`px-2 py-2 text-right cursor-pointer hover:bg-[#F5F9FF] min-w-[70px] ${textColor}`}
      onClick={() => { setVal(value ?? ""); setEditing(true); }}
    >
      {formatNumber(value) || <span className="text-[#B0B8C1]">-</span>}
    </td>
  );
}

function SelectCell({ value, options, onSave }: { value: string | null; options: string[]; onSave: (v: string) => void }) {
  return (
    <td className="px-1 py-1 text-center">
      <select
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value)}
        className="border border-[#E5E8EB] rounded px-1 py-0.5 text-xs bg-white focus:outline-none w-20"
      >
        <option value="">-</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  );
}
