import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history } = await req.json();
  if (!message) return NextResponse.json({ error: "메시지가 필요합니다" }, { status: 400 });

  // 지식한입 DB에서 관련 지식 검색
  const knowledges = await prisma.knowledge.findMany({
    select: { category: true, title: true, content: true, tags: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const knowledgeContext = knowledges
    .map((k) => `[${k.category}] ${k.title}\n${k.content}${k.tags ? `\n태그: ${k.tags}` : ""}`)
    .join("\n\n---\n\n");

  // 공지사항도 가져오기
  const notices = await prisma.notice.findMany({
    select: { category: true, subCategory: true, title: true, content: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const noticeContext = notices
    .map((n) => `[${n.category}/${n.subCategory ?? ""}] ${n.title}\n${n.content}`)
    .join("\n\n---\n\n");

  const systemPrompt = `당신은 세무사 사무실의 내부 AI 어시스턴트입니다.
직원들의 세무/회계 관련 질문에 답변합니다.

**중요 규칙:**
- 반드시 아래 지식 데이터베이스와 공지사항에 등록된 내용만을 기반으로 답변하세요.
- 데이터베이스에 없는 내용은 절대 답변하지 마세요.
- 데이터베이스에 없는 질문에는 "등록된 지식에서 찾을 수 없습니다. 지식한입에 등록해주세요." 라고만 답변하세요.
- 데이터베이스에 부분적으로 관련된 내용이 있으면 그 내용만 답변하고, 나머지는 "추가 내용은 지식한입에 등록해주세요."라고 안내하세요.

답변은 간결하고 실무적으로 해주세요. 마크다운 형식으로 답변하세요.

## 지식 데이터베이스
${knowledgeContext || "(등록된 지식 없음)"}

## 공지사항
${noticeContext || "(등록된 공지 없음)"}`;

  // 대화 히스토리 구성
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: message });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("[Chat] API 오류:", err);
    return NextResponse.json({ error: "AI 응답 실패" }, { status: 500 });
  }
}
