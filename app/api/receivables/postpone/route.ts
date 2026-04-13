import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, postponedUntil, note } = await req.json();
  if (!clientId || !postponedUntil) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  await prisma.unpaidPostpone.upsert({
    where: { clientId },
    update: { postponedUntil: new Date(postponedUntil), note: note || null },
    create: { clientId, postponedUntil: new Date(postponedUntil), note: note || null },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });

  await prisma.unpaidPostpone.deleteMany({ where: { clientId } });
  return NextResponse.json({ success: true });
}
