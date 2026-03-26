"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientInModal, getCreateClientData } from "@/app/actions/clients";
import { BizNumberInput, PhoneInput, ResidentNumberInput } from "@/components/FormattedInputs";
import { CheckboxGroup } from "@/components/CheckboxGroup";

type CreateData = Awaited<ReturnType<typeof getCreateClientData>>;

export function ClientCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors shrink-0"}
      >
        + 고객사 등록
      </button>
      {open && <ClientCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    getCreateClientData().then(setData);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await createClientInModal(formData);
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">고객사 등록</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5">
          {!data ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 행1: 고객사명 / 사업자등록번호 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">
                    고객사명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">사업자등록번호</label>
                  <BizNumberInput />
                </div>
              </div>

              {/* 행2: 대표자명 / 주민등록번호 / 연락처 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">대표자명</label>
                  <input
                    name="ceoName"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">주민등록번호</label>
                  <ResidentNumberInput />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">연락처</label>
                  <PhoneInput />
                </div>
              </div>

              {/* 행3: 구분 / 과세유형 / 신고유형 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">구분</label>
                  <select
                    name="clientType"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
                  >
                    <option value="과세">과세</option>
                    <option value="면세">면세</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">신고 유형</label>
                  <CheckboxGroup name="taxType" options={["기장대리", "신고대리"]} />
                </div>
              </div>

              {/* 행4: 인건비 */}
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">인건비</label>
                <CheckboxGroup name="laborType" options={["1인사업자", "근로소득", "사업소득", "일용직"]} />
              </div>

              {/* 행5: 담당자 */}
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">담당 직원</label>
                <select
                  name="assignedUserId"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
                >
                  <option value="">미배정</option>
                  {data.users.map((u) => (
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">홈택스 PW</label>
                    <input
                      name="hometaxPw"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                    />
                  </div>
                </div>
              </div>

              {/* 청구 정보 */}
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">출금 은행</label>
                    <input
                      name="bankName"
                      placeholder="예) 국민은행"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">출금 계좌번호</label>
                    <input
                      name="bankAccount"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">특이사항</label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-gray-300 text-gray-700 text-sm px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
