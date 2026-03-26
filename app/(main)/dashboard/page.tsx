import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import Link from "next/link";
import { CmsPendingCard } from "./CmsPendingCard";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  const toYM = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const currentYM = toYM(today);
  const prevYM = toYM(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const nextYM = toYM(new Date(today.getFullYear(), today.getMonth() + 1, 1));

  const myClient = { assignedUserId: session.id };

  const cmsWhere = (ym: string) => ({
    isDeleted: false,
    ...myClient,
    firstWithdrawalMonth: ym,
    OR: [
      { bankName: null },
      { bankName: "" },
      { bankAccount: null },
      { bankAccount: "" },
    ],
  });
  const cmsSelect = { id: true, name: true, phone: true, bankName: true, bankAccount: true };

  const [totalClients, totalTasks, urgentTasks, delayedTasks, recentTasks,
         cmsPrev, cmsCurrent, cmsNext] =
    await Promise.all([
      prisma.client.count({
        where: {
          isDeleted: false,
          ...myClient,
          OR: [
            { taxTypes: null },
            { NOT: { taxTypes: { contains: "신고대리" } } },
          ],
        },
      }),
      prisma.task.count({ where: { isDeleted: false, status: { not: "done" }, client: myClient } }),
      prisma.task.findMany({
        where: {
          isDeleted: false,
          status: { notIn: ["done", "hold"] },
          dueDate: { lte: threeDaysLater, gte: today },
          client: myClient,
        },
        include: { client: true, assignedUser: true },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.task.count({
        where: { isDeleted: false, status: "delayed", client: myClient },
      }),
      prisma.task.findMany({
        where: { isDeleted: false, client: myClient },
        include: { client: true, assignedUser: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.client.findMany({ where: cmsWhere(prevYM),    select: cmsSelect, orderBy: { name: "asc" } }),
      prisma.client.findMany({ where: cmsWhere(currentYM), select: cmsSelect, orderBy: { name: "asc" } }),
      prisma.client.findMany({ where: cmsWhere(nextYM),    select: cmsSelect, orderBy: { name: "asc" } }),
    ]);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">대시보드</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">관리 고객사</div>
          <div className="text-3xl font-bold text-[#1a2e4a] mt-1">
            {totalClients}
          </div>
          <div className="text-xs text-gray-400 mt-1">전체</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">진행중 업무</div>
          <div className="text-3xl font-bold text-[#1a2e4a] mt-1">
            {totalTasks}
          </div>
          <div className="text-xs text-gray-400 mt-1">미완료 전체</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">마감 임박</div>
          <div className="text-3xl font-bold text-orange-500 mt-1">
            {urgentTasks.length}
          </div>
          <div className="text-xs text-gray-400 mt-1">3일 이내</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">지연 업무</div>
          <div className="text-3xl font-bold text-red-500 mt-1">
            {delayedTasks}
          </div>
          <div className="text-xs text-gray-400 mt-1">즉시 확인 필요</div>
        </div>
        <CmsPendingCard
          prevClients={cmsPrev}
          currentClients={cmsCurrent}
          nextClients={cmsNext}
          prevYM={prevYM}
          currentYM={currentYM}
          nextYM={nextYM}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 마감 임박 업무 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-medium text-gray-700">마감 임박 업무</h2>
            <Link
              href="/tasks"
              className="text-xs text-blue-600 hover:underline"
            >
              전체보기
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {urgentTasks.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                임박한 업무가 없습니다
              </div>
            ) : (
              urgentTasks.map((task) => (
                <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {task.client.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {task.title}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[task.status]
                      }`}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                          })
                        : "-"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 최근 업무 변경 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-700">최근 업무 변경</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentTasks.map((task) => (
              <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {task.client.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {task.title}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      STATUS_COLORS[task.status]
                    }`}
                  >
                    {STATUS_LABELS[task.status]}
                  </span>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {task.assignedUser?.name ?? "미배정"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
