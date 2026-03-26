"use client";

import { useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { BizNumberInput, PhoneInput, ResidentNumberInput } from "@/components/FormattedInputs";
import { CheckboxGroup } from "@/components/CheckboxGroup";

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
    hometaxId: string | null;
    hometaxPw: string | null;
    monthlyFee: number | null;
    firstWithdrawalMonth: string | null;
    bankName: string | null;
    bankAccount: string | null;
    notes: string | null;
    assignedUserId: number | null;
  };
  users: { id: number; name: string }[];
  currentTaxTypes: string[];
  currentLaborTypes: string[];
  onSuccess?: () => void;
}

export function EditClientForm({ action, client, users, currentTaxTypes, currentLaborTypes, onSuccess }: Props) {
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
          <input
            name="name"
            required
            defaultValue={client.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">사업자등록번호</label>
          <BizNumberInput defaultValue={client.bizNumber ?? ""} />
        </div>
      </div>

      {/* 행2: 대표자명 / 주민등록번호 / 연락처 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">대표자명</label>
          <input
            name="ceoName"
            defaultValue={client.ceoName ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">주민등록번호</label>
          <ResidentNumberInput defaultValue={client.residentNumber ?? ""} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">연락처</label>
          <PhoneInput defaultValue={client.phone ?? ""} />
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
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">신고 유형</label>
          <CheckboxGroup name="taxType" options={["기장대리", "신고대리"]} defaultValues={currentTaxTypes} />
        </div>
      </div>

      {/* 행4: 인건비 */}
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-2">인건비</label>
        <CheckboxGroup name="laborType" options={["1인사업자", "근로소득", "사업소득", "일용직"]} defaultValues={currentLaborTypes} />
      </div>

      {/* 행5: 담당자 */}
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

      {/* 홈택스 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">홈택스 계정</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">홈택스 ID</label>
            <input
              name="hometaxId"
              defaultValue={client.hometaxId ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">홈택스 PW</label>
            <input
              name="hometaxPw"
              defaultValue={client.hometaxPw ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
        </div>
      </div>

      {/* 기장료 / 출금 정보 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">청구 정보</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">월 기장료</label>
            <div className="relative">
              <input
                name="monthlyFee"
                type="number"
                min="0"
                defaultValue={client.monthlyFee ?? ""}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
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
            <input
              name="bankName"
              defaultValue={client.bankName ?? ""}
              placeholder="예) 국민은행"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">출금 계좌번호</label>
            <input
              name="bankAccount"
              defaultValue={client.bankAccount ?? ""}
              placeholder="계좌번호 입력"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
        </div>
      </div>

      {/* 주소 / 특이사항 */}
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">주소</label>
        <input
          name="address"
          defaultValue={client.address ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1">특이사항</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={client.notes ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
          ref={submitRef}
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
    </form>
  );
}
