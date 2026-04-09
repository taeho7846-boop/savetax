import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { clientId } = await req.json();
  if (!clientId) return new Response(JSON.stringify({ error: "clientId 필요" }), { status: 400 });

  // 설정에서 위하고 계정 가져오기
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoPw: true },
  });

  if (!settings?.wehagoId || !settings?.wehagoPw) {
    return new Response(JSON.stringify({ error: "설정에서 위하고 ID/PW를 먼저 입력해주세요" }), { status: 400 });
  }

  // 거래처 정보 가져오기
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, clientType: true, ceoName: true, bizNumber: true, residentNumber: true, openDate: true },
  });

  if (!client) return new Response(JSON.stringify({ error: "거래처를 찾을 수 없습니다" }), { status: 404 });
  if (!client.bizNumber) return new Response(JSON.stringify({ error: "사업자등록번호가 없습니다." }), { status: 400 });
  if (!client.ceoName) return new Response(JSON.stringify({ error: "대표자명이 없습니다." }), { status: 400 });
  if (!client.openDate) return new Response(JSON.stringify({ error: "개업년월일이 없습니다." }), { status: 400 });

  // SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const { createWehagoClient } = await import("@/lib/wehago");
        const result = await createWehagoClient(
          settings!.wehagoId!,
          settings!.wehagoPw!,
          {
            name: client!.name,
            clientType: client!.clientType,
            ceoName: client!.ceoName!,
            bizNumber: client!.bizNumber!,
            residentNumber: client!.residentNumber || undefined,
            openDate: client!.openDate || undefined,
          },
          (step: string) => {
            sendEvent({ type: "progress", step });
          },
        );

        sendEvent({ type: "done", ...result });
      } catch (error: any) {
        console.error("[Wehago] 자동화 오류:", error);
        sendEvent({ type: "done", success: false, message: `오류: ${error.message}` });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
