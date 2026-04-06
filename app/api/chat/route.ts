import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 도구 정의
const tools: Anthropic.Tool[] = [
  {
    name: "search_clients",
    description: "거래처를 이름, 대표자명, 사업자번호로 검색합니다. 여러 결과가 나올 수 있습니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "검색어 (거래처명, 대표자명, 사업자번호)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_client_detail",
    description: "특정 거래처의 상세 정보를 조회합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number", description: "거래처 ID" },
      },
      required: ["clientId"],
    },
  },
  {
    name: "update_client",
    description: "거래처 정보를 수정합니다. 반드시 사용자에게 수정 내용을 확인받은 후에만 호출하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number", description: "거래처 ID" },
        field: {
          type: "string",
          description: "수정할 필드명",
          enum: ["name", "ceoName", "phone", "bizNumber", "address", "bankName", "bankAccount", "monthlyFee", "notes", "contactMethod", "email"],
        },
        value: { type: "string", description: "새 값" },
      },
      required: ["clientId", "field", "value"],
    },
  },
  {
    name: "get_client_summary",
    description: "현재 사용자의 거래처 요약 통계를 조회합니다 (총 수, CMS 미등록 수 등).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_tasks",
    description: "업무/메모 목록을 조회합니다. 마감 임박, 지연, 진행중 등 필터 가능.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description: "필터: all(전체), urgent(마감임박 3일이내), overdue(지연), pending(진행중), completed(완료)",
          enum: ["all", "urgent", "overdue", "pending", "completed"],
        },
        limit: { type: "number", description: "조회 갯수 (기본 10)" },
      },
      required: [],
    },
  },
  {
    name: "create_task",
    description: "새 업무 또는 메모를 생성합니다. 반드시 사용자에게 내용을 확인받은 후 호출하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["task", "memo"], description: "업무 또는 메모" },
        title: { type: "string", description: "제목" },
        content: { type: "string", description: "내용" },
        dueDate: { type: "string", description: "마감일 (YYYY-MM-DD, 업무일 경우)" },
        clientName: { type: "string", description: "관련 거래처명 (선택)" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "complete_task",
    description: "업무를 완료 처리합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "number", description: "업무 ID" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "get_withholding_status",
    description: "원천세 진행현황을 조회합니다. 특정 월의 전체 진행률, 미완료 거래처 등.",
    input_schema: {
      type: "object" as const,
      properties: {
        yearMonth: { type: "string", description: "조회할 월 (YYYY-MM, 미입력시 이번달)" },
      },
      required: [],
    },
  },
  {
    name: "get_commission_status",
    description: "신규수임 현황을 조회합니다. 진행중/완료 건수, 미완료 거래처 목록.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_receivables_status",
    description: "채권/수납 현황을 조회합니다. 미수금 총액, 미수 거래처 목록.",
    input_schema: {
      type: "object" as const,
      properties: {
        year: { type: "number", description: "조회 연도 (미입력시 올해)" },
      },
      required: [],
    },
  },
  {
    name: "get_cms_list",
    description: "CMS 등록현황을 조회합니다. 미등록/등록요청중/등록 거래처 목록.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["none", "pending", "done", "all"], description: "CMS 상태 필터" },
      },
      required: [],
    },
  },
  {
    name: "get_schedule",
    description: "세무 일정/스케줄을 조회합니다. 이번달, 다음달 주요 신고/납부 기한.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: { type: "string", description: "조회할 월 (YYYY-MM, 미입력시 이번달)" },
      },
      required: [],
    },
  },
];

// 본인 + 소속직원 거래처 필터
async function getMyClientFilter(sessionId: number) {
  const employees = await prisma.user.findMany({
    where: { managerId: sessionId, isActive: true },
    select: { id: true },
  });
  const userIds = [sessionId, ...employees.map(e => e.id)];
  return { assignedUserId: { in: userIds } };
}

// 도구 실행
async function executeTool(name: string, input: Record<string, unknown>, sessionId: number) {
  const myFilter = await getMyClientFilter(sessionId);

  if (name === "search_clients") {
    const q = input.query as string;
    const clients = await prisma.client.findMany({
      where: {
        isDeleted: false,
        ...myFilter,
        OR: [
          { name: { contains: q } },
          { ceoName: { contains: q } },
          { bizNumber: { contains: q } },
        ],
      },
      select: {
        id: true, name: true, ceoName: true, bizNumber: true, phone: true,
        clientType: true, monthlyFee: true, assignedUser: { select: { name: true } },
      },
      take: 10,
      orderBy: { name: "asc" },
    });
    if (clients.length === 0) return "검색 결과가 없습니다.";
    return JSON.stringify(clients.map(c => ({
      id: c.id,
      거래처명: c.name,
      대표자: c.ceoName,
      사업자번호: c.bizNumber,
      전화번호: c.phone,
      구분: c.clientType === "corporate" ? "법인" : "개인",
      월기장료: c.monthlyFee,
      담당자: c.assignedUser?.name,
    })), null, 2);
  }

  if (name === "get_client_detail") {
    const id = input.clientId as number;
    const c = await prisma.client.findUnique({
      where: { id },
      include: { assignedUser: { select: { name: true } } },
    });
    if (!c || c.isDeleted) return "거래처를 찾을 수 없습니다.";
    return JSON.stringify({
      id: c.id,
      거래처명: c.name,
      대표자: c.ceoName,
      사업자번호: c.bizNumber,
      전화번호: c.phone,
      이메일: c.email,
      주소: c.address,
      구분: c.clientType === "corporate" ? "법인" : "개인",
      세금유형: c.taxTypes,
      인건비유형: c.laborTypes,
      회계프로그램: c.accountingProgram,
      소통방법: c.contactMethod,
      월기장료: c.monthlyFee,
      출금은행: c.bankName,
      계좌번호: c.bankAccount,
      특이사항: c.notes,
      담당자: c.assignedUser?.name,
      CMS상태: c.cmsStatus === "done" ? "등록" : c.cmsStatus === "pending" ? "등록요청중" : "미등록",
    }, null, 2);
  }

  if (name === "update_client") {
    const id = input.clientId as number;
    const field = input.field as string;
    const value = input.value as string;

    const allowedFields = ["name", "ceoName", "phone", "bizNumber", "address", "bankName", "bankAccount", "monthlyFee", "notes", "contactMethod", "email"];
    if (!allowedFields.includes(field)) return "수정할 수 없는 필드입니다.";

    const c = await prisma.client.findUnique({ where: { id } });
    if (!c || c.isDeleted) return "거래처를 찾을 수 없습니다.";

    const data: Record<string, unknown> = {};
    if (field === "monthlyFee") {
      data[field] = parseInt(value) || null;
    } else {
      data[field] = value || null;
    }

    await prisma.client.update({ where: { id }, data });
    const fieldNames: Record<string, string> = {
      name: "거래처명", ceoName: "대표자명", phone: "전화번호", bizNumber: "사업자번호",
      address: "주소", bankName: "출금은행", bankAccount: "계좌번호", monthlyFee: "월기장료",
      notes: "특이사항", contactMethod: "소통방법", email: "이메일",
    };
    return `✅ ${c.name}의 ${fieldNames[field] || field}을(를) "${value}"(으)로 수정했습니다.`;
  }

  if (name === "get_client_summary") {
    const [total, cmsNone, cmsPending] = await Promise.all([
      prisma.client.count({ where: { isDeleted: false, ...myFilter } }),
      prisma.client.count({ where: { isDeleted: false, ...myFilter, cmsStatus: "none" } }),
      prisma.client.count({ where: { isDeleted: false, ...myFilter, cmsStatus: "pending" } }),
    ]);
    return JSON.stringify({ 전체거래처: total, CMS미등록: cmsNone, CMS등록요청중: cmsPending });
  }

  if (name === "get_tasks") {
    const filter = (input.filter as string) || "all";
    const limit = (input.limit as number) || 10;
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const notDone = { notIn: ["done"] };
    let where: any = { createdByUserId: sessionId };
    if (filter === "urgent") where = { ...where, status: notDone, dueDate: { lte: threeDays, gte: now } };
    else if (filter === "overdue") where = { ...where, status: notDone, dueDate: { lt: now } };
    else if (filter === "pending") where = { ...where, status: notDone };
    else if (filter === "completed") where = { ...where, status: "done" };

    const tasks = await prisma.task.findMany({
      where,
      select: { id: true, title: true, notes: true, taskType: true, status: true, dueDate: true, client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: limit,
    });
    if (tasks.length === 0) return "해당하는 업무가 없습니다.";
    const statusMap: Record<string, string> = { scheduled: "예정", in_progress: "진행중", done: "완료", hold: "보류", delayed: "지연" };
    return JSON.stringify(tasks.map(t => ({
      id: t.id,
      유형: t.taskType || "기타",
      제목: t.title,
      메모: t.notes?.slice(0, 50) || "-",
      상태: statusMap[t.status] || t.status,
      마감일: t.dueDate ? new Date(t.dueDate).toLocaleDateString("ko-KR") : "-",
      거래처: t.client?.name || "-",
    })), null, 2);
  }

  if (name === "create_task") {
    const type = (input.type as string) || "task";
    const title = input.title as string;
    const content = (input.content as string) || "";
    const dueDate = input.dueDate ? new Date(input.dueDate as string) : null;
    const clientName = input.clientName as string | undefined;

    let clientId: number | null = null;
    if (clientName) {
      const client = await prisma.client.findFirst({ where: { name: { contains: clientName }, isDeleted: false } });
      if (client) clientId = client.id;
    }

    await prisma.task.create({
      data: {
        title,
        notes: content || null,
        taskType: type === "memo" ? "기타" : (input.type as string) || "기타",
        status: "scheduled",
        dueDate,
        clientId,
        createdByUserId: sessionId,
      },
    });
    return `✅ ${type === "task" ? "업무" : "메모"} "${title}" 생성 완료${dueDate ? ` (마감: ${dueDate.toLocaleDateString("ko-KR")})` : ""}`;
  }

  if (name === "complete_task") {
    const id = input.taskId as number;
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return "업무를 찾을 수 없습니다.";
    await prisma.task.update({ where: { id }, data: { status: "done", completedAt: new Date() } });
    return `✅ "${task.title}" 완료 처리되었습니다.`;
  }

  if (name === "get_withholding_status") {
    const now = new Date();
    const ym = (input.yearMonth as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const clients = await prisma.client.findMany({
      where: { isDeleted: false, ...myFilter, laborTypes: { not: null } },
      select: { id: true, name: true, laborTypes: true, withholdingRecords: { where: { yearMonth: ym } } },
    });

    const withLaborClients = clients.filter(c => c.laborTypes && c.laborTypes !== "1인사업자");
    const totalRecords = withLaborClients.reduce((sum, c) => sum + c.withholdingRecords.length, 0);
    const doneRecords = withLaborClients.reduce((sum, c) => sum + c.withholdingRecords.filter(r => r.done).length, 0);
    const skippedClients = withLaborClients.filter(c => c.withholdingRecords.some(r => r.taskType === "신고없음" && r.done));
    const noRecordClients = withLaborClients.filter(c => c.withholdingRecords.length === 0 && !skippedClients.find(s => s.id === c.id));

    return JSON.stringify({
      월: ym,
      대상거래처: withLaborClients.length,
      신고없음: skippedClients.length,
      완료업무: doneRecords,
      미착수거래처: noRecordClients.slice(0, 10).map(c => c.name),
    }, null, 2);
  }

  if (name === "get_commission_status") {
    const [pending, completed] = await Promise.all([
      prisma.commissionProcess.count({ where: { completedAt: null } }),
      prisma.commissionProcess.count({ where: { completedAt: { not: null } } }),
    ]);
    const pendingList = await prisma.commissionProcess.findMany({
      where: { completedAt: null },
      select: { client: { select: { name: true, ceoName: true } }, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return JSON.stringify({
      진행중: pending,
      완료: completed,
      진행중목록: pendingList.map(p => ({ 거래처: p.client.name, 대표자: p.client.ceoName, 등록일: new Date(p.createdAt).toLocaleDateString("ko-KR") })),
    }, null, 2);
  }

  if (name === "get_receivables_status") {
    const year = (input.year as number) || new Date().getFullYear();
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const clients = await prisma.client.findMany({
      where: { isDeleted: false, ...myFilter, monthlyFee: { not: null }, firstWithdrawalMonth: { not: null } },
      include: { feeRecords: true },
    });

    let totalUnpaid = 0;
    const unpaidClients: { name: string; unpaid: number }[] = [];

    for (const c of clients) {
      const months: string[] = [];
      let [y, m] = c.firstWithdrawalMonth!.split("-").map(Number);
      const [ty, tm] = currentYM.split("-").map(Number);
      while (y < ty || (y === ty && m <= tm)) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
        m++; if (m > 12) { m = 1; y++; }
      }
      const paidCount = c.feeRecords.filter(r => r.status === "paid" && months.includes(r.yearMonth)).length;
      const unpaid = (c.monthlyFee ?? 0) * (months.length - paidCount);
      if (unpaid > 0) {
        totalUnpaid += unpaid;
        unpaidClients.push({ name: c.name, unpaid });
      }
    }

    unpaidClients.sort((a, b) => b.unpaid - a.unpaid);
    return JSON.stringify({
      총미수금: `${totalUnpaid.toLocaleString()}원`,
      미수거래처수: unpaidClients.length,
      상위미수거래처: unpaidClients.slice(0, 10).map(c => ({ 거래처: c.name, 미수금: `${c.unpaid.toLocaleString()}원` })),
    }, null, 2);
  }

  if (name === "get_cms_list") {
    const status = (input.status as string) || "none";
    const where: any = { isDeleted: false, ...myFilter };
    if (status !== "all") where.cmsStatus = status;

    const clients = await prisma.client.findMany({
      where,
      select: { name: true, ceoName: true, cmsStatus: true, bankName: true, bankAccount: true, monthlyFee: true },
      orderBy: { name: "asc" },
      take: 20,
    });

    const statusLabel = { none: "미등록", pending: "등록요청중", done: "등록" } as Record<string, string>;
    return JSON.stringify({
      필터: statusLabel[status] || "전체",
      갯수: clients.length,
      목록: clients.map(c => ({
        거래처: c.name,
        대표자: c.ceoName,
        상태: statusLabel[c.cmsStatus] || c.cmsStatus,
        출금은행: c.bankName || "미입력",
        월기장료: c.monthlyFee ? `${c.monthlyFee.toLocaleString()}원` : "-",
      })),
    }, null, 2);
  }

  if (name === "get_schedule") {
    const now = new Date();
    const ym = (input.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = ym.split("-").map(Number);

    // 세무 주요 일정 (고정)
    const schedules: { date: string; title: string }[] = [];
    schedules.push({ date: `${y}-${String(m).padStart(2, "0")}-10`, title: "원천세 신고/납부 기한" });
    schedules.push({ date: `${y}-${String(m).padStart(2, "0")}-10`, title: "지방소득세(특별징수) 신고/납부" });
    if (m === 1) {
      schedules.push({ date: `${y}-01-25`, title: "부가가치세 확정신고 (2기)" });
      schedules.push({ date: `${y}-01-31`, title: "간이지급명세서(근로) 제출" });
    }
    if (m === 2) schedules.push({ date: `${y}-02-28`, title: "지급명세서 제출 (근로/사업/일용)" });
    if (m === 3) schedules.push({ date: `${y}-03-31`, title: "법인세 신고" });
    if (m === 4) schedules.push({ date: `${y}-04-25`, title: "부가가치세 예정신고 (1기)" });
    if (m === 5) schedules.push({ date: `${y}-05-31`, title: "종합소득세 신고" });
    if (m === 7) {
      schedules.push({ date: `${y}-07-25`, title: "부가가치세 확정신고 (1기)" });
      schedules.push({ date: `${y}-07-31`, title: "간이지급명세서(근로) 제출" });
    }
    if (m === 10) schedules.push({ date: `${y}-10-25`, title: "부가가치세 예정신고 (2기)" });

    // DB 스케줄 조회
    const dbSchedules = await prisma.task.findMany({
      where: {
        dueDate: {
          gte: new Date(y, m - 1, 1),
          lt: new Date(y, m, 1),
        },
        createdByUserId: sessionId,
      },
      select: { title: true, dueDate: true, status: true },
      orderBy: { dueDate: "asc" },
    });

    return JSON.stringify({
      월: ym,
      주요세무일정: schedules,
      내업무: dbSchedules.map(s => ({
        제목: s.title,
        마감일: s.dueDate ? new Date(s.dueDate).toLocaleDateString("ko-KR") : "-",
        상태: s.status === "completed" ? "완료" : "진행중",
      })),
    }, null, 2);
  }

  return "알 수 없는 도구입니다.";
}

export async function POST(req: NextRequest) {
  const { message, history, _internalUserId } = await req.json();

  // 내부 호출 (텔레그램 등) 또는 일반 세션
  let session: { id: number; name: string; role: string } | null = null;
  if (_internalUserId && req.headers.get("x-internal-key") === (process.env.ANTHROPIC_API_KEY || "").slice(-10)) {
    const user = await prisma.user.findUnique({ where: { id: _internalUserId }, select: { id: true, name: true, role: true } });
    if (user) session = user;
  } else {
    session = await getSession();
  }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!message) return NextResponse.json({ error: "메시지가 필요합니다" }, { status: 400 });

  // 지식한입 DB
  const knowledges = await prisma.knowledge.findMany({
    select: { category: true, title: true, content: true, tags: true, files: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const knowledgeContext = knowledges
    .map((k) => {
      let entry = `[${k.category}] ${k.title}\n${k.content}`;
      if (k.tags) entry += `\n태그: ${k.tags}`;
      if (k.files) entry += `\n첨부파일: ${k.files}`;
      return entry;
    })
    .join("\n\n---\n\n");

  // 공지사항
  const notices = await prisma.notice.findMany({
    select: { category: true, subCategory: true, title: true, content: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const noticeContext = notices
    .map((n) => `[${n.category}/${n.subCategory ?? ""}] ${n.title}\n${n.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `당신은 세무사 사무실의 내부 AI 어시스턴트입니다. 현재 사용자: ${session.name}

## 역할
1. **세무/회계 지식 답변**: 아래 지식 데이터베이스와 공지사항에 등록된 내용을 기반으로 답변합니다. 제목이라도 일치하는 항목이 있으면 해당 내용을 최대한 제공하세요. DB에 완전히 없는 주제만 "지식한입에 등록해주세요"라고 안내하세요.
2. **거래처 정보 조회/수정**: 도구를 사용하여 거래처를 검색하고 정보를 조회/수정할 수 있습니다.
3. **공지사항 안내**: 공지사항에 등록된 서식, 양식, 절차 등을 안내할 수 있습니다.
4. **업무 관리**: 업무/메모 조회, 생성, 완료 처리를 할 수 있습니다.
5. **현황 조회**: 원천세 진행현황, 신규수임 현황, 채권/미수금 현황, CMS 등록현황을 조회할 수 있습니다.
6. **일정 안내**: 세무 주요 일정과 개인 업무 스케줄을 안내할 수 있습니다.

## 데이터 수정 규칙
- 거래처 수정이나 업무 생성 요청 시 반드시 먼저 내용을 확인받으세요.
- 수정 전에 "○○을(를) □□(으)로 변경할까요?" 라고 확인을 구하세요.
- 사용자가 "응", "네", "ㅇㅇ", "맞아" 등으로 확인하면 실행하세요.
- 여러 거래처가 검색되면 어떤 거래처인지 확인하세요.
- 업무 생성 시에도 제목, 마감일 등을 확인 후 생성하세요.

## 답변 스타일
- 간결하고 실무적으로 답변하세요.
- 마크다운 형식을 사용하세요.
- 거래처 정보는 보기 좋게 정리해서 보여주세요.

## 지식 데이터베이스
${knowledgeContext || "(등록된 지식 없음)"}

## 공지사항
${noticeContext || "(등록된 공지 없음)"}`;

  // 대화 히스토리
  const messages: Anthropic.MessageParam[] = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: message });

  try {
    // Tool use 루프 (최대 5번)
    let response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools,
    });

    let loopCount = 0;
    while (response.stop_reason === "tool_use" && loopCount < 5) {
      loopCount++;
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      const toolResults: Anthropic.MessageParam = {
        role: "user",
        content: toolBlocks.map((tb) => ({
          type: "tool_result" as const,
          tool_use_id: tb.id,
          content: "", // placeholder
        })),
      };

      // 각 도구 실행
      const results = await Promise.all(
        toolBlocks.map((tb) => executeTool(tb.name, tb.input as Record<string, unknown>, session.id))
      );

      (toolResults.content as Array<{ type: "tool_result"; tool_use_id: string; content: string }>).forEach(
        (tr, i) => { tr.content = results[i]; }
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push(toolResults);

      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
      });
    }

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("[Chat] API 오류:", err);
    return NextResponse.json({ error: "AI 응답 실패" }, { status: 500 });
  }
}
