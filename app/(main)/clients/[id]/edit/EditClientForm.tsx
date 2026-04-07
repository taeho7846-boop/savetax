"use client";

import { useRef, useEffect, useTransition, useState } from "react";
import Link from "next/link";
import { BizNumberInput, PhoneInput, ResidentNumberInput } from "@/components/FormattedInputs";
import { CheckboxGroup } from "@/components/CheckboxGroup";

function CopyWrap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  function checkValue() {
    const input = ref.current?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
    setHasValue(!!input?.value);
  }

  function handleCopy() {
    const input = ref.current?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
    if (!input?.value) return;
    // HTTPS가 아닌 환경에서도 동작하도록 fallback
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(input.value).catch(() => fallbackCopy(input.value));
    } else {
      fallbackCopy(input.value);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  return (
    <div ref={ref} className="relative group" onMouseEnter={checkValue}>
      {children}
      {hasValue && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400 hover:text-[#1a2e4a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

interface Props {
  action: (formData: FormData) => Promise<void>;
  client: {
    name: string;
    bizNumber: string | null;
    ceoName: string | null;
    residentNumber: string | null;
    phone: string | null;
    address: string | null;
    clientType: string;
    taxationType: string | null;
    accountingProgram?: string;
    contactMethod?: string;
    hometaxId: string | null;
    hometaxPw: string | null;
    monthlyFee: number | null;
    freeMonths: number | null;
    firstWithdrawalMonth: string | null;
    bankName: string | null;
    bankAccount: string | null;
    openDate?: string | null;
    halfYearTax?: boolean;
    withholdingType?: string | null;
    affiliation?: string | null;
    notes: string | null;
    myboxLink?: string | null;
    assignedUserId: number | null;
  };
  users: { id: number; name: string }[];
  currentTaxTypes: string[];
  currentLaborTypes: string[];
  currentUserRole?: string;
  affiliationOptions?: string[];
  onSuccess?: () => void;
}

export function EditClientForm({ action, client, users, currentTaxTypes, currentLaborTypes, currentUserRole, affiliationOptions, onSuccess, hideButtons = false }: Props & { hideButtons?: boolean }) {
  const submitRef = useRef<HTMLButtonElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      submitRef.current?.click();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      onSuccess?.();
    });
  }

  return (
    <form
      data-modal-form=""
      action={onSuccess ? undefined : action}
      onSubmit={onSuccess ? handleSubmit : undefined}
      className="space-y-5"
    >
      {/* 행1: 고객사명 / 사업자등록번호 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">
            고객사명 <span className="text-red-500">*</span>
          </label>
          <CopyWrap><input
            name="name"
            required
            defaultValue={client.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
          /></CopyWrap>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">사업자등록번호</label>
          <CopyWrap><BizNumberInput defaultValue={client.bizNumber ?? ""} /></CopyWrap>
        </div>
      </div>

      {/* 행2: 대표자명 / 주민등록번호 / 연락처 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">대표자명</label>
          <CopyWrap><input
            name="ceoName"
            defaultValue={client.ceoName ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
          /></CopyWrap>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">주민등록번호</label>
          <CopyWrap><ResidentNumberInput defaultValue={client.residentNumber ?? ""} /></CopyWrap>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">연락처</label>
          <CopyWrap><PhoneInput defaultValue={client.phone ?? ""} /></CopyWrap>
        </div>
      </div>

      {/* 행3: 구분 / 과세유형 / 신고유형 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">구분</label>
          <select
            name="clientType"
            defaultValue={client.clientType}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
          >
            <option value="individual">개인</option>
            <option value="corporate">법인</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">과세유형</label>
          <select
            name="taxationType"
            defaultValue={client.taxationType ?? "과세"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
          >
            <option value="과세">과세</option>
            <option value="면세">면세</option>
            <option value="간이">간이</option>
            <option value="간이(세금계산서발행)">간이(세계발행)</option>
            <option value="폐업">폐업</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">신고 유형</label>
          <div className="flex gap-2">
            {[
              { value: "기장대리", label: "기장" },
              { value: "신고대리", label: "신고대리" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name={`taxType_${opt.value}`}
                  value={opt.value}
                  defaultChecked={currentTaxTypes.includes(opt.value)}
                  className="hidden peer"
                />
                <span className="peer-checked:bg-[#1a2e4a] peer-checked:text-white border border-gray-300 peer-checked:border-[#1a2e4a] rounded-md px-3 py-1.5 text-sm text-gray-700 select-none hover:border-[#1a2e4a] transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 회계프로그램 / 업무소통방법 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">회계프로그램</label>
          <CheckboxGroup
            name="accountingProgram"
            options={["위하고", "세무사랑"]}
            defaultValues={
              client.accountingProgram
                ? client.accountingProgram.split(",").map(s => s.trim()).filter(Boolean)
                : ["위하고"]
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">업무소통방법</label>
          <CheckboxGroup
            name="contactMethod"
            options={["메일", "카톡", "문자"]}
            defaultValues={
              client.contactMethod
                ? client.contactMethod.split(",").map(s => s.trim()).filter(Boolean)
                : ["카톡"]
            }
          />
        </div>
      </div>

      {/* 행4: 인건비 / 개업년월일 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">인건비</label>
          <CheckboxGroup name="laborType" options={["1인사업자", "근로소득", "사업소득", "일용직"]} defaultValues={currentLaborTypes} />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">개업년월일</label>
            <input
              name="openDate"
              type="date"
              defaultValue={client.openDate ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="halfYearTax"
              value="true"
              defaultChecked={client.halfYearTax ?? false}
              className="accent-[#1a2e4a] w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-800">6개월납</span>
          </label>
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-800 mb-1">원천세 유형</label>
            <select
              name="withholdingType"
              defaultValue={client.withholdingType ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            >
              <option value="">미지정</option>
              <option value="A">A — 매월 변동</option>
              <option value="B">B — 매월 동일, 납부서 필요</option>
              <option value="C">C — 매월 동일, 납부서 불필요</option>
              <option value="D">D — 1인사업자 (원천세 없음)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 행5: 담당직원 / 소속 */}
      <div className="grid grid-cols-2 gap-4">
        {currentUserRole !== "employee" ? (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">담당 직원</label>
            <select
              name="assignedUserId"
              defaultValue={client.assignedUserId ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
            >
              <option value="">미배정</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        ) : <div />}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">소속</label>
          <select
            name="affiliation"
            defaultValue={client.affiliation ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
          >
            <option value="">미선택</option>
            {(affiliationOptions ?? ["세이브택스"]).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 홈택스 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">홈택스 계정</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">홈택스 ID</label>
            <CopyWrap><input
              name="hometaxId"
              defaultValue={client.hometaxId ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            /></CopyWrap>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">홈택스 PW</label>
            <CopyWrap><input
              name="hometaxPw"
              defaultValue={client.hometaxPw ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            /></CopyWrap>
          </div>
        </div>
      </div>

      {/* 기장료 / 출금 정보 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">청구 정보</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">월 기장료</label>
            <CopyWrap><div className="relative">
              <input
                name="monthlyFee"
                type="number"
                min="0"
                defaultValue={client.monthlyFee ?? ""}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
            </div></CopyWrap>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">무료 기장</label>
            <div className="relative">
              <select
                name="freeMonths"
                defaultValue={client.freeMonths ?? 2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              >
                <option value="">미설정</option>
                <option value="0">0개월</option>
                <option value="1">1개월</option>
                <option value="2">2개월</option>
                <option value="3">3개월</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">최초 출금월</label>
            <input
              name="firstWithdrawalMonth"
              type="month"
              defaultValue={client.firstWithdrawalMonth ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">출금 은행</label>
            <CopyWrap><input
              name="bankName"
              defaultValue={client.bankName ?? ""}
              placeholder="예) 국민은행"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            /></CopyWrap>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">출금 계좌번호</label>
            <CopyWrap><input
              name="bankAccount"
              defaultValue={client.bankAccount ?? ""}
              placeholder="계좌번호 입력"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            /></CopyWrap>
          </div>
        </div>
      </div>

      {/* 주소 / 특이사항 */}
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">주소</label>
        <CopyWrap><input
          name="address"
          defaultValue={client.address ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        /></CopyWrap>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">특이사항</label>
        <CopyWrap><textarea
          name="notes"
          rows={6}
          defaultValue={client.notes ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        /></CopyWrap>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">마이박스 링크</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <CopyWrap><input
              name="myboxLink"
              defaultValue={client.myboxLink ?? ""}
              placeholder="마이박스 폴더 경로 또는 링크"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            /></CopyWrap>
          </div>
          {client.myboxLink && (
            <a
              href={client.myboxLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 bg-green-500 text-white text-sm px-3 py-2 rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              📁 열기
            </a>
          )}
        </div>
      </div>

      {/* 모달에서는 숨기고 헤더에 표시 */}
      <button type="submit" ref={submitRef} className={hideButtons ? "hidden" : "hidden"} />
      {!hideButtons && (
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
          >
            저장
          </button>
          <Link
            href="/clients"
            className="border border-gray-300 text-gray-700 text-sm px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </Link>
        </div>
      )}
    </form>
  );
}
