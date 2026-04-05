import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {

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
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      createdBy: `${t.createdByUser?.name ?? "없음"}(${t.createdByUserId})`,
      assignedTo: `${t.assignedUser?.name ?? "없음"}(${t.assignedUserId})`,
    })),
  });
}
