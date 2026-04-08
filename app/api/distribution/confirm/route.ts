import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const now = new Date();

  if (body.ids) {
    await prisma.distribution.updateMany({
      where: { id: { in: body.ids }, assignedUserId: session.id },
      data: { confirmedAt: now },
    });
  } else if (body.id) {
    await prisma.distribution.updateMany({
      where: { id: body.id, assignedUserId: session.id },
      data: { confirmedAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}
