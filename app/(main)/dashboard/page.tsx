import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FeedbackBoard } from "./FeedbackBoard";
import { getFeedbacks } from "@/app/actions/feedback";
import { TempMemoBox } from "./TempMemoBox";
import { getTempMemos } from "@/app/actions/temp-memo";
import { NoticeBoard } from "./NoticeBoard";
import { getNotices } from "@/app/actions/notice";
import { KnowledgeBoard } from "./KnowledgeBoard";
import { getKnowledges } from "@/app/actions/knowledge";
import { DashboardTabs } from "./DashboardTabs";
import { TodayTasksCard, HappyCallCard, DataCollectCard, ExcludeRequestCard } from "./ProcessCards";
import type { TransferItem } from "./ProcessCards";
import { UnpaidCard } from "./UnpaidCard";
import { PhonePopupButton } from "./PhonePopupButton";
import { BuildingIcon, ClockIcon, CalendarIcon, BellIcon } from "@/components/icons";

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

  const clientCountWhere = {
    isDeleted: false,
    ...myClient,
    OR: [
      { taxTypes: null },
      { NOT: { taxTypes: { contains: "신고대리" } } },
    ],
  };

  const [totalClients, individualClients, corporateClients, totalTasks, urgentTasks, delayedTasks, recentTasks,
         cmsPrev, cmsCurrent, cmsNext, feedbacks, tempMemosData, myClients, notices, knowledges, newDistributions, commissions] =
    await Promise.all([
      prisma.client.count({ where: clientCountWhere }),
      prisma.client.count({ where: { ...clientCountWhere, clientType: "individual" } }),
      prisma.client.count({ where: { ...clientCountWhere, clientType: "corporate" } }),
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
        select: { id: true, name: true, bizNumber: true, ceoName: true, phone: true, laborTypes: true },
        orderBy: { name: "asc" },
      }),
      getNotices(),
      getKnowledges(),
      // 미확인 배분 (Savetax배분 + 세무회계태호배분 본인 건)
      // - Savetax배분: clientType이 taeho_로 시작하지 않는 것
      // - 세무회계태호배분: clientType이 taeho_로 시작하는 것
      // 김태호: Savetax배분만 알림 (taeho_ 제외)
      // 이휘언: 세무회계태호배분만 알림 (taeho_ 포함)
      prisma.distribution.findMany({
        where: {
          assignedUserId: session.id,
          isSkipped: false,
          confirmedAt: null,
          clientName: { not: "-" },
          NOT: { clientType: { startsWith: "excluded_" } },
        },
        select: { id: true, clientType: true },
        orderBy: { createdAt: "desc" },
      }),
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

  // === 미수납 데이터 ===
  const unpaidRaw = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...myClient,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null, lte: currentYM },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true, name: true, phone: true, monthlyFee: true, firstWithdrawalMonth: true, affiliation: true, cmsStatus: true,
      feeRecords: { where: { status: "paid" } },
      unpaidPostpone: true,
    },
  });
  // === 미수납 데이터 가공 ===
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const unpaidClients: { id: number; name: string; phone: string | null; monthlyFee: number; affiliation: string | null; unpaidMonths: string[]; totalUnpaid: number; postponedUntil: string | null; postponeNote: string | null; cmsStatus: string }[] = [];
  for (const c of unpaidRaw) {
    const paidSet = new Set(c.feeRecords.map((r: any) => r.yearMonth));
    const unpaidMonths: string[] = [];
    let [y, m] = c.firstWithdrawalMonth!.split("-").map(Number);
    const [cy, cm] = currentYM.split("-").map(Number);
    while (y < cy || (y === cy && m <= cm)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      if (!paidSet.has(ym)) unpaidMonths.push(ym);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    if (unpaidMonths.length > 0) {
      const pp = (c as any).unpaidPostpone;
      const isPostponed = pp?.postponedUntil && new Date(pp.postponedUntil) > todayMidnight;
      unpaidClients.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        monthlyFee: c.monthlyFee!,
        affiliation: c.affiliation,
        unpaidMonths,
        totalUnpaid: unpaidMonths.length * c.monthlyFee!,
        postponedUntil: isPostponed ? pp.postponedUntil.toISOString() : null,
        postponeNote: isPostponed ? pp.note : null,
        cmsStatus: c.cmsStatus ?? "none",
      });
    }
  }
  unpaidClients.sort((a, b) => b.totalUnpaid - a.totalUnpaid);

  // === 프로세스 카드 데이터 가공 ===
  const todayTs = today.getTime(); // 오늘 자정 기준
  const dayMs = 86400000;
  // 날짜 차이 계산: 상대 날짜도 자정으로 맞춰서 비교
  function daysDiff(from: Date) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    return Math.floor((todayTs - d.getTime()) / dayMs);
  }
  // 미루기 체크: postponedUntil이 오늘 이후면 오늘의 업무에서 숨김
  function isPostponed(cp: any) {
    if (!cp.postponedUntil) return false;
    const until = new Date(cp.postponedUntil);
    until.setHours(0, 0, 0, 0);
    return until.getTime() > todayTs;
  }

  const happyCallItems: { commissionId: number; clientId: number; clientName: string; noAnswerCount: number; lastCallAt: string; daysElapsed: number }[] = [];
  const dataCollectItems: { commissionId: number; clientId: number; clientName: string; connectedAt: string; daysFromConnect: number; requestCount: number; lastRequestAt: string | null; daysSinceRequest: number | null; missingDocs: string[] }[] = [];
  const todayTasks: { type: "happycall" | "datacollect" | "transfer"; commissionId: number; clientName: string; label: string }[] = [];
  const excludeItems: { commissionId: number; clientName: string; reason: string; daysElapsed: number; requestDays: number }[] = [];
  const postponedItems: { commissionId: number; clientName: string; until: string; note: string; type: string }[] = [];
  const transferItems: TransferItem[] = [];

  for (const cp of commissions) {
    const clientName = cp.client.name;
    const noAnswerCalls = cp.happyCalls.filter((h: any) => h.result === "no_answer");
    const lastCall = cp.happyCalls[0]; // desc order, so [0] is latest
    const connected = cp.happyCalls.find((h: any) => h.result === "connected");

    // 이관자료 대기: 이관 거래처이고 아직 수령 안 함
    if (cp.transferRequested && !cp.transferReceivedAt) {
      const daysEl = daysDiff(new Date(cp.createdAt));
      const isOverdue = daysEl >= 3;
      transferItems.push({ commissionId: cp.id, clientName, daysElapsed: daysEl, isOverdue });

      // D+3 이상이면 오늘의 업무에 이관자료 요청 (매일)
      if (isOverdue && !isPostponed(cp)) {
        const daysSinceReq = cp.lastTransferRequestAt ? daysDiff(new Date(cp.lastTransferRequestAt)) : null;
        // 오늘 아직 요청 안 했으면 (요청 기록 없거나 마지막 요청이 오늘이 아니면)
        if (daysSinceReq === null || daysSinceReq >= 1) {
          todayTasks.push({ type: "transfer", commissionId: cp.id, clientName, label: `이관자료 요청 (D+${daysEl})` });
        }
      }
    }

    // 미루기 중인 항목 수집
    if (isPostponed(cp)) {
      const until = new Date(cp.postponedUntil!);
      const type = cp.connectedAt ? "자료수집" : "해피콜";
      postponedItems.push({
        commissionId: cp.id,
        clientName,
        until: until.toLocaleDateString("ko-KR", { month: "long", day: "numeric" }),
        note: cp.postponeNote || "",
        type,
      });
    }

    // 관리제외요청 상태
    if (cp.excludeRequested && !cp.excludeConfirmed) {
      const noAnswerCount = noAnswerCalls.length;
      const reason = noAnswerCount >= 3 ? "해피콜 3회 부재중" : "자료수집 3회 미수령";
      const baseDate = cp.connectedAt || cp.createdAt;
      const daysElapsed = daysDiff(new Date(baseDate));
      const requestDays = cp.excludeRequestedAt ? daysDiff(new Date(cp.excludeRequestedAt)) : daysElapsed;
      excludeItems.push({ commissionId: cp.id, clientName, reason, daysElapsed, requestDays });

      // 관리제외요청이지만 자료수집 3회 미수령인 경우 자료수집 카드에도 유지
      if (cp.connectedAt && cp.dataRequestCount >= 3 && !(cp.hasIdCard && cp.hasHometaxCredentials)) {
        const dfc = daysDiff(new Date(cp.connectedAt));
        const missingDocs: string[] = [];
        if (!cp.hasIdCard) missingDocs.push("신분증");
        if (!cp.hasHometaxCredentials) missingDocs.push("홈택스 ID/PW");
        dataCollectItems.push({
          commissionId: cp.id, clientId: cp.clientId, clientName, connectedAt: cp.connectedAt.toISOString(),
          daysFromConnect: dfc, requestCount: cp.dataRequestCount,
          lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
          daysSinceRequest: cp.lastDataRequestAt ? daysDiff(new Date(cp.lastDataRequestAt)) : null,
          missingDocs,
        });
      }
      continue;
    }

    // 자료수집 단계: 연결됨 + 아직 자료 미완료
    if (cp.connectedAt && !(cp.hasIdCard && cp.hasHometaxCredentials)) {
      const dfc = daysDiff(new Date(cp.connectedAt));
      const missingDocs: string[] = [];
      if (!cp.hasIdCard) missingDocs.push("신분증");
      if (!cp.hasHometaxCredentials) missingDocs.push("홈택스 ID/PW");
      const daysSinceReq = cp.lastDataRequestAt ? daysDiff(new Date(cp.lastDataRequestAt)) : null;

      dataCollectItems.push({
        commissionId: cp.id, clientId: cp.clientId, clientName, connectedAt: cp.connectedAt.toISOString(),
        daysFromConnect: dfc, requestCount: cp.dataRequestCount,
        lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
        daysSinceRequest: daysSinceReq, missingDocs,
      });

      // 오늘의 업무: 요청 0회이면 D+2, 이후에는 마지막 요청으로부터 2일 경과 (미루기 체크)
      if (!isPostponed(cp)) {
        if (cp.dataRequestCount === 0 && dfc >= 2) {
          todayTasks.push({ type: "datacollect", commissionId: cp.id, clientName, label: `1차 자료 요청 (D+${dfc})` });
        } else if (cp.dataRequestCount > 0 && daysSinceReq !== null && daysSinceReq >= 2) {
          todayTasks.push({ type: "datacollect", commissionId: cp.id, clientName, label: `${cp.dataRequestCount + 1}차 자료 요청 (D+${dfc})` });
        }
      }
      continue;
    }

    // 자료수집 완료 → 카드에서 제외
    if (cp.connectedAt && cp.hasIdCard && cp.hasHometaxCredentials) continue;

    // 해피콜 단계: 아직 연결 안 됨 (0회 포함)
    if (!connected && noAnswerCalls.length < 3) {
      // 기준일: 마지막 통화일 또는 등록일
      const baseDate = lastCall ? new Date(lastCall.calledAt) : new Date(cp.createdAt);
      const daysElapsed = daysDiff(baseDate);

      happyCallItems.push({
        commissionId: cp.id, clientId: cp.clientId, clientName,
        noAnswerCount: noAnswerCalls.length,
        lastCallAt: baseDate.toISOString(),
        daysElapsed,
      });

      // 오늘의 업무 (미루기 체크):
      // - 0회(신규): 등록일 다음날(D+1)부터
      // - 부재중 후: 마지막 부재중 다음날(D+1)부터
      if (daysElapsed >= 1 && !isPostponed(cp)) {
        const nextAttempt = noAnswerCalls.length + 1;
        todayTasks.push({ type: "happycall", commissionId: cp.id, clientName, label: `${nextAttempt}차 해피콜 (D+${daysElapsed})` });
      }
    }
  }

  // 이름 추출 (성 제외, 한국 복성 8개 예외 처리)
  const getFirstName = (n?: string | null) => {
    if (!n) return "";
    const compound = ["남궁", "황보", "선우", "제갈", "사공", "서문", "독고", "동방"];
    return compound.some((s) => n.startsWith(s)) ? n.slice(2) : n.slice(1);
  };
  const firstName = getFirstName(session.name);

  // 시간대 인사 (KST 기준)
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const greeting =
    kstHour < 11
      ? "좋은 아침이에요"
      : kstHour < 14
      ? "점심은 드셨나요"
      : kstHour < 18
      ? "오후도 힘내요"
      : kstHour < 22
      ? "고생 많으셨어요"
      : "늦게까지 수고하세요";

  return (
    <div>
      {/* 히어로: 개인화 인사 + 폰 팝업 버튼 */}
      {activeTab === "overview" ? (
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <div className="text-[13.5px] text-[#6B7684] font-[500]">
              {firstName}님, {greeting}
            </div>
            <div className="text-[28px] font-bold text-[#191F28] mt-1 tracking-tight leading-[1.3]">
              {todayTasks.length > 0 ? (
                <>
                  오늘 처리할 업무{" "}
                  <span className="text-[#3182F6]">{todayTasks.length}건</span>
                  이에요
                </>
              ) : (
                "오늘 할 일을 모두 완료했어요"
              )}
            </div>
          </div>
          <PhonePopupButton />
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="text-[13.5px] text-[#6B7684] font-[500]">
            {firstName}님, {greeting}
          </div>
          <PhonePopupButton />
        </div>
      )}

      {/* 서브탭 */}
      <DashboardTabs activeTab={activeTab} tempMemoCount={tempMemosData.length} />

      {/* 현황 탭 */}
      {activeTab === "overview" && (
        <>
          {/* 4 글래스 스탯카드 */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <Link href="/clients" className="stat-card glass rounded-3xl p-5 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl gradient-blue flex items-center justify-center text-white">
                  <BuildingIcon width={20} height={20} strokeWidth={2.2} />
                </div>
              </div>
              <div className="text-[13px] text-[#6B7684] font-medium mb-1">관리 고객사</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-[#191F28]">{totalClients}</div>
              <div className="text-[11px] text-[#8B95A1] mt-2 tabular-nums">개인 {individualClients} · 법인 {corporateClients}</div>
            </Link>

            <Link href="/tasks" className="stat-card glass rounded-3xl p-5 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl gradient-purple flex items-center justify-center text-white">
                  <ClockIcon width={20} height={20} strokeWidth={2.2} />
                </div>
                {totalTasks > 0 && (
                  <span className="text-[11px] text-[#3182F6] font-bold bg-[#3182F6]/10 px-2 py-0.5 rounded-full">진행중</span>
                )}
              </div>
              <div className="text-[13px] text-[#6B7684] font-medium mb-1">내 업무</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-[#191F28]">{totalTasks}</div>
            </Link>

            <Link href="/tasks" className="stat-card glass rounded-3xl p-5 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl gradient-amber flex items-center justify-center text-white">
                  <CalendarIcon width={20} height={20} strokeWidth={2.2} />
                </div>
                {urgentTasks.length > 0 && (
                  <span className="text-[11px] text-[#D97706] font-bold bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">3일 이내</span>
                )}
              </div>
              <div className="text-[13px] text-[#6B7684] font-medium mb-1">마감 임박</div>
              <div className={`text-[32px] font-bold tracking-tight leading-none ${urgentTasks.length > 0 ? "text-[#D97706]" : "text-[#8B95A1]"}`}>{urgentTasks.length}</div>
            </Link>

            <Link href="/tasks?status=delayed" className={`stat-card glass rounded-3xl p-5 cursor-pointer ${delayedTasks > 0 ? "ring-pulse" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl gradient-rose flex items-center justify-center text-white">
                  <BellIcon width={20} height={20} strokeWidth={2.2} />
                </div>
                {delayedTasks > 0 && (
                  <span className="text-[11px] text-[#DC2626] font-bold bg-[#DC2626]/10 px-2 py-0.5 rounded-full animate-pulse">확인 필요</span>
                )}
              </div>
              <div className="text-[13px] text-[#6B7684] font-medium mb-1">지연 업무</div>
              <div className={`text-[32px] font-bold tracking-tight leading-none ${delayedTasks > 0 ? "text-[#DC2626]" : "text-[#8B95A1]"}`}>{delayedTasks}</div>
            </Link>
          </div>

          {/* 알림 스트립 제거 — CMS 미등록은 미수납 카드 칩으로, 이관은 오늘의 업무에, 신규배분은 헤더 종 아이콘 뱃지로 이동 */}
          <div className="mb-2" />

          {/* 위젯 그리드 — 세로 스크롤 최소화 */}
          <div className="space-y-4 min-w-0">
            {/* 오늘의 업무 + 미수납 (50/50) */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <TodayTasksCard items={todayTasks} />
              <UnpaidCard clients={unpaidClients} />
            </div>

            {/* 프로세스 카드 3-col */}
            <div className="grid grid-cols-3 gap-4">
              <HappyCallCard items={happyCallItems} />
              <DataCollectCard items={dataCollectItems} />
              <ExcludeRequestCard items={excludeItems} />
            </div>
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

      {/* 피드백 탭 */}
      {activeTab === "feedback" && (
        <FeedbackBoard feedbacks={feedbacks} currentUserId={session.id} currentUserRole={session.role} />
      )}
    </div>
  );
}
