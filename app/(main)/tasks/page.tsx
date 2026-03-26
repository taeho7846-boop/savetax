import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS, TASK_TYPE_LABELS } from "@/lib/constants";
import Link from "next/link";
import TaskStatusSelect from "./TaskStatusSelect";
import { TaskCreateButton } from "./TaskCreateModal";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const status = params.status || "";
  const type = params.type || "";
  const q = params.q || "";

  const tasks = await prisma.task.findMany({
    where: {
      isDeleted: false,
      client: { assignedUserId: session.id },
      ...(status && { status }),
      ...(type && { taskType: type }),
      ...(q && {
        OR: [
          { title: { contains: q } },
          { client: { name: { contains: q } } },
        ],
      }),
    },
    include: { client: true, assignedUser: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">업무 일정</h1>
        <TaskCreateButton />
      </div>

      {/* 필터 */}
      <form className="flex gap-3 mb-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="업무명, 고객사명 검색"
          autoComplete="off"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        <select
          name="status"
          defaultValue={status}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">전체 상태</option>
          <option value="scheduled">예정</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="hold">보류</option>
          <option value="delayed">지연</option>
        </select>
        <select
          name="type"
          defaultValue={type}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">전체 유형</option>
          <option value="vat">부가가치세</option>
          <option value="withholding">원천세</option>
          <option value="income">종합소득세</option>
          <option value="corporate">법인세</option>
          <option value="insurance">4대보험</option>
          <option value="settlement">결산</option>
          <option value="other">기타</option>
        </select>
        <button
          type="submit"
          className="bg-gray-100 border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          검색
        </button>
      </form>

      {/* 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">고객사</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">업무</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">유형</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">담당자</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">마감일</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  등록된 업무가 없습니다
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  task.status !== "done" &&
                  new Date(task.dueDate) < new Date();

                return (
                  <tr
                    key={task.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      isOverdue ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${task.clientId}`}
                        className="text-[#1a2e4a] hover:underline font-medium"
                      >
                        {task.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{task.title}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.taskType
                        ? TASK_TYPE_LABELS[task.taskType] || task.taskType
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {task.assignedUser?.name || (
                        <span className="text-gray-400">미배정</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isOverdue ? "text-red-600 font-medium" : "text-gray-600"
                        }
                      >
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString("ko-KR")
                          : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusSelect taskId={task.id} currentStatus={task.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
