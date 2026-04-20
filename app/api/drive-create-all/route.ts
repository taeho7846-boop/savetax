import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClientFolder } from "@/lib/google-drive";

// GET: 미연결 거래처 수 확인
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId");
  const where: any = { isDeleted: false, driveFolderId: null };
  if (userId) where.assignedUserId = parseInt(userId);

  const count = await prisma.client.count({ where });
  return NextResponse.json({ unlinked: count });
}

// POST: 미연결 거래처 폴더 일괄 생성 (스트리밍)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const userId = body.userId as number | undefined;

  const where: any = { isDeleted: false, driveFolderId: null };
  if (userId) where.assignedUserId = userId;

  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, clientType: true, assignedUserId: true },
  });

  if (clients.length === 0) {
    return NextResponse.json({ total: 0, created: 0, errors: [] });
  }

  // 담당자 정보 미리 조회
  const userIds = [...new Set(clients.map(c => c.assignedUserId).filter(Boolean))] as number[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let created = 0;
      const errors: string[] = [];

      for (const client of clients) {
        try {
          const managerName = userMap.get(client.assignedUserId!) || "미배정";
          const { folderId } = await createClientFolder(managerName, client.name, client.clientType);
          await prisma.client.update({ where: { id: client.id }, data: { driveFolderId: folderId } });
          created++;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "progress", current: created, total: clients.length, name: client.name })}\n\n`));
        } catch (e: any) {
          errors.push(`${client.name}: ${e.message}`);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", name: client.name, message: e.message })}\n\n`));
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", total: clients.length, created, errors })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
