import { prisma } from "@/lib/prisma";
import { createMemo } from "@/app/actions/memos";
import Link from "next/link";

export default async function NewMemoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const params = await searchParams;
  const preselectedClientId = params.clientId || "";

  const clients = await prisma.client.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/memos" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 메모 목록
        </Link>
        <h1 className="text-xl font-bold text-gray-800">메모 작성</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 max-w-2xl">
        <form action={createMemo} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                고객사 (선택)
              </label>
              <select
                name="clientId"
                defaultValue={preselectedClientId}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">전체 공통</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                메모 유형
              </label>
              <select
                name="memoType"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="general">일반</option>
                <option value="handover">인수인계</option>
                <option value="caution">주의사항</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="content"
              required
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
              placeholder="메모 내용을 입력하세요"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
            >
              저장
            </button>
            <Link
              href="/memos"
              className="border border-gray-300 text-gray-600 text-sm px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              취소
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
