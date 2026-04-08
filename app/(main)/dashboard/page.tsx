import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import Link from "next/link";
import { CmsPendingCard } from "./CmsPendingCard";
import { FeedbackBoard } from "./FeedbackBoard";
import { getFeedbacks } from "@/app/actions/feedback";
import { TempMemoBox } from "./TempMemoBox";
import { getTempMemos } from "@/app/actions/temp-memo";
import { NoticeBoard } from "./NoticeBoard";
import { getNotices } from "@/app/actions/notice";
import { KnowledgeBoard } from "./KnowledgeBoard";
import { getKnowledges } from "@/app/actions/knowledge";
import { DashboardTabs } from "./DashboardTabs";
import { TransferDocsCard } from "./TransferDocsCard";
import { TodayTasksCard, HappyCallCard, DataCollectCard, ExcludeRequestCard } from "./ProcessCards";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const activeTab = params.tab || "overview";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  const toYM = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const currentYM = toYM(today);
  const prevYM = toYM(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const nextYM = toYM(new Date(today.getFullYear(), today.getMonth() + 1, 1));

  const isReadonly = session.role === "readonly";
  const myClient = isReadonly ? {} : { assignedUserId: session.id };

  const cmsWhere = (ym: string | { lt: string }) => ({
    isDeleted: false,
    ...myClient,
    taxTypes: { contains: "기장대리" },
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
         cmsPrev, cmsCurrent, cmsNext, feedbacks, tempMemosData, myClients, notices, knowledges, commissions] =
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
      prisma.client.findMany({ where: cmsWhere({ lt: currentYM }), select: cmsSelect, orderBy: { name: "asc" } }),
      prisma.client.findMany({ where: cmsWhere(currentYM), select: cmsSelect, orderBy: { name: "asc" } }),
      prisma.client.findMany({ where: cmsWhere(nextYM),    select: cmsSelect, orderBy: { name: "asc" } }),
      getFeedbacks(),
      getTempMemos(),
      prisma.client.findMany({
        where: { isDeleted: false, assignedUserId: session.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      getNotices(),
      getKnowledges(),
      // 신규수임 프로세스 (해피콜/자료수집용)
      prisma.commissionProcess.findMany({
        where: {
          completedAt: null,
          excludeConfirmed: false,
          client: { isDeleted: false, ...myClient },
        },
        include: {
          client: { select: { name: true } },
          happyCalls: { orderBy: { calledAt: "desc" } },
        },
      }),
    ]);

  // === 프로세스 카드 데이터 가공 ===
  const todayTs = today.getTime();
  const dayMs = 86400000;

  const happyCallItems: { commissionId: number; clientName: string; noAnswerCount: number; lastCallAt: string; daysElapsed: number }[] = [];
  const dataCollectItems: { commissionId: number; clientName: string; connectedAt: string; daysFromConnect: number; requestCount: number; lastRequestAt: string | null; daysSinceRequest: number | null; missingDocs: string[] }[] = [];
  const todayTasks: { type: "happycall" | "datacollect"; commissionId: number; clientName: string; label: string }[] = [];
  const excludeItems: { commissionId: number; clientName: string; reason: string; daysElapsed: number }[] = [];

  for (const cp of commissions) {
    const clientName = cp.client.name;
    const noAnswerCalls = cp.happyCalls.filter((h: any) => h.result === "no_answer");
    const lastCall = cp.happyCalls[0]; // desc order, so [0] is latest
    const connected = cp.happyCalls.find((h: any) => h.result === "connected");

    // 관리제외요청 상태
    if (cp.excludeRequested && !cp.excludeConfirmed) {
      const noAnswerCount = noAnswerCalls.length;
      const reason = noAnswerCount >= 3 ? "해피콜 3회 부재중" : "자료수집 3회 미수령";
      const baseDate = cp.connectedAt || cp.createdAt;
      const daysElapsed = Math.floor((todayTs - new Date(baseDate).getTime()) / dayMs);
      excludeItems.push({ commissionId: cp.id, clientName, reason, daysElapsed });

      // 관리제외요청이지만 자료수집 3회 미수령인 경우 자료수집 카드에도 유지
      if (cp.connectedAt && cp.dataRequestCount >= 3 && !(cp.hasIdCard && cp.hasHometaxCredentials)) {
        const dfc = Math.floor((todayTs - new Date(cp.connectedAt).getTime()) / dayMs);
        const missingDocs: string[] = [];
        if (!cp.hasIdCard) missingDocs.push("신분증");
        if (!cp.hasHometaxCredentials) missingDocs.push("홈택스 ID/PW");
        dataCollectItems.push({
          commissionId: cp.id, clientName, connectedAt: cp.connectedAt.toISOString(),
          daysFromConnect: dfc, requestCount: cp.dataRequestCount,
          lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
          daysSinceRequest: cp.lastDataRequestAt ? Math.floor((todayTs - new Date(cp.lastDataRequestAt).getTime()) / dayMs) : null,
          missingDocs,
        });
      }
      continue;
    }

    // 자료수집 단계: 연결됨 + 아직 자료 미완료
    if (cp.connectedAt && !(cp.hasIdCard && cp.hasHometaxCredentials)) {
      const dfc = Math.floor((todayTs - new Date(cp.connectedAt).getTime()) / dayMs);
      const missingDocs: string[] = [];
      if (!cp.hasIdCard) missingDocs.push("신분증");
      if (!cp.hasHometaxCredentials) missingDocs.push("홈택스 ID/PW");
      const daysSinceReq = cp.lastDataRequestAt ? Math.floor((todayTs - new Date(cp.lastDataRequestAt).getTime()) / dayMs) : null;

      dataCollectItems.push({
        commissionId: cp.id, clientName, connectedAt: cp.connectedAt.toISOString(),
        daysFromConnect: dfc, requestCount: cp.dataRequestCount,
        lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
        daysSinceRequest: daysSinceReq, missingDocs,
      });

      // 오늘의 업무: 요청 0회이면 D+2, 이후에는 마지막 요청으로부터 2일 경과
      if (cp.dataRequestCount === 0 && dfc >= 2) {
        todayTasks.push({ type: "datacollect", commissionId: cp.id, clientName, label: `1차 자료 요청 (D+${dfc})` });
      } else if (cp.dataRequestCount > 0 && daysSinceReq !== null && daysSinceReq >= 2) {
        todayTasks.push({ type: "datacollect", commissionId: cp.id, clientName, label: `${cp.dataRequestCount + 1}차 자료 요청 (D+${dfc})` });
      }
      continue;
    }

    // 자료수집 완료 → 카드에서 제외
    if (cp.connectedAt && cp.hasIdCard && cp.hasHometaxCredentials) continue;

    // 해피콜 단계: 아직 연결 안 됨 (0회 포함)
    if (!connected && noAnswerCalls.length < 3) {
      // 기준일: 마지막 통화일 또는 등록일
      const baseDate = lastCall ? new Date(lastCall.calledAt) : new Date(cp.createdAt);
      const daysElapsed = Math.floor((todayTs - baseDate.getTime()) / dayMs);

      happyCallItems.push({
        commissionId: cp.id, clientName,
        noAnswerCount: noAnswerCalls.length,
        lastCallAt: baseDate.toISOString(),
        daysElapsed,
      });

      // 오늘의 업무:
      // - 0회(신규): 등록일 다음날(D+1)부터
      // - 부재중 후: 마지막 부재중 다음날(D+1)부터
      if (daysElapsed >= 1) {
        const nextAttempt = noAnswerCalls.length + 1;
        todayTasks.push({ type: "happycall", commissionId: cp.id, clientName, label: `${nextAttempt}차 해피콜 (D+${daysElapsed})` });
      }
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-5">대시보드</h1>

      {/* 서브탭 */}
      <DashboardTabs activeTab={activeTab} tempMemoCount={tempMemosData.length} />

      {/* 현황 탭 */}
      {activeTab === "overview" && (
        <>
          {/* 임시메모함 알림 */}
          {tempMemosData.length > 0 && (
            <Link href="/dashboard?tab=memo" className="block mb-5 bg-purple-50 border border-purple-200 rounded-xl px-5 py-3 hover:bg-purple-100 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <span className="text-sm font-medium text-purple-800">텔레그램 메모 {tempMemosData.length}건이 도착했습니다</span>
                <span className="text-xs text-purple-500 ml-auto">정리하기 →</span>
              </div>
            </Link>
          )}

          {/* 이관자료 수신 */}
          <TransferDocsCard />

          {/* 요약 카드 */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-sm text-gray-500">관리 고객사</div>
              <div className="text-3xl font-bold text-[#1a2e4a] mt-1">{totalClients}</div>
              <div className="text-xs text-gray-400 mt-1">전체</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-sm text-gray-500">진행중 업무</div>
              <div className="text-3xl font-bold text-[#1a2e4a] mt-1">{totalTasks}</div>
              <div className="text-xs text-gray-400 mt-1">미완료 전체</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-sm text-gray-500">마감 임박</div>
              <div className="text-3xl font-bold text-orange-500 mt-1">{urgentTasks.length}</div>
              <div className="text-xs text-gray-400 mt-1">3일 이내</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="text-sm text-gray-500">지연 업무</div>
              <div className="text-3xl font-bold text-red-500 mt-1">{delayedTasks}</div>
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

          {/* 프로세스 카드 */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <TodayTasksCard items={todayTasks} />
            <HappyCallCard items={happyCallItems} />
            <DataCollectCard items={dataCollectItems} />
            <ExcludeRequestCard items={excludeItems} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-medium text-gray-700">마감 임박 업무</h2>
                <Link href="/tasks" className="text-xs text-blue-600 hover:underline">전체보기</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {urgentTasks.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 text-sm">임박한 업무가 없습니다</div>
                ) : (
                  urgentTasks.map((task) => (
                    <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{task.client?.name ?? "고객사 없음"}</div>
                        <div className="text-xs text-gray-500 truncate">{task.title}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="font-medium text-gray-700">최근 업무 변경</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {recentTasks.map((task) => (
                  <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{task.client?.name ?? "고객사 없음"}</div>
                      <div className="text-xs text-gray-500 truncate">{task.title}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                      <div className="text-xs text-gray-400 mt-0.5">{task.assignedUser?.name ?? "미배정"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <FeedbackBoard feedbacks={feedbacks} currentUserId={session.id} currentUserRole={session.role} />
          </div>
        </>
      )}

      {/* 공지사항 탭 */}
      {activeTab === "notice" && (
        <NoticeBoard notices={notices} currentUserId={session.id} currentUserRole={session.role} />
      )}

      {/* 지식한입 탭 */}
      {activeTab === "knowledge" && (
        <KnowledgeBoard items={knowledges} currentUserId={session.id} currentUserRole={session.role} />
      )}

      {/* 임시메모함 탭 */}
      {activeTab === "memo" && (
        <TempMemoBox memos={tempMemosData} clients={myClients} />
      )}
    </div>
  );
}
