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
    name: "find_insurance_branch",
    description: "4대보험 관할 지사를 찾습니다. 거래처명을 받으면 해당 거래처의 주소로 국민연금/건강보험/고용산재 관할 지사를 조회합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "거래처명 (주소를 조회할 거래처)" },
        address: { type: "string", description: "직접 주소를 입력할 경우 (거래처명 대신)" },
      },
      required: [],
    },
  },
  {
    name: "create_client_with_commission",
    description: "거래처를 신규 등록하고 신규수임 프로세스를 자동 생성합니다. 계약서/수임 텍스트를 파싱한 결과를 넘겨주세요. 반드시 사용자에게 파싱 결과를 보여주고 확인받은 후 호출하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "거래처명 (상호)" },
        ceoName: { type: "string", description: "대표자명" },
        bizNumber: { type: "string", description: "사업자등록번호" },
        phone: { type: "string", description: "대표자 연락처" },
        clientType: { type: "string", enum: ["individual", "corporate"], description: "개인/법인" },
        monthlyFee: { type: "number", description: "월기장료 (VAT 제외 원본 금액을 그대로 전달. 코드에서 자동으로 VAT 포함 계산함)" },
        firstWithdrawalMonth: { type: "string", description: "최초 출금월 (YYYY-MM)" },
        openDate: { type: "string", description: "개업일 (YYYY-MM-DD)" },
        residentNumber: { type: "string", description: "주민등록번호" },
        address: { type: "string", description: "주소" },
        email: { type: "string", description: "이메일" },
        notes: { type: "string", description: "특이사항/특별요청사항" },
        hometaxId: { type: "string", description: "홈택스 ID" },
        hometaxPw: { type: "string", description: "홈택스 PW" },
      },
      required: ["name"],
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
    name: "save_idcard_to_commission",
    description: "현재 대화에 업로드된 이미지를 해당 거래처의 신규수임 대표자 신분증으로 저장합니다. 사용자가 이미지와 함께 거래처명을 알려주면, 거래처를 검색하고 이 도구를 호출하세요. 여러 거래처가 검색되면 어떤 거래처인지 확인하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "거래처명 (검색용)" },
        clientId: { type: "number", description: "거래처 ID (이미 알고 있으면)" },
      },
      required: [],
    },
  },
  {
    name: "upload_to_drive",
    description: "파일(이미지/문서)을 거래처의 구글 드라이브 특정 폴더에 업로드합니다. 사용자가 파일과 함께 거래처명, 폴더명을 알려주면 호출하세요. 폴더명을 모르면 사용자에게 물어보세요 (0.기본정보 / 1.원천세 / 2.부가가치세 / 3.종합소득세 or 법인세 / 4.이관자료).",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "거래처명 (검색용)" },
        clientId: { type: "number", description: "거래처 ID (이미 알고 있으면)" },
        folderName: { type: "string", description: "저장할 하위폴더명 (예: 0. 기본정보, 1. 원천세, 2. 부가가치세, 3. 종합소득세, 4. 이관자료)" },
        fileName: { type: "string", description: "저장할 파일명 (예: 부가세신고서_2026_1기.pdf)" },
      },
      required: ["folderName"],
    },
  },
  {
    name: "list_drive_files",
    description: "거래처의 구글 드라이브 폴더 내 파일 목록을 조회합니다.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "거래처명" },
        clientId: { type: "number", description: "거래처 ID" },
        folderName: { type: "string", description: "조회할 하위폴더명 (미입력시 거래처 폴더 전체)" },
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
async function executeTool(name: string, input: Record<string, unknown>, sessionId: number, imageBase64?: string) {
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

  if (name === "find_insurance_branch") {
    let address = input.address as string | undefined;

    // 거래처명으로 주소 조회
    if (!address && input.clientName) {
      const client = await prisma.client.findFirst({
        where: { isDeleted: false, ...myFilter, name: { contains: input.clientName as string } },
        select: { name: true, address: true },
      });
      if (!client) return `"${input.clientName}" 거래처를 찾을 수 없습니다.`;
      if (!client.address) return `"${client.name}" 거래처에 주소가 등록되어 있지 않습니다. 고객사 수정에서 주소를 입력해주세요.`;
      address = client.address;
    }

    if (!address) return "거래처명 또는 주소를 알려주세요.";

    try {
      const { execSync } = await import("child_process");
      const body = JSON.stringify({ address });
      const result = execSync(
        `curl -s --connect-timeout 10 -X POST -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}' "http://localhost:80/api/insurance-branch"`,
        { encoding: "utf-8" }
      );
      const data = JSON.parse(result);

      if (data.error) return `조회 실패: ${data.error} (주소: ${address})`;
      if (!data.branches || data.branches.length === 0) return `"${address}" 주소로 관할 지사를 찾을 수 없습니다. 주소를 확인해주세요.`;

      return JSON.stringify({
        주소: address,
        시군구: data.sggNm,
        관할지사: data.branches.map((b: any) => ({
          기관: b.institution,
          지사명: b.branch,
          주소: b.addressInfo,
          전화: b.phone,
        })),
      }, null, 2);
    } catch (e) {
      return "4대보험 지사 조회 중 오류가 발생했습니다.";
    }
  }

  if (name === "create_client_with_commission") {
    const clientName = input.name as string;
    if (!clientName) return "거래처명은 필수입니다.";

    // 사업자번호 중복 체크
    const bizNum = ((input.bizNumber as string) || "").replace(/[^0-9]/g, "");
    if (bizNum.length >= 10) {
      const bizFormatted = `${bizNum.slice(0, 3)}-${bizNum.slice(3, 5)}-${bizNum.slice(5, 10)}`;
      const existing = await prisma.client.findFirst({
        where: { isDeleted: false, OR: [{ bizNumber: bizNum }, { bizNumber: bizFormatted }] },
      });
      if (existing) return `⚠️ 사업자번호 ${bizFormatted}로 이미 등록된 거래처가 있습니다: "${existing.name}"`;
    }

    // 출금월 포맷 정리 (26-06 → 2026-06)
    let firstMonth = (input.firstWithdrawalMonth as string) || null;
    if (firstMonth) {
      const m = firstMonth.match(/^(\d{2})-(\d{2})$/);
      if (m) firstMonth = `20${m[1]}-${m[2]}`;
    }

    // 개업일 포맷 (20200624 → 2020-06-24)
    let openDate = (input.openDate as string) || null;
    if (openDate) {
      const digits = openDate.replace(/[^0-9]/g, "");
      if (digits.length === 8) openDate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }

    // 기장료 (VAT 제외이므로 1.1 곱하여 VAT 포함 금액으로 변환)
    const rawFee = input.monthlyFee as number | undefined;
    const monthlyFee = rawFee ? Math.round(rawFee * 1.1) : null;
    console.log(`[거래처 등록] 기장료: VAT제외 ${rawFee} → VAT포함 ${monthlyFee}`);

    const client = await prisma.client.create({
      data: {
        name: clientName,
        ceoName: (input.ceoName as string) || null,
        bizNumber: bizNum.length >= 10 ? `${bizNum.slice(0, 3)}-${bizNum.slice(3, 5)}-${bizNum.slice(5, 10)}` : null,
        phone: (input.phone as string) || null,
        clientType: (input.clientType as string) || "individual",
        monthlyFee,
        firstWithdrawalMonth: firstMonth,
        openDate,
        residentNumber: (input.residentNumber as string) || null,
        address: (input.address as string) || null,
        email: (input.email as string) || null,
        notes: (input.notes as string) || null,
        hometaxId: (input.hometaxId as string) || null,
        hometaxPw: (input.hometaxPw as string) || null,
        assignedUserId: sessionId,
        taxTypes: "기장대리",
        accountingProgram: "위하고",
        contactMethod: "카톡",
        affiliation: "세이브택스",
      },
    });

    // 신규수임 자동 생성
    await prisma.commissionProcess.create({ data: { clientId: client.id } });

    // 구글 드라이브 폴더 생성
    let driveUrl = "";
    try {
      const { createClientFolder } = await import("@/lib/google-drive");
      const user = await prisma.user.findUnique({ where: { id: sessionId }, select: { name: true } });
      if (user) {
        const { folderId, folderUrl } = await createClientFolder(user.name, clientName, (input.clientType as string) || "individual");
        await prisma.client.update({ where: { id: client.id }, data: { driveFolderId: folderId } });
        driveUrl = folderUrl;
      }
    } catch (e) {
      console.error("[Google Drive] 폴더 생성 실패:", e);
    }

    const parts = [`✅ 거래처 "${clientName}" 등록 완료 + 신규수임 자동 생성`];
    if (monthlyFee) parts.push(`월기장료: ${monthlyFee.toLocaleString()}원 (VAT포함)`);
    if (firstMonth) parts.push(`최초출금월: ${firstMonth}`);
    if (input.notes) parts.push(`특이사항: ${(input.notes as string).slice(0, 50)}...`);
    if (driveUrl) parts.push(`📁 구글 드라이브: ${driveUrl}`);
    return parts.join("\n");
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

  if (name === "upload_to_drive") {
    if (!imageBase64) return "⚠️ 파일이 없습니다. 파일을 함께 보내주세요.";

    // 거래처 찾기
    let clientId = input.clientId as number | undefined;
    let clientName = "";
    if (!clientId && input.clientName) {
      const q = input.clientName as string;
      const clients = await prisma.client.findMany({
        where: { isDeleted: false, ...myFilter, OR: [{ name: { contains: q } }, { ceoName: { contains: q } }] },
        select: { id: true, name: true, driveFolderId: true },
        take: 5,
      });
      if (clients.length === 0) return `⚠️ "${q}" 거래처를 찾을 수 없습니다.`;
      if (clients.length > 1) {
        return `여러 거래처가 검색되었습니다:\n${clients.map(c => `- ${c.name} (ID: ${c.id})`).join("\n")}`;
      }
      clientId = clients[0].id;
      clientName = clients[0].name;
    }
    if (!clientId) return "⚠️ 거래처명을 알려주세요.";

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, driveFolderId: true } });
    if (!client) return "⚠️ 거래처를 찾을 수 없습니다.";
    if (!client.driveFolderId) return `⚠️ "${client.name}" 거래처에 구글 드라이브 폴더가 없습니다. 거래처를 새로 등록하면 자동 생성됩니다.`;
    clientName = client.name;

    const folderName = input.folderName as string;
    const fileName = (input.fileName as string) || `파일_${Date.now()}`;

    // base64 → buffer
    const match = imageBase64.match(/^data:(.*?);base64,(.+)$/);
    if (!match) return "⚠️ 파일 형식을 인식할 수 없습니다.";
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
    const fullFileName = fileName.includes(".") ? fileName : `${fileName}.${ext}`;

    try {
      const { uploadFile: driveUpload, createFolder: driveCreateFolder } = await import("@/lib/google-drive");
      const subFolderId = await driveCreateFolder(folderName, client.driveFolderId);
      const { fileUrl } = await driveUpload(subFolderId, fullFileName, buffer, mimeType);
      return `✅ **${clientName}** → **${folderName}** 폴더에 업로드 완료!\n📄 파일명: ${fullFileName}\n🔗 ${fileUrl}`;
    } catch (e: any) {
      console.error("[Chat upload_to_drive] 오류:", e);
      return `❌ 업로드 실패: ${e.message || "알 수 없는 오류"}`;
    }
  }

  if (name === "list_drive_files") {
    let clientId = input.clientId as number | undefined;
    if (!clientId && input.clientName) {
      const q = input.clientName as string;
      const c = await prisma.client.findFirst({
        where: { isDeleted: false, ...myFilter, name: { contains: q } },
        select: { id: true, name: true, driveFolderId: true },
      });
      if (!c) return `⚠️ "${q}" 거래처를 찾을 수 없습니다.`;
      clientId = c.id;
    }
    if (!clientId) return "⚠️ 거래처명을 알려주세요.";

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, driveFolderId: true } });
    if (!client?.driveFolderId) return "⚠️ 구글 드라이브 폴더가 없습니다.";

    try {
      const { listFiles: driveList, createFolder: driveCreateFolder } = await import("@/lib/google-drive");
      let folderId = client.driveFolderId;
      if (input.folderName) {
        folderId = await driveCreateFolder(input.folderName as string, client.driveFolderId);
      }
      const files = await driveList(folderId);
      if (files.length === 0) return `📁 **${client.name}**${input.folderName ? ` → ${input.folderName}` : ""}: 파일 없음`;
      return `📁 **${client.name}**${input.folderName ? ` → ${input.folderName}` : ""}\n\n${files.map(f => `- ${f.name} (${new Date(f.modifiedTime).toLocaleDateString("ko-KR")})`).join("\n")}`;
    } catch (e: any) {
      return `❌ 조회 실패: ${e.message || "알 수 없는 오류"}`;
    }
  }

  if (name === "save_idcard_to_commission") {
    if (!imageBase64) return "⚠️ 이미지가 없습니다. 신분증 이미지를 함께 보내주세요.";

    // 거래처 찾기
    let clientId = input.clientId as number | undefined;
    let clientName = "";

    if (!clientId && input.clientName) {
      const q = input.clientName as string;
      const clients = await prisma.client.findMany({
        where: {
          isDeleted: false,
          ...myFilter,
          OR: [{ name: { contains: q } }, { ceoName: { contains: q } }],
        },
        select: { id: true, name: true, ceoName: true },
        take: 5,
      });
      if (clients.length === 0) return `⚠️ "${q}" 거래처를 찾을 수 없습니다.`;
      if (clients.length > 1) {
        return `여러 거래처가 검색되었습니다. 어떤 거래처인가요?\n${clients.map(c => `- ${c.name} (대표: ${c.ceoName || "-"}, ID: ${c.id})`).join("\n")}`;
      }
      clientId = clients[0].id;
      clientName = clients[0].name;
    }

    if (!clientId) return "⚠️ 거래처명을 알려주세요.";

    // 신규수임 프로세스 확인
    const commission = await prisma.commissionProcess.findUnique({
      where: { clientId },
      include: { client: { select: { name: true, ceoName: true } } },
    });
    if (!commission) return `⚠️ 해당 거래처의 신규수임 프로세스가 없습니다. 먼저 신규수임에 등록해주세요.`;
    clientName = commission.client.name;

    // base64 → 파일 저장
    const { writeFile, mkdir } = await import("fs/promises");
    const path = await import("path");

    const match = imageBase64.match(/^data:(image\/(\w+));base64,(.+)$/);
    if (!match) return "⚠️ 이미지 형식을 인식할 수 없습니다.";
    const ext = match[2] === "jpeg" ? "jpg" : match[2];
    const base64Data = match[3];
    const buffer = Buffer.from(base64Data, "base64");

    const uploadDir = path.join(process.cwd(), "public", "uploads", "idcards");
    await mkdir(uploadDir, { recursive: true });

    // 기존 파일 삭제
    if (commission.idCardPath) {
      try {
        const { unlink } = await import("fs/promises");
        const oldPath = path.join(process.cwd(), "public", commission.idCardPath.replace("/api/uploads/", "uploads/"));
        await unlink(oldPath).catch(() => {});
      } catch {}
    }

    const filename = `${commission.id}.${ext}`;
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    // DB 업데이트
    const dbPath = `/api/uploads/idcards/${filename}`;
    await prisma.commissionProcess.update({
      where: { id: commission.id },
      data: { idCardPath: dbPath, hasIdCard: true },
    });

    // 구글 드라이브 "0. 기본정보" 폴더에도 업로드
    let driveMsg = "";
    try {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { driveFolderId: true } });
      if (client?.driveFolderId) {
        const { uploadFile: driveUpload, createFolder: driveCreateFolder } = await import("@/lib/google-drive");
        const basicFolderId = await driveCreateFolder("0. 기본정보", client.driveFolderId);
        await driveUpload(basicFolderId, `대표자신분증.${ext}`, buffer, `image/${ext === "jpg" ? "jpeg" : ext}`);
        driveMsg = "\n📁 구글 드라이브(0.기본정보)에도 저장 완료";
      }
    } catch (e) {
      console.error("[Chat idcard] 구글 드라이브 업로드 실패:", e);
    }

    return `✅ **${clientName}** 신규수임에 대표자 신분증이 등록되었습니다.${driveMsg}`;
  }

  return "알 수 없는 도구입니다.";
}

export async function POST(req: NextRequest) {
  const { message, history, _internalUserId, image } = await req.json();

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

## 이미지 처리
- **신분증 업로드**: 사용자가 이미지와 함께 "대표 신분증" 또는 "신분증"이라고 말하면, save_idcard_to_commission 도구를 호출하세요.
- **구글 드라이브 파일 업로드**: 사용자가 파일과 함께 거래처명을 말하면, 어떤 폴더에 넣을지 물어보세요 (0.기본정보 / 1.원천세 / 2.부가가치세 / 3.종합소득세 or 법인세 / 4.이관자료). 확인 후 upload_to_drive 도구를 호출하세요. 예: "인텍 부가세 자료야" → "인텍 → 2. 부가가치세 폴더에 넣을까요?" → 확인 후 업로드.
- **구글 드라이브 파일 조회**: "인텍 드라이브 파일 보여줘" → list_drive_files 호출.
- **사업자등록증**: 상호, 대표자, 사업자번호, 개업일, 주소 등을 추출하여 정리하고, "이 정보로 거래처 등록할까요?" 확인을 받으세요.
- **기타 서류**: 내용을 요약하고 필요한 조치를 안내하세요.

## 거래처 등록 (계약서/수임 텍스트)
- 사용자가 수임 계약서나 거래처 정보 텍스트를 보내면, 자동으로 파싱하여 거래처명, 대표자, 사업자번호, 기장료, 개업일, 특이사항 등을 추출하세요.
- 파싱 결과를 깔끔하게 정리해서 보여주고 "이대로 등록할까요?" 확인을 받으세요.
- **월기장료**: monthlyFee에는 반드시 VAT 제외 원본 금액(숫자만)을 전달하세요. 코드가 자동으로 x1.1 해서 VAT 포함으로 저장합니다. 예: 80000 입력 → 88,000원으로 저장됨.
- **파싱 결과 표시 시** 월기장료는 반드시 "월기장료: 88,000원 (VAT포함)" 형태로 VAT 포함 금액을 보여주세요. 사용자가 VAT 제외 금액만 보면 혼동합니다.
- **소속**: 거래처 등록 시 소속은 자동으로 "세이브택스"로 설정됩니다.
- 출금연월이 "26-06" 같은 형식이면 "2026-06"으로 변환합니다.
- **주민등록번호**: 텍스트 어디에든 "NNNNNN-NNNNNNN" 형태의 주민번호가 있으면 반드시 residentNumber에 넣으세요. 특별요청사항, 특이사항 안에 포함되어 있을 수 있습니다.
- 특별요청사항, 특이사항, 경정청구 내용 등은 특이사항 필드에 합쳐서 저장합니다 (주민번호는 제외).
- 확인 후 create_client_with_commission 도구를 호출하세요.

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

  // 이미지가 포함된 경우 멀티모달 메시지 구성
  let hasImage = false;
  if (image && typeof image === "string" && image.startsWith("data:image/")) {
    const commaIdx = image.indexOf(",");
    if (commaIdx > 0) {
      const meta = image.substring(0, commaIdx); // "data:image/jpeg;base64"
      const base64Data = image.substring(commaIdx + 1);
      const typeMatch = meta.match(/data:(image\/\w+)/);
      const mediaType = (typeMatch?.[1] || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      hasImage = true;
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          { type: "text", text: message },
        ],
      });
    } else {
      messages.push({ role: "user", content: message });
    }
  } else {
    messages.push({ role: "user", content: message });
  }

  try {
    // 이미지가 있으면 Sonnet (Vision 정확도↑), 없으면 Haiku (속도↑, 비용↓)
    const model = hasImage ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001";
    const maxTokens = hasImage ? 2048 : 1024;

    // Tool use 루프 (최대 5번)
    let response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
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
        toolBlocks.map((tb) => executeTool(tb.name, tb.input as Record<string, unknown>, session.id, image))
      );

      (toolResults.content as Array<{ type: "tool_result"; tool_use_id: string; content: string }>).forEach(
        (tr, i) => { tr.content = results[i]; }
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push(toolResults);

      response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
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
  } catch (err: any) {
    console.error("[Chat] API 오류:", err?.message || err, err?.status, JSON.stringify(err?.error || {}).slice(0, 500));
    const detail = err?.message || "알 수 없는 오류";
    return NextResponse.json({ error: "AI 응답 실패", detail }, { status: 500 });
  }
}
