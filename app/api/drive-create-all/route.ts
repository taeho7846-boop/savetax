import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClientFolder } from "@/lib/google-drive";

// GET: 미연결 거래처 수 확인
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await prisma.client.count({
    where: { isDeleted: false, driveFolderId: null },
  });

  return NextResponse.json({ unlinked: count });
}

// POST: 미연결 거래처 폴더 일괄 생성
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: null },
    select: { id: true, name: true, clientType: true, assignedUserId: true },
  });

  // 담당자 정보 미리 조회
  const userIds = [...new Set(clients.map(c => c.assignedUserId).filter(Boolean))] as number[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  let created = 0;
  let errors: string[] = [];

  for (const client of clients) {
    try {
      const managerName = userMap.get(client.assignedUserId!) || "미배정";
      const { folderId } = await createClientFolder(managerName, client.name, client.clientType);
      await prisma.client.update({ where: { id: client.id }, data: { driveFolderId: folderId } });
      created++;
      console.log(`[Drive 일괄생성] ${created}/${clients.length} ${client.name} 완료`);
    } catch (e: any) {
      errors.push(`${client.name}: ${e.message}`);
      console.error(`[Drive 일괄생성] ${client.name} 실패:`, e.message);
    }
  }

  return NextResponse.json({ total: clients.length, created, errors });
}
