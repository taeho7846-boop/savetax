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
import { lastBillableMonth, dueDayOfMonth, unpaidBucket, type UnpaidBucket } from "@/lib/withdrawal";
import { InsuranceCard } from "./InsuranceCard";
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

  // 관리 고객사 카드: 매니저(세무사/관리자/대표)는 본인 + 부하 직원 거래처 합산
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  const teamMembers: { id: number; name: string }[] = isManager
    ? [
        { id: session.id, name: session.name },
        ...(await prisma.user.findMany({
          where: { managerId: session.id, isActive: true },
          select: { id: true, name: true },
        })),
      ]
    : [{ id: session.id, name: session.name }];
  const teamIds = teamMembers.map((u) => u.id);

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

  // 팀(본인+직원) 기준 관리 고객사 — 해지 거래처는 운영 집계에서 제외
  const clientCountWhere = {
    isDeleted: false,
    contractStatus: "active",
    ...(isReadonly ? {} : { assignedUserId: { in: teamIds } }),
    OR: [
      { taxTypes: null },
      { NOT: { taxTypes: { contains: "신고대리" } } },
    ],
  };

  const [totalClients, individualClients, corporateClients, totalTasks, urgentTasks, delayedTasks, recentTasks,
         cmsPrev, cmsCurrent, cmsNext, feedbacks, tempMemosData, myClients, notices, knowledges, newDistributions, commissions, insuranceRaw,
         assigneeGroups, unassignedClients] =
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
      // 신규수임 프로세스 (해피콜/자료수집용) — 삭제·해지 거래처 제외
      prisma.commissionProcess.findMany({
        where: {
          completedAt: null,
          excludeConfirmed: false,
          client: { isDeleted: false, contractStatus: "active", ...myClient },
        },
        include: {
          client: { select: { name: true } },
          happyCalls: { orderBy: { calledAt: "desc" } },
        },
      }),
      // 4대보험 취득/상실 신고 진행 건 (확인 완료 전) — 거래처 수정 모달 원천세 탭에서 등록
      prisma.insuranceReport.findMany({
        where: {
          confirmedDate: null,
          reportType: { in: ["acquisition", "loss"] },
          client: { isDeleted: false, contractStatus: "active", ...myClient },
        },
        select: {
          id: true, reportType: true, workerType: true, employeeName: true, hireDate: true, leaveDate: true,
          lossReason: true, jobCertNeeded: true,
          residentNumber: true, insurances: true,
          baseSalary: true, mealAllowance: true, carAllowance: true, researchAllowance: true, memo: true,
          requestedDate: true, requestedBy: true, filedDate: true, filedBy: true,
          confirmedDate: true, confirmedBy: true,
          client: { select: { id: true, name: true } },
        },
        // 거래처명 가나다순, 같은 거래처 안에서는 등록순
        orderBy: [{ client: { name: "asc" } }, { createdAt: "asc" }],
      }),
      // 사수별 관리 고객사 수
      prisma.client.groupBy({
        by: ["assignedUserId"],
        where: clientCountWhere,
        _count: { _all: true },
      }),
      // 미배정 거래처 수 (담당자 없음)
      prisma.client.count({
        where: {
          isDeleted: false,
          contractStatus: "active",
          assignedUserId: null,
          OR: [
            { taxTypes: null },
            { NOT: { taxTypes: { contains: "신고대리" } } },
          ],
        },
      }),
    ]);

  // 사수별 건수 (팀 순서 유지: 본인 먼저)
  const perAssignee = teamMembers
    .map((u) => ({
      name: u.name,
      count: assigneeGroups.find((g) => g.assignedUserId === u.id)?._count._all ?? 0,
    }))
    .filter((u) => u.count > 0);

  const insuranceItems = insuranceRaw.map(({ client, ...r }) => ({ ...r, clientId: client.id, clientName: client.name }));

  // === 미수납 데이터 ===
  const unpaidRaw = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: "active", // 해지 거래처는 운영 페이지(홈 미수납 카드)에서 제외 — 채권관리에서만 노출
      // 매니저는 본인 + 소속 직원 담당까지 (채권관리 페이지와 동일 범위).
      // 직원은 teamIds가 본인뿐이라 기존과 같다.
      ...(isReadonly ? {} : { assignedUserId: { in: teamIds } }),
      monthlyFee: { gt: 0 }, // 기장료 0원(무료·추가사업장)은 채권 대상 아님 — 채권관리 페이지와 동일 기준
      firstWithdrawalMonth: { not: null, lte: currentYM },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true, name: true, phone: true, monthlyFee: true, firstWithdrawalMonth: true, affiliation: true, cmsStatus: true, paymentMethod: true,
      cmsAffiliation: true, withdrawalDay: true, billingTiming: true,
      feeRecords: { where: { status: "paid" } },
      unpaidPostpone: true,
      assignedUser: { select: { name: true, role: true, manager: { select: { name: true } } } },
    },
  });
  // === 미수납 데이터 가공 ===
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const unpaidClients: { id: number; name: string; phone: string | null; monthlyFee: number; affiliation: string | null; unpaidMonths: string[]; totalUnpaid: number; postponedUntil: string | null; postponeNote: string | null; cmsStatus: string; paymentMethod: string; assignedUserName: string | null; dueDay: number; bucket: UnpaidBucket }[] = [];
  for (const c of unpaidRaw) {
    // 담당 세무사 (사수가 직원이면 상위 세무사) — 최원석·세이브택스 후불 판정용
    const au = c.assignedUser;
    const accountantName = au ? (au.role === "employee" && au.manager ? au.manager.name : au.name) : null;
    const wt = { withdrawalDay: c.withdrawalDay, billingTiming: c.billingTiming, cmsAffiliation: c.cmsAffiliation, affiliation: c.affiliation, accountantName };
    // 출금일이 아직 안 지난 당월은 미수로 잡지 않는다 (출금일 다음날부터 미수)
    const billableEnd = lastBillableMonth(wt);
    const paidSet = new Set(c.feeRecords.map((r: any) => r.yearMonth));
    const unpaidMonths: string[] = [];
    let [y, m] = c.firstWithdrawalMonth!.split("-").map(Number);
    const [cy, cm] = billableEnd.split("-").map(Number);
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
        paymentMethod: c.paymentMethod ?? "cms",
        assignedUserName: c.assignedUser?.name ?? null,
        dueDay: dueDayOfMonth(wt, currentYM),
        // 당월·전월(직원 관리) / 장기(세무사 관리) 구분
        bucket: unpaidBucket(unpaidMonths),
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

  // === 거래처별 알림톡 발송 카운트/마지막시각 (해피콜·자료수집) ===
  const allCommissionClientIds = commissions.map((cp: any) => cp.clientId);
  const alimtalkLogsRaw = allCommissionClientIds.length > 0
    ? await prisma.alimtalkLog.findMany({
        where: { clientId: { in: allCommissionClientIds }, status: "sent", type: { in: ["happy_call", "doc_remind"] } },
        select: { clientId: true, type: true, sentAt: true },
        orderBy: { sentAt: "desc" },
      })
    : [];
  const alimtalkStats: Record<string, { count: number; lastSentAt: string }> = {};
  for (const log of alimtalkLogsRaw) {
    const key = `${log.clientId}:${log.type}`;
    if (!alimtalkStats[key]) {
      alimtalkStats[key] = { count: 0, lastSentAt: log.sentAt.toISOString() };
    }
    alimtalkStats[key].count++;
  }

  const happyCallItems: { commissionId: number; clientId: number; clientName: string; noAnswerCount: number; lastCallAt: string; daysElapsed: number; alimtalkCount: number; alimtalkLastSentAt: string | null }[] = [];
  const dataCollectItems: { commissionId: number; clientId: number; clientName: string; connectedAt: string; daysFromConnect: number; requestCount: number; lastRequestAt: string | null; daysSinceRequest: number | null; missingDocs: string[]; alimtalkCount: number; alimtalkLastSentAt: string | null }[] = [];
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
        const docStat = alimtalkStats[`${cp.clientId}:doc_remind`];
        dataCollectItems.push({
          commissionId: cp.id, clientId: cp.clientId, clientName, connectedAt: cp.connectedAt.toISOString(),
          daysFromConnect: dfc, requestCount: cp.dataRequestCount,
          lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
          daysSinceRequest: cp.lastDataRequestAt ? daysDiff(new Date(cp.lastDataRequestAt)) : null,
          missingDocs,
          alimtalkCount: docStat?.count || 0,
          alimtalkLastSentAt: docStat?.lastSentAt || null,
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

      const docStat = alimtalkStats[`${cp.clientId}:doc_remind`];
      dataCollectItems.push({
        commissionId: cp.id, clientId: cp.clientId, clientName, connectedAt: cp.connectedAt.toISOString(),
        daysFromConnect: dfc, requestCount: cp.dataRequestCount,
        lastRequestAt: cp.lastDataRequestAt?.toISOString() || null,
        daysSinceRequest: daysSinceReq, missingDocs,
        alimtalkCount: docStat?.count || 0,
        alimtalkLastSentAt: docStat?.lastSentAt || null,
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

      const hcStat = alimtalkStats[`${cp.clientId}:happy_call`];
      happyCallItems.push({
        commissionId: cp.id, clientId: cp.clientId, clientName,
        noAnswerCount: noAnswerCalls.length,
        lastCallAt: baseDate.toISOString(),
        daysElapsed,
        alimtalkCount: hcStat?.count || 0,
        alimtalkLastSentAt: hcStat?.lastSentAt || null,
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
      {/* 히어로: 모든 탭 동일한 두 줄 헤더 (인사말 + 오늘의 업무 N건 + 폰 팝업 버튼) */}
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

      {/* 서브탭 */}
      <DashboardTabs activeTab={activeTab} tempMemoCount={tempMemosData.length} />

      {/* 현황 탭 */}
      {activeTab === "overview" && (
        <>
          {/* 4 글래스 스탯카드 — 미니 위젯 패턴 (아래 3개 카드와 통일) */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <Link href="/clients" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center text-white">
                  <BuildingIcon width={18} height={18} strokeWidth={2.2} />
                </div>
                <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{totalClients}</span>
              </div>
              <div className="text-[14px] font-bold text-[#191F28]">관리 고객사</div>
              <div className="text-[11.5px] text-[#6B7684] mt-0.5 tabular-nums">개인 {individualClients} · 법인 {corporateClients}</div>
              {(perAssignee.length > 1 || unassignedClients > 0) && (
                <div className="text-[11.5px] text-[#6B7684] mt-0.5 tabular-nums">
                  {perAssignee.map((u, i) => (
                    <span key={u.name}>
                      {i > 0 && <span className="mx-1 text-[#D1D6DB]">·</span>}
                      {u.name} {u.count}
                    </span>
                  ))}
                  {unassignedClients > 0 && (
                    <>
                      {perAssignee.length > 0 && <span className="mx-1 text-[#D1D6DB]">·</span>}
                      <span className="text-[#DC2626] font-bold">미배정 {unassignedClients}</span>
                    </>
                  )}
                </div>
              )}
            </Link>

            <Link href="/tasks" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl gradient-purple flex items-center justify-center text-white">
                  <ClockIcon width={18} height={18} strokeWidth={2.2} />
                </div>
                <span className="text-[20px] font-bold tabular-nums text-[#191F28]">{totalTasks}</span>
              </div>
              <div className="text-[14px] font-bold text-[#191F28]">내 업무</div>
              <div className="text-[11.5px] text-[#6B7684] mt-0.5">진행 중인 업무</div>
            </Link>

            <Link href="/tasks" className="stat-card glass rounded-3xl p-5 cursor-pointer block">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl gradient-amber flex items-center justify-center text-white">
                  <CalendarIcon width={18} height={18} strokeWidth={2.2} />
                </div>
                <span className={`text-[20px] font-bold tabular-nums ${urgentTasks.length > 0 ? "text-[#D97706]" : "text-[#191F28]"}`}>{urgentTasks.length}</span>
              </div>
              <div className="text-[14px] font-bold text-[#191F28]">마감 임박</div>
              <div className="text-[11.5px] text-[#6B7684] mt-0.5">3일 이내 마감</div>
            </Link>

            <Link href="/tasks?status=delayed" className={`stat-card glass rounded-3xl p-5 cursor-pointer block ${delayedTasks > 0 ? "ring-pulse" : ""}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl gradient-rose flex items-center justify-center text-white">
                  <BellIcon width={18} height={18} strokeWidth={2.2} />
                </div>
                <span className={`text-[20px] font-bold tabular-nums ${delayedTasks > 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>{delayedTasks}</span>
              </div>
              <div className="text-[14px] font-bold text-[#191F28]">지연 업무</div>
              <div className="text-[11.5px] text-[#6B7684] mt-0.5">{delayedTasks > 0 ? "확인 필요" : "지연 없음"}</div>
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

            {/* 프로세스 카드 4-col */}
            <div className="grid grid-cols-4 gap-4">
              <HappyCallCard items={happyCallItems} />
              <DataCollectCard items={dataCollectItems} />
              <ExcludeRequestCard items={excludeItems} />
              <InsuranceCard items={insuranceItems} />
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
