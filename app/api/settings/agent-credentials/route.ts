import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { agentHometaxId: true, agentHometaxPw: true, certName: true, certPassword: true, agentNumber: true },
  });

  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) {
    return NextResponse.json({ error: "세무대리인 홈택스 계정이 설정되지 않았습니다" }, { status: 404 });
  }

  return NextResponse.json({
    id: settings.agentHometaxId,
    pw: settings.agentHometaxPw,
    certName: settings.certName,
    certPw: settings.certPassword,
    agentNumber: settings.agentNumber,
  });
}
