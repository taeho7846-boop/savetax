import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS, TASK_TYPE_LABELS } from "@/lib/constants";
import Link from "next/link";
import { TaskDeleteButton } from "./TaskDeleteButton";
import TaskStatusSelect from "./TaskStatusSelect";
import { UnifiedCreateButton } from "./TaskCreateModal";
import { MemoDeleteButton } from "./MemoDeleteButton";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; type?: string; q?: string; itemType?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const tab = params.tab || "active";
  const status = params.status || "";
  const type = params.type || "";
  const q = params.q || "";
  const itemType = params.itemType || "all"; // all | task | memo

  const isActiveTab = tab !== "done";

  // 직원인 경우 소속 세무사가 공유한 업무도 볼 수 있음
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { managerId: true },
  });

  const visibilityFilter: any[] = [
    { createdByUserId: session.id },
    { assignedUserId: session.id },
  ];
  if (session.role === "employee" && user?.managerId) {
    visibilityFilter.push({
      createdByUserId: user.managerId,
      sharedWithEmployees: true,
    });
  }

  // 업무 조회
  const tasks = itemType !== "memo" ? await prisma.task.findMany({
    where: {
      isDeleted: false,
      OR: visibilityFilter,
      ...(isActiveTab
        ? { status: status || { not: "done" } }
        : { status: "done" }),
      ...(type && { taskType: type }),
      ...(q && {
        AND: {
          OR: [
            { title: { contains: q } },
            { client: { name: { contains: q } } },
          ],
        },
      }),
    },
    include: { client: true },
    orderBy: isActiveTab
      ? [{ dueDate: "asc" }, { createdAt: "desc" }]
      : [{ completedAt: "desc" }, { createdAt: "desc" }],
  }) : [];

  // 메모 조회
  const memos = itemType !== "task" ? await prisma.memo.findMany({
    where: {
      authorId: session.id,
      ...(q && {
        OR: [
          { title: { contains: q } },
          { content: { contains: q } },
          { client: { name: { contains: q } } },
        ],
      }),
    },
    include: {
      client: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  }) : [];

  const MEMO_TYPE_LABELS: Record<string, string> = {
    general: "일반",
    handover: "인수인계",
    caution: "주의",
  };
  const MEMO_TYPE_COLORS: Record<string, string> = {
    general: "bg-gray-100 text-gray-600",
    handover: "bg-blue-100 text-blue-600",
    caution: "bg-red-100 text-red-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">업무/메모</h1>
        <UnifiedCreateButton />
      </div>

      {/* 유형 선택 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <Link
          href={`/tasks?itemType=all&tab=${tab}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            itemType === "all"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          전체
        </Link>
        <Link
          href={`/tasks?itemType=task&tab=${tab}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            itemType === "task"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          업무
        </Link>
        <Link
          href="/tasks?itemType=memo"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            itemType === "memo"
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          메모
        </Link>
      </div>

      {/* 업무 서브탭 (업무 또는 전체일 때만) */}
      {itemType !== "memo" && (
        <div className="flex gap-1 mb-4">
          <Link
            href={`/tasks?itemType=${itemType}&tab=active`}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              isActiveTab
                ? "bg-[#1a2e4a] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            진행중
          </Link>
          <Link
            href={`/tasks?itemType=${itemType}&tab=done`}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              !isActiveTab
                ? "bg-[#1a2e4a] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            완료
          </Link>
        </div>
      )}

      {/* 필터 */}
      <form className="flex gap-3 mb-5">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="itemType" value={itemType} />
        <input
          name="q"
          defaultValue={q}
          placeholder="업무명, 고객사명 검색"
          autoComplete="off"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        {itemType !== "memo" && isActiveTab && (
          <select
            name="status"
            defaultValue={status}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            <option value="">전체 상태</option>
            <option value="scheduled">예정</option>
            <option value="in_progress">진행중</option>
            <option value="hold">보류</option>
            <option value="delayed">지연</option>
          </select>
        )}
        {itemType !== "memo" && (
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
        )}
        <button
          type="submit"
          className="bg-gray-100 border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          검색
        </button>
      </form>

      {/* 업무 목록 */}
      {itemType !== "memo" && tasks.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {itemType === "all" && <th className="text-left px-4 py-3 text-gray-600 font-medium w-14">유형</th>}
                <th className="text-left px-4 py-3 text-gray-600 font-medium">고객사</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">업무</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">유형</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">생성일</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  {isActiveTab ? "마감일" : "완료일"}
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">상태</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium w-16">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  task.status !== "done" &&
                  new Date(task.dueDate) < new Date();
                return (
                  <tr
                    key={`task-${task.id}`}
                    className={`hover:bg-gray-50 transition-colors ${isOverdue ? "bg-red-50" : ""}`}
                  >
                    {itemType === "all" && (
                      <td className="px-4 py-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">업무</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {task.clientId ? (
                        <Link href={`/clients/${task.clientId}`} className="text-[#1a2e4a] hover:underline font-medium">
                          {task.client?.name ?? "고객사 없음"}
                        </Link>
                      ) : (
                        <span className="text-gray-500">고객사 없음</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{task.title}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.taskType ? TASK_TYPE_LABELS[task.taskType] || task.taskType : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(task.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      {isActiveTab ? (
                        <span className={isOverdue ? "text-red-600 font-medium" : "text-gray-600"}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString("ko-KR") : "-"}
                        </span>
                      ) : (
                        <span className="text-gray-600">
                          {task.completedAt ? new Date(task.completedAt).toLocaleDateString("ko-KR") : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusSelect taskId={task.id} currentStatus={task.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TaskDeleteButton taskId={task.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 메모 목록 */}
      {itemType !== "task" && memos.length > 0 && (
        <div className="space-y-3">
          {itemType === "all" && (
            <h3 className="text-sm font-medium text-gray-500 mt-2">메모</h3>
          )}
          {memos.map((memo) => (
            <div key={`memo-${memo.id}`} className="bg-white rounded-lg shadow-sm border border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                {itemType === "all" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">메모</span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${MEMO_TYPE_COLORS[memo.memoType] ?? MEMO_TYPE_COLORS.general}`}>
                  {MEMO_TYPE_LABELS[memo.memoType] ?? memo.memoType}
                </span>
                {memo.client && (
                  <Link href={`/clients/${memo.clientId}`} className="text-xs text-[#1a2e4a] hover:underline font-medium">
                    {memo.client.name}
                  </Link>
                )}
                <span className="text-xs text-gray-400 ml-auto">{memo.author.name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(memo.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
              {memo.title && (
                <div className="text-sm font-medium text-gray-800 mb-1">{memo.title}</div>
              )}
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{memo.content}</p>
              <div className="mt-2">
                <MemoDeleteButton memoId={memo.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {itemType === "task" && tasks.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 py-12 text-center text-gray-400">
          등록된 업무가 없습니다
        </div>
      )}
      {itemType === "memo" && memos.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 py-12 text-center text-gray-400">
          등록된 메모가 없습니다
        </div>
      )}
      {itemType === "all" && tasks.length === 0 && memos.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 py-12 text-center text-gray-400">
          등록된 업무/메모가 없습니다
        </div>
      )}
    </div>
  );
}
