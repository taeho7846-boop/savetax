import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { isDeleted: false, status: { not: "done" } },
    select: {
      id: true,
      title: true,
      createdByUserId: true,
      assignedUserId: true,
      createdByUser: { select: { name: true } },
      assignedUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    currentUserId: session.id,
    currentUserName: session.name,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      createdBy: `${t.createdByUser?.name ?? "없음"}(${t.createdByUserId})`,
      assignedTo: `${t.assignedUser?.name ?? "없음"}(${t.assignedUserId})`,
    })),
  });
}
