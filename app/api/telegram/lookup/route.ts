import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { telegramId } = await req.json();
  if (!telegramId) return NextResponse.json({ userId: null });

  const tgUser = await prisma.telegramUser.findUnique({
    where: { telegramId: String(telegramId) },
    select: { userId: true },
  });

  return NextResponse.json({ userId: tgUser?.userId ?? null });
}
