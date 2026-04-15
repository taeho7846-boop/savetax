import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wemembersId: true, wemembersPw: true },
  });

  if (!settings?.wemembersId || !settings?.wemembersPw) {
    return NextResponse.json({ error: "위멤버스 계정이 설정되지 않았습니다" }, { status: 404 });
  }

  return NextResponse.json({ id: settings.wemembersId, pw: settings.wemembersPw });
}
