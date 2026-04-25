import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { driveBasePath: true },
  });
  return NextResponse.json({ driveBasePath: settings?.driveBasePath ?? null });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const path = typeof body?.driveBasePath === "string" ? body.driveBasePath.trim() : null;
  await prisma.settings.upsert({
    where: { userId: session.id },
    update: { driveBasePath: path || null },
    create: { userId: session.id, driveBasePath: path || null },
  });
  return NextResponse.json({ ok: true, driveBasePath: path || null });
}
