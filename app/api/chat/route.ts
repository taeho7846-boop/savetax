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
];

// 도구 실행
async function executeTool(name: string, input: Record<string, unknown>, sessionId: number) {
  if (name === "search_clients") {
    const q = input.query as string;
    const clients = await prisma.client.findMany({
      where: {
        isDeleted: false,
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
      prisma.client.count({ where: { isDeleted: false } }),
      prisma.client.count({ where: { isDeleted: false, cmsStatus: "none" } }),
      prisma.client.count({ where: { isDeleted: false, cmsStatus: "pending" } }),
    ]);
    return JSON.stringify({ 전체거래처: total, CMS미등록: cmsNone, CMS등록요청중: cmsPending });
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
3. **공지사항 안내**: 공지사항에 등록된 서식, 양식, 절차 등을 안내할 수 있습니다. 첨부파일 경로가 있으면 함께 안내하세요.

## 거래처 수정 규칙
- 수정 요청 시 반드시 먼저 해당 거래처를 검색하여 정확한 거래처를 확인하세요.
- 수정 전에 "○○ 거래처의 △△을(를) □□(으)로 변경할까요?" 라고 확인을 구하세요.
- 사용자가 "응", "네", "ㅇㅇ", "맞아" 등으로 확인하면 수정을 실행하세요.
- 여러 거래처가 검색되면 어떤 거래처인지 확인하세요.

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
