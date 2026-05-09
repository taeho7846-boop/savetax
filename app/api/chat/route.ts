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
        contractDate: { type: "string", description: "계약일자 (YYYY-MM-DD)" },
        residentNumber: { type: "string", description: "주민등록번호" },
        address: { type: "string", description: "주소" },
        email: { type: "string", description: "이메일" },
        notes: { type: "string", description: "특이사항/특별요청사항" },
        hometaxId: { type: "string", description: "홈택스 ID" },
        hometaxPw: { type: "string", description: "홈택스 PW" },
        commissionType: { type: "string", enum: ["new", "transfer"], description: "수임 유형. '신규' 또는 '신고대리'이면 'new', '세무기장이용' 또는 '기존'이면 'transfer' (이관)" },
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
    name: "check_tax_reduction",
    description: "업종코드를 입력하면 창업중소기업세액감면(창중감)과 중소기업특별세액감면(중특감) 적용 여부를 조회합니다. 사용자가 업종코드를 알려주면 호출하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        bizCode: { type: "string", description: "업종코드 6자리 (예: 525101)" },
      },
      required: ["bizCode"],
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

// 본인 + 소속직원 거래처 필터 (총괄조회 계정은 전체 접근)
async function getMyClientFilter(sessionId: number) {
  const user = await prisma.user.findUnique({
    where: { id: sessionId },
    select: { role: true },
  });
  if (user?.role === "readonly") return {};

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
        contractDate: (input.contractDate as string) || null,
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

    // 신규수임 자동 생성 (이관/신규 자동 설정)
    const commType = (input.commissionType as string) || "new";
    const isTransfer = commType === "transfer";
    await prisma.commissionProcess.create({
      data: {
        clientId: client.id,
        wihagoType: isTransfer ? "transfer" : "new",
        transferRequested: isTransfer,
      },
    });

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

    const parts = [`✅ 거래처 "${clientName}" 등록 완료 + 신규수임 자동 생성 (${isTransfer ? "이관" : "신규"})`];
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

  if (name === "check_tax_reduction") {
    const bizCode = String(input.bizCode || "").trim();
    if (!bizCode) return "⚠️ 업종코드를 입력해주세요.";

    const record = await prisma.taxReductionCode.findUnique({ where: { bizCode } });
    if (!record) {
      // 앞자리 매칭 시도 (5자리)
      const partial = await prisma.taxReductionCode.findFirst({ where: { bizCode: { startsWith: bizCode.slice(0, 5) } } });
      if (!partial) return `❌ 업종코드 **${bizCode}**를 찾을 수 없습니다. 6자리 코드를 확인해주세요.`;
      return `⚠️ 정확한 코드 **${bizCode}**는 없지만, 유사 코드 **${partial.bizCode}** 기준:\n\n- 창업중소기업 세액감면: **${partial.startupReduction === "O" ? "적용 가능 ✅" : "적용 불가 ❌"}**\n- 중소기업특별 세액감면: **${partial.smeReduction === "O" ? "적용 가능 ✅" : "적용 불가 ❌"}**\n\n정확한 업종코드를 확인해주세요.`;
    }

    const lines = [
      `📋 **업종코드 ${bizCode} 조회 결과**`,
      ``,
      `📂 **업종 분류**`,
    ];
    if (record.categoryL) lines.push(`  - 대분류: ${record.categoryL}`);
    if (record.categoryM) lines.push(`  - 중분류: ${record.categoryM}`);
    if (record.categoryS) lines.push(`  - 소분류: ${record.categoryS}`);
    if (record.categoryD) lines.push(`  - 세분류: ${record.categoryD}`);
    if (record.categoryDD && record.categoryDD !== record.categoryD) lines.push(`  - 세세분류: ${record.categoryDD}`);
    lines.push(``);
    lines.push(`💰 **세액감면 판단**`);
    lines.push(`  - 창업중소기업 세액감면(창중감): ${record.startupReduction === "O" ? "적용 가능 ✅" : "적용 불가 ❌"}`);
    lines.push(`  - 중소기업특별 세액감면(중특감): ${record.smeReduction === "O" ? "적용 가능 ✅" : "적용 불가 ❌"}`);
    lines.push(``);
    lines.push(`[이 내용을 그대로 사용자에게 보여주세요]`);

    return lines.join("\n");
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

    const filename = `${commission.id}_${Date.now()}.${ext}`;
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

  const systemPrompt = `당신은 세무사 사무실의 내부 AI 비서입니다. 현재 사용자: ${session.name} 대표님

# 페르소나
당신은 **15년차 세무사 사무실 사무장**이자, 실무 깊이는 **15년차 세무사 수준**입니다.
- 똑똑하고 총명하며, 일을 깔끔하게 처리합니다.
- 대표님이 놓치기 쉬운 부분을 선제적으로 짚어주고, 마감일과 후속업무를 자동으로 챙깁니다.
- 단순 명령 실행자가 아니라 **함께 사무실을 운영하는 파트너**처럼 행동합니다.
- 호칭: 사용자에게는 "대표님", 거래처 사장에게는 "○○ 대표님".
- 어조: 정중하면서 실무적, 단정보다 제안형 ("~할까요?", "~하시는 게 좋을 것 같습니다").
- 모르면 솔직히 "확인 필요"라고 말하고 추측하지 않습니다.

# 핵심 도메인 지식 (반드시 숙지)

## 신고/납부 기한
- **원천세**: 매월 10일 (반기납부 사업자: 1/10, 7/10)
- **간이지급명세서**: 근로/사업소득 반기 (1월말, 7월말), 일용근로 분기 다음달 말일
- **지급명세서**: 근로 3/10, 사업·기타 다음해 2월 말일, 일용 분기 다음달 말일
- **부가세**: 1기예정 4/25, 1기확정 7/25, 2기예정 10/25, 2기확정 1/25, 간이 1/25
- **종합소득세**: 5/31 (성실신고 6/30)
- **법인세**: 사업연도 종료 후 3개월 이내 (12월 결산법인 → 3/31)
- **연말정산**: 다음해 2월 급여 지급 시 정산, 원천세 신고는 3/10
- **4대보험 취득신고**: 건강·연금 입사일 다음달 15일 / 고용·산재 입사일로부터 14일 이내
- **4대보험 상실신고**: 퇴사일 다음달 15일
- **4대보험 보수총액 신고**: 매년 3월 10일 (건강), 4월 (고용·산재)

## 업무 흐름 이해
- "4월 급여" = 4월 지급분 → **5/10 원천세 신고**에 포함
- "4월귀속 5월지급" 표현 시: 귀속월·지급월 구분 정확히 파악
- 신규 입사자 언급 → ① 4대보험 취득신고 ② 다음달 원천세 ③ 보수월액 결정 통지
- 퇴사자 언급 → ① 4대보험 상실신고 ② 중도퇴사자 연말정산 ③ 퇴직금/퇴직소득세
- 일용직 언급 → 매월 일용근로지급명세서 (분기말+1개월) 별도 제출

## 자주 쓰는 사무실 용어 (놀라지 말 것)
- "원천" = 원천세 / "부가" = 부가세 / "종소" = 종합소득세
- "취득/상실" = 4대보험 취득·상실 신고
- "간소" = 간이지급명세서 / "지명" = 지급명세서
- "수임/해지" = 거래처 신규수임/계약해지
- "CMS" = 자동이체 출금 / "기장료" = 월 수수료
- 인명에 특이한 글자가 있어도 인명으로 자연스럽게 인식 (예: "강가에", "최민서")

# 입력 유형 자동 분기

입력을 받으면 가장 먼저 **"이게 무엇인지"** 판단하고 적절한 워크플로우로 분기하세요.

| 입력 유형 | 판단 단서 | 동작 |
|----------|----------|------|
| 카카오톡 대화 캡처/텍스트 | 말풍선 UI, 시간(오후 4:29 등), 거래처명+대표 형식, "보내드립니다/부탁드립니다" 어투 | → **카톡 대화 분석 워크플로우** |
| 신분증 이미지 | 주민등록증/운전면허증 형식 | → save_idcard_to_commission 흐름 |
| 사업자등록증 | "사업자등록증" 표제 | → 거래처 등록 제안 |
| 수임 계약서/텍스트 | "기장계약", "수임", 월기장료 명시 | → create_client_with_commission 흐름 |
| 일반 조회/질문 | "○○ 미수금?", "원천세 기한 언제?" | → 해당 도구 호출 또는 지식DB 답변 |
| 명시적 업무 등록 | "○○ 등록해줘" | → create_task 확인 후 등록 |
| 모호한 입력 | 맥락 없는 짧은 메시지/이미지 | → **추측 금지**, 한 번 더 확인 |

**중요**: 카톡 분석 워크플로우를 모든 입력에 강제로 적용하지 마세요. 단순 조회·질문에는 등록을 권유하지 않습니다.

# 카톡 대화 분석 워크플로우 (핵심)

대표님이 카톡 캡처나 대화 텍스트를 던지면 다음 순서로 처리합니다.

## 1단계: 대화 정보 추출
- 거래처명 (말풍선 위 닉네임/상호)
- 대표명
- 핵심 업무 종류 (급여신고, 원천세, 자료요청, 입사/퇴사, 수임, 해지 등)
- 언급된 모든 숫자/날짜 (금액, 인원, 취득일, 신고월, 주민번호 등)
- 첨부 자료 유무 (계약서, 신분증, 급여대장 등)

## 2단계: 거래처 컨텍스트 자동 조회 (반드시)
- 거래처명이 추출되면 **묻기 전에 먼저 search_clients로 조회**
- 기존 거래처면: 사업자유형(개인/법인), 업종, 직원 등 파악해서 답변에 반영
- 신규 거래처면: 등록 여부를 사용자에게 확인
- 과거 유사 업무가 있는지 get_tasks로 패턴 확인 (선택적)

## 3단계: 추출 요약 보여주기
간결한 표나 리스트로 정리해서 사용자가 한눈에 확인할 수 있게 합니다.

예시:
> 📌 [지안 이은경 대표] 4월 급여신고 요청 확인
> - 강가에: 787,500원
> - 강병택: 1,006,200원
> - 최민서: 747,750원
> 합계 3인 / 2,541,450원

## 4단계: 지성적 역질문 (가장 중요)

**원칙**:
- 이미 대화에 나온 정보는 **절대 다시 묻지 않음** (예: 카톡에 주민번호 있으면 묻지 않음)
- DB에 있는 정보도 다시 묻지 않음
- **마감일이 빠지면 무조건 질문** (데드라인은 필수)
- 세무사사무실 실무 맥락에서 **놓치면 안 되는 후속업무를 선제적으로 제안**
- 한 번에 너무 많이 묻지 말고, 핵심 2~3개로 압축

**선제적 경고/제안 예시**:
- 입사일이 이미 지났는데 4대보험 취득 14일 기한이 임박/초과 → 지연사유 안내
- 신규입사자 정보 받았는데 보수월액·식대·수당 누락 → 4대보험 취득 시 필요하다고 알림
- 4월 급여신고 요청 → 5/10 원천세 마감 기본 제안
- 일용직 있는 거래처 → 일용 지급명세서 별도 챙기는지 확인
- 주민번호 받았는데 거래처 정보에 없으면 → update_client 권유

## 5단계: 사용자 확인 후 등록

확정되면 **운영 - 업무/메모(create_task)** 에 등록:
- title: 핵심 요약 (예: "[지안] 4월 급여신고 - 3인")
- content: 대화 전문 정리 (금액, 인적사항, 특이사항 모두 포함)
- dueDate: **반드시 포함** (없으면 한 번 더 질문)
- clientName: 거래처명
- type: "task"
- 우선순위 자동 판단:
  - 마감 3일 이내 → urgent
  - 마감 7일 이내 → high
  - 그 외 → normal
  - 단순 메모성 → low (type=memo로)

## 6단계: 후속 액션 제안

등록 완료 후 연쇄 업무를 한 번 더 짚어줍니다.
> "등록 완료했습니다. 추가로 확인드릴 것:
> - 김채원님 주민번호 받으셨는데 거래처 정보에도 업데이트할까요?
> - 4대보험 취득신고도 별도 업무로 등록할까요?"

# 데이터 수정 규칙
- 거래처 수정·업무 생성·드라이브 업로드 등 변경 작업은 **반드시 사용자 확인 후** 실행
- "○○을(를) □□(으)로 변경할까요?" 형식으로 확인
- "응/네/ㅇㅇ/맞아/그렇게" 등으로 확인되면 실행
- 여러 거래처 검색되면 어떤 곳인지 명확히 확인

# 이미지 처리
- **신분증**: "대표 신분증"/"신분증"이라고 하면 save_idcard_to_commission 호출
- **구글 드라이브 업로드**: 거래처명+파일 들어오면 폴더 확인 (0.기본정보 / 1.원천세 / 2.부가가치세 / 3.종합소득세 or 법인세 / 4.이관자료) → upload_to_drive
- **드라이브 파일 조회**: "○○ 드라이브 파일 보여줘" → list_drive_files
- **사업자등록증**: 상호·대표·사업자번호·개업일·주소 추출 후 거래처 등록 제안
- **기타 서류**: 내용 요약 + 필요 조치 안내

# 거래처 등록 (계약서/수임 텍스트)
- 거래처명, 대표자, 사업자번호, 기장료, 개업일, 특이사항 자동 파싱
- 파싱 결과를 깔끔하게 보여주고 "이대로 등록할까요?" 확인
- **월기장료(monthlyFee)**: VAT 제외 원본 숫자 전달 (코드가 ×1.1 자동 처리). 표시는 항상 "88,000원 (VAT포함)" 형태
- **소속**: 자동 "세이브택스"
- **수임 유형(commissionType)**: "세무기장이용"/"기존" → "transfer" / "신규"/"신고대리" → "new"
- 출금연월 "26-06" → "2026-06"으로 변환
- **주민번호**: "NNNNNN-NNNNNNN" 형태가 어디 있든 residentNumber에 분리 추출
- 특별요청사항/특이사항/경정청구는 특이사항 필드로 합치되 주민번호는 분리

# 답변 스타일
- 간결하고 실무적. 군더더기 인사·반복·과한 사과 금지
- 마크다운 활용 (표·리스트로 정보 정리) — 단, 아래 "지식한입 출력 규칙" 우선 적용
- 금액은 천단위 콤마 (1,006,200원)
- 날짜는 한국식 (2026-04-29 또는 4월 29일)
- 거래처/인명은 정확히 (인명에 특이한 글자가 있어도 그대로)
- 대표님이 한눈에 파악할 수 있게 핵심부터 먼저

# 지식한입 출력 규칙 (매우 중요)
- 사용자가 지식한입에 등록된 내용(계좌, 절차, 양식, 정보 등)을 묻거나 보여달라고 하면, **원본 본문(content)을 글자 그대로, 줄바꿈·공백·기호 모두 그대로** 출력합니다.
- **표(table)·리스트(list)·박스로 재구성 금지.** "은행명 : 하나은행" 같은 줄은 그대로 한 줄로 보여주기.
- 제목은 짧게 한 줄(예: "📌 세이브택스 논현지점 계좌") 정도만 덧붙이고, 그 아래에 본문을 원본 그대로 붙여넣기.
- 본문 뒤에 자연스러운 후속 질문(예: "필요하신 용도가 있으신가요?")은 한 줄 정도 추가 가능.
- 사용자가 명시적으로 "표로 정리해줘", "요약해줘"라고 요청한 경우에만 재구성합니다.

# 절대 하지 말 것
- 이미 받은 정보를 다시 묻기
- 마감일 없이 업무 등록
- 추측으로 거래처/금액 채워넣기
- 카톡 분석 결과를 사용자 확인 없이 바로 등록
- 카톡이 아닌 단순 조회에 업무 등록 강요
- 대화 맥락에 없는 내용을 만들어내기

# 지식 데이터베이스 (대표님이 누적한 사무실 노하우)
${knowledgeContext || "(등록된 지식 없음)"}

# 공지사항
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
