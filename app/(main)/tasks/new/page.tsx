import { prisma } from "@/lib/prisma";
import { createTask } from "@/app/actions/tasks";
import Link from "next/link";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const params = await searchParams;
  const preselectedClientId = params.clientId || "";

  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { isDeleted: false, contractStatus: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tasks" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 업무 목록
        </Link>
        <h1 className="text-xl font-bold text-gray-800">업무 등록</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 max-w-2xl">
        <form action={createTask} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                고객사 <span className="text-red-500">*</span>
              </label>
              <select
                name="clientId"
                required
                defaultValue={preselectedClientId}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">선택하세요</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                업무명 <span className="text-red-500">*</span>
              </label>
              <input
                name="title"
                required
                placeholder="예: 2025년 1기 부가세 신고"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                업무 유형
              </label>
              <select
                name="taskType"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">선택 안 함</option>
                <option value="vat">부가가치세</option>
                <option value="withholding">원천세</option>
                <option value="income">종합소득세</option>
                <option value="corporate">법인세</option>
                <option value="insurance">4대보험</option>
                <option value="settlement">결산</option>
                <option value="other">기타</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                담당자
              </label>
              <select
                name="assignedUserId"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">미배정</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                마감일
              </label>
              <input
                name="dueDate"
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                우선순위
              </label>
              <select
                name="priority"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="low">낮음</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                상태
              </label>
              <select
                name="status"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="scheduled">예정</option>
                <option value="in_progress">진행중</option>
                <option value="done">완료</option>
                <option value="hold">보류</option>
                <option value="delayed">지연</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모
            </label>
            <textarea
              name="notes"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-[#1a2e4a] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
            >
              등록
            </button>
            <Link
              href="/tasks"
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
