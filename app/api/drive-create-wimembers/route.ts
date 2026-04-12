import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      driveFolderId: { not: null },
    },
    select: { id: true, name: true, driveFolderId: true },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let created = 0;
      let failed = 0;
      const total = clients.length;

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        if (!client.driveFolderId) continue;
        try {
          send({ type: "progress", current: i + 1, total, name: client.name });
          const wimembersFolderId = await createFolder("5. 위멤버스", client.driveFolderId);
          await Promise.all([
            createFolder("근로소득", wimembersFolderId),
            createFolder("사업소득", wimembersFolderId),
            createFolder("일용직", wimembersFolderId),
          ]);
          created++;
        } catch (e: any) {
          failed++;
        }
      }

      send({ type: "done", total, created, failed });
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
