"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleIncomeTaxCheck, updateIncomeTaxField, setIncomeTaxMemo } from "@/app/actions/income-tax";

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
  기본: "bg-gray-50",
  준비: "bg-blue-50",
  가결산: "bg-yellow-50",
  전기: "bg-purple-50",
  당기: "bg-emerald-50",
  감면: "bg-orange-50",
  완료: "bg-green-50",
};

export function IncomeTaxTable({ clients, taxYear, showAssignedUser = false, activeTab = "bookkeeping" }: { clients: Client[]; taxYear: string; showAssignedUser?: boolean; activeTab?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memoModal, setMemoModal] = useState<{ clientId: number; clientName: string; value: string } | null>(null);
  const [editClientId, setEditClientId] = useState<number | null>(null);

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

  const doneCount = clients.filter(c => getRecord(c).filingDone).length;

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">종합소득세</h1>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => handleTabChange("bookkeeping")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "bookkeeping"
                  ? "bg-white text-[#1a2e4a] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              기장
            </button>
            <button
              onClick={() => handleTabChange("single")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "single"
                  ? "bg-white text-[#1a2e4a] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              단건
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            신고완료: <span className="font-medium text-[#1a2e4a]">{doneCount}</span> / {clients.length}
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button
              onClick={() => handleYearChange(-1)}
              className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm"
            >
              ◀
            </button>
            <span className="text-sm font-medium text-gray-800 min-w-[80px] text-center">
              {taxYear}년 귀속
            </span>
            <button
              onClick={() => handleYearChange(1)}
              className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border border-gray-100">
        <table className="text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            {/* 그룹 헤더 */}
            <tr>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["기본"]} border-b border-gray-200`} colSpan={showAssignedUser ? 5 : 4}>기본</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["준비"]} border-b border-blue-200`} colSpan={6}>준비</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["가결산"]} border-b border-yellow-200`} colSpan={1}>가결산</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["전기"]} border-b border-purple-200`} colSpan={3}>전기</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["당기"]} border-b border-emerald-200`} colSpan={3}>당기</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["감면"]} border-b border-orange-200`} colSpan={5}>감면</th>
              <th className={`px-3 py-1.5 ${GROUP_COLORS["완료"]} border-b border-green-200`} colSpan={3}>완료</th>
              <th className={`px-3 py-1.5 bg-rose-50 border-b border-rose-200`} colSpan={1}>조정료</th>
            </tr>
            {/* 세부 헤더 */}
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-gray-700 font-medium sticky left-0 bg-gray-50 z-20 min-w-[100px]">고객사명</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium w-10">메모</th>
              {showAssignedUser && (
                <th className="px-2 py-2 text-center text-gray-600 font-medium">담당자</th>
              )}
              <th className="px-2 py-2 text-center text-gray-600 font-medium">기장의무</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">신고유형</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">안내문<br/>발송</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">링크<br/>패스</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">감가<br/>상각</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">이자<br/>비용</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">보험료</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">기부금</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">가결산</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">매출</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">종합<br/>소득</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">결정<br/>세액</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">매출</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">종합<br/>소득</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">결정<br/>세액</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">기장<br/>공제</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">창중감</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">중특감</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">통합<br/>투자</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">고용<br/>증대</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">입금</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">신고<br/>완료</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">납부서<br/>발송</th>
              <th className="px-2 py-2 text-center text-gray-600 font-medium">조정료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={26} className="text-center py-12 text-gray-500 text-sm">
                  거래처가 없습니다
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const r = getRecord(client);
                return (
                  <tr key={client.id} className={`transition-colors ${r.filingDone ? "bg-green-50/50" : "hover:bg-blue-50/30"}`}>
                    {/* 고객사명 */}
                    <td className="px-3 py-2 text-[#1a2e4a] font-medium sticky left-0 bg-white z-10 border-r border-gray-100">
                      <button onClick={() => setEditClientId(client.id)} className="hover:underline cursor-pointer text-left">
                        {client.name}
                      </button>
                      <span className="ml-1 text-[10px] text-gray-400">{client.clientType === "corporate" ? "법인" : "개인"}</span>
                    </td>
                    {/* 메모 */}
                    <td className="px-1 py-2 text-center">
                      {r.memo ? (
                        <span className="relative group cursor-pointer" onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: r.memo! })}>
                          <span className="text-amber-500 text-xs">📌</span>
                          <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-[#1a2e4a] text-white text-xs rounded-xl px-3 py-2 whitespace-pre-wrap min-w-[200px] max-w-[350px] z-50 shadow-xl">{r.memo}</div>
                        </span>
                      ) : (
                        <button onClick={() => setMemoModal({ clientId: client.id, clientName: client.name, value: "" })} className="text-gray-200 hover:text-amber-500 text-xs">+</button>
                      )}
                    </td>
                    {showAssignedUser && (
                      <td className="px-2 py-2 text-center text-xs text-gray-600">
                        {client.assignedUserName ?? <span className="text-gray-300">-</span>}
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
                    <CheckCell checked={r.bookkeepingCredit} onToggle={() => handleToggle(client.id, "bookkeepingCredit")} disabled={isPending} />
                    <CheckCell checked={r.startupReduction} onToggle={() => handleToggle(client.id, "startupReduction")} disabled={isPending} />
                    <CheckCell checked={r.smeReduction} onToggle={() => handleToggle(client.id, "smeReduction")} disabled={isPending} />
                    <CheckCell checked={r.investCredit} onToggle={() => handleToggle(client.id, "investCredit")} disabled={isPending} />
                    <CheckCell checked={r.employmentCredit} onToggle={() => handleToggle(client.id, "employmentCredit")} disabled={isPending} />

                    {/* 완료 */}
                    <CheckCell checked={r.depositReceived} onToggle={() => handleToggle(client.id, "depositReceived")} disabled={isPending} />
                    <CheckCell checked={r.filingDone} onToggle={() => handleToggle(client.id, "filingDone")} disabled={isPending} />
                    <CheckCell checked={r.paymentSent} onToggle={() => handleToggle(client.id, "paymentSent")} disabled={isPending} />

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
                <h3 className="text-base font-bold text-gray-900">메모</h3>
                <p className="text-xs text-gray-400 mt-0.5">{memoModal.clientName}</p>
              </div>
              <button onClick={() => setMemoModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <textarea
              defaultValue={memoModal.value}
              placeholder="메모를 입력하세요..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a] resize-none mb-4"
              id="it-memo-textarea"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              {memoModal.value && (
                <button onClick={() => { startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, "")); setMemoModal(null); }} className="text-sm text-red-500 hover:text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
              )}
              <button onClick={() => setMemoModal(null)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">취소</button>
              <button
                onClick={() => {
                  const val = (document.getElementById("it-memo-textarea") as HTMLTextAreaElement)?.value ?? "";
                  startTransition(() => setIncomeTaxMemo(memoModal.clientId, taxYear, val));
                  setMemoModal(null);
                }}
                disabled={isPending}
                className="text-sm bg-[#1a2e4a] text-white px-5 py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50 transition-colors"
              >저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 고객사 수정 모달 */}
      {editClientId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditClientId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-bold text-gray-900">고객사 수정</h3>
              <button onClick={() => setEditClientId(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
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
        className="accent-[#1a2e4a] w-3.5 h-3.5 cursor-pointer"
      />
    </td>
  );
}

function NumberCell({ value, onSave, colorType }: { value: string | null; onSave: (v: string) => void; colorType?: "income" | "tax" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  const num = value ? parseInt(value) : null;
  const isNegative = num !== null && !isNaN(num) && num < 0;
  let textColor = "text-gray-700";
  if (isNegative && colorType === "income") textColor = "text-red-500 font-medium";
  if (isNegative && colorType === "tax") textColor = "text-blue-500 font-medium";

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
      className={`px-2 py-2 text-right cursor-pointer hover:bg-blue-50 min-w-[70px] ${textColor}`}
      onClick={() => { setVal(value ?? ""); setEditing(true); }}
    >
      {formatNumber(value) || <span className="text-gray-300">-</span>}
    </td>
  );
}

function SelectCell({ value, options, onSave }: { value: string | null; options: string[]; onSave: (v: string) => void }) {
  return (
    <td className="px-1 py-1 text-center">
      <select
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value)}
        className="border border-gray-200 rounded px-1 py-0.5 text-xs bg-white focus:outline-none w-20"
      >
        <option value="">-</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  );
}
