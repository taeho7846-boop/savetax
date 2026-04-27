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
    general: "bg-[#F2F4F6] text-[#4E5968]",
    handover: "bg-[#E8F3FF] text-[#3182F6]",
    caution: "bg-[#FEF2F2] text-[#DC2626]",
  };

  // 통계 (stat 카드용)
  const allOpenTasks = await prisma.task.findMany({
    where: { isDeleted: false, OR: visibilityFilter, status: { not: "done" } },
    select: { dueDate: true, status: true, completedAt: true },
  });
  const inProgressCount = allOpenTasks.filter(t => t.status !== "done").length;
  const overdueCount = allOpenTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
  const monthDoneCount = await prisma.task.count({
    where: {
      isDeleted: false,
      OR: visibilityFilter,
      status: "done",
      completedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    },
  });
  const totalMemoCount = await prisma.memo.count({ where: { authorId: session.id } });
  const overdueClient = allOpenTasks.find(t => t.dueDate && new Date(t.dueDate) < new Date());
  const overdueDays = overdueClient?.dueDate
    ? Math.floor((Date.now() - new Date(overdueClient.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div>
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium flex items-center gap-1.5">
            <span className="live-dot" />
            팀 업무 보드 · 실시간
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">업무 / 메모</h1>
        </div>
        <UnifiedCreateButton />
      </div>

      {/* AI 제안 스트립 */}
      {overdueCount > 0 && (
        <div className="ai-strip rounded-xl px-4 py-2.5 mb-3 flex items-center gap-3">
          <div className="ai-icon-glow w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0">AI</div>
          <div className="flex-1 text-[12.5px] text-[#191F28]">
            <span className="font-semibold">지연 업무 {overdueCount}건</span>
            <span className="text-[#6B7684]"> · 가장 오래된 건은 D+{overdueDays}일째 — 우선 처리 권장</span>
          </div>
          <Link href="/tasks?status=delayed" className="text-[11.5px] text-[#6366F1] font-semibold hover:underline">지연 보기 →</Link>
        </div>
      )}

      {/* 4 stat 카드 + 미니 스파크라인 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-[#8B95A1]">진행중 업무</div>
            <svg width="50" height="18" viewBox="0 0 50 18" className="text-[#3182F6]">
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,12 10,9 20,11 30,5 40,7 50,3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[22px] font-bold leading-none tracking-tight">{inProgressCount}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-[#8B95A1]">완료 업무</div>
            <svg width="50" height="18" viewBox="0 0 50 18" className="text-[#10B981]">
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,15 10,13 20,8 30,10 40,5 50,4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-[22px] font-bold leading-none tracking-tight">{monthDoneCount}</div>
            <div className="text-[10.5px] text-[#8B95A1]">이번 달</div>
          </div>
        </div>
        <div className={`glass rounded-xl p-4 ${overdueCount > 0 ? "border-l-2 border-[#DC2626]" : ""}`}>
          <div className="flex items-center justify-between mb-1">
            <div className={`text-[11px] font-medium ${overdueCount > 0 ? "text-[#DC2626]" : "text-[#8B95A1]"}`}>지연</div>
            <svg width="50" height="18" viewBox="0 0 50 18" className={overdueCount > 0 ? "text-[#DC2626]" : "text-[#8B95A1]"}>
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,14 10,12 20,10 30,8 40,6 50,3" strokeLinecap="round" />
            </svg>
          </div>
          <div className={`text-[22px] font-bold leading-none tracking-tight ${overdueCount > 0 ? "text-[#DC2626]" : ""}`}>{overdueCount}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-[#8B95A1]">메모</div>
            <svg width="50" height="18" viewBox="0 0 50 18" className="text-[#A855F7]">
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,8 10,10 20,7 30,9 40,5 50,7" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[22px] font-bold leading-none tracking-tight">{totalMemoCount}</div>
        </div>
      </div>

      {/* 유형 선택 — Toss pill 탭 */}
      <div className="inline-flex gap-0.5 mb-4 p-1 bg-[#F2F4F6] rounded-[12px]">
        {[
          { key: "all", label: "전체", href: `/tasks?itemType=all&tab=${tab}` },
          { key: "task", label: "업무", href: `/tasks?itemType=task&tab=${tab}` },
          { key: "memo", label: "메모", href: "/tasks?itemType=memo" },
        ].map(t => {
          const active = itemType === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`px-4 py-1.5 text-[13px] rounded-[10px] transition-all ${
                active
                  ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-[#6B7684] hover:text-[#191F28] font-[500]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* 업무 서브탭 (업무 또는 전체일 때만) */}
      {itemType !== "memo" && (
        <div className="flex gap-1 mb-4">
          <Link
            href={`/tasks?itemType=${itemType}&tab=active`}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              isActiveTab
                ? "bg-[#3182F6] text-white"
                : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
            }`}
          >
            진행중
          </Link>
          <Link
            href={`/tasks?itemType=${itemType}&tab=done`}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              !isActiveTab
                ? "bg-[#3182F6] text-white"
                : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
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
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm flex-1 focus:outline-none focus:border-[#3182F6]"
        />
        {itemType !== "memo" && isActiveTab && (
          <select
            name="status"
            defaultValue={status}
            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none"
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
            className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none"
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
          className="bg-[#3182F6] text-white text-[13px] font-bold px-5 py-2 rounded-[10px] hover:bg-[#1B64DA] transition-colors"
        >
          검색
        </button>
      </form>

      {/* 업무 목록 */}
      {itemType !== "memo" && tasks.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden mb-6">
          <table className="w-full text-[12.5px]">
            <thead className="bg-white/60 backdrop-blur sticky top-0 z-10 border-b border-white/40">
              <tr>
                {itemType === "all" && <th className="text-center px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold min-w-[60px]">구분</th>}
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">고객사</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">업무</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">유형</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">생성일</th>
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">
                  {isActiveTab ? "마감일" : "완료일"}
                </th>
                <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold">상태</th>
                <th className="text-center px-4 py-2.5 text-[10.5px] uppercase tracking-wider text-[#6B7684] font-bold w-16">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  task.status !== "done" &&
                  new Date(task.dueDate) < new Date();
                return (
                  <tr
                    key={`task-${task.id}`}
                    className={`transition-colors ${isOverdue ? "bg-[#FEF2F2]/60" : "hover:bg-white/60"}`}
                  >
                    {itemType === "all" && (
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#E8F3FF] text-[#1B64DA] font-medium whitespace-nowrap">업무</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {task.clientId ? (
                        <Link href={`/clients/${task.clientId}`} className="text-[#191F28] hover:underline font-medium">
                          {task.client?.name ?? "고객사 없음"}
                        </Link>
                      ) : (
                        <span className="text-[#6B7684]">고객사 없음</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#191F28] whitespace-pre-wrap break-words">{task.title}</div>
                      {task.notes && (
                        <div className="text-xs text-[#8B95A1] mt-0.5 whitespace-pre-wrap break-words">{task.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#6B7684]">
                      {task.taskType ? TASK_TYPE_LABELS[task.taskType] || task.taskType : "-"}
                    </td>
                    <td className="px-4 py-3 text-[#6B7684]">
                      {new Date(task.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      {isActiveTab ? (
                        <span className={isOverdue ? "text-[#DC2626] font-medium" : "text-[#4E5968]"}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString("ko-KR") : "-"}
                        </span>
                      ) : (
                        <span className="text-[#4E5968]">
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
            <h3 className="text-sm font-medium text-[#6B7684] mt-2">메모</h3>
          )}
          {memos.map((memo) => (
            <div key={`memo-${memo.id}`} className="glass rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                {itemType === "all" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] font-medium">메모</span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${MEMO_TYPE_COLORS[memo.memoType] ?? MEMO_TYPE_COLORS.general}`}>
                  {MEMO_TYPE_LABELS[memo.memoType] ?? memo.memoType}
                </span>
                {memo.client && (
                  <Link href={`/clients/${memo.clientId}`} className="text-xs text-[#191F28] hover:underline font-medium">
                    {memo.client.name}
                  </Link>
                )}
                <span className="text-xs text-[#8B95A1] ml-auto">{memo.author.name}</span>
                <span className="text-xs text-[#8B95A1]">
                  {new Date(memo.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
              {memo.title && (
                <div className="text-sm font-medium text-[#191F28] mb-1">{memo.title}</div>
              )}
              <p className="text-sm text-[#333D4B] whitespace-pre-wrap">{memo.content}</p>
              <div className="mt-2">
                <MemoDeleteButton memoId={memo.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {itemType === "task" && tasks.length === 0 && (
        <div className="glass rounded-2xl py-14 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">아직 등록된 업무가 없어요</div>
          <div className="text-[12px] text-[#8B95A1] mt-1">우측 상단에서 새 업무를 추가할 수 있어요</div>
        </div>
      )}
      {itemType === "memo" && memos.length === 0 && (
        <div className="glass rounded-2xl py-14 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">등록된 메모가 없어요</div>
          <div className="text-[12px] text-[#8B95A1] mt-1">고객사별 참고사항을 빠르게 남겨보세요</div>
        </div>
      )}
      {itemType === "all" && tasks.length === 0 && memos.length === 0 && (
        <div className="glass rounded-2xl py-14 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">아직 등록된 업무나 메모가 없어요</div>
          <div className="text-[12px] text-[#8B95A1] mt-1">우측 상단에서 첫 업무를 추가해보세요</div>
        </div>
      )}
    </div>
  );
}
