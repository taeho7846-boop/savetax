import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const clients = await prisma.client.findMany({
    where: { isDeleted: true, assignedUserId: session.id },
    select: { id: true, name: true, ceoName: true, bizNumber: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(clients);
}
