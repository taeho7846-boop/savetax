import { prisma } from "@/lib/prisma";
import { createClient } from "@/app/actions/clients";
import { BizNumberInput, PhoneInput, ResidentNumberInput } from "@/components/FormattedInputs";
import { CheckboxGroup } from "@/components/CheckboxGroup";
import Link from "next/link";

export default async function NewClientPage() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-500 hover:text-gray-700 text-sm">
          ← 고객사 목록
        </Link>
        <h1 className="text-xl font-bold text-gray-900">고객사 등록</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 max-w-2xl">
        <form action={createClient} className="space-y-5">

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
            <Link href="/clients" className="border border-gray-300 text-gray-700 text-sm px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              취소
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
