import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  // 구글드라이브 폴더ID가 있는 거래처만 대상
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      driveFolderId: { not: null },
    },
    select: { id: true, name: true, driveFolderId: true },
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const client of clients) {
    if (!client.driveFolderId) { skipped++; continue; }
    try {
      const wimembersFolderId = await createFolder("5. 위멤버스", client.driveFolderId);
      await Promise.all([
        createFolder("근로소득", wimembersFolderId),
        createFolder("사업소득", wimembersFolderId),
        createFolder("일용직", wimembersFolderId),
      ]);
      created++;
    } catch (e: any) {
      failed++;
      errors.push(`${client.name}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    total: clients.length,
    created,
    skipped,
    failed,
    errors: errors.slice(0, 10),
  });
}
