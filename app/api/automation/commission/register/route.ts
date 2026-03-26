import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId } = await req.json();

  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: { name: true, clientType: true, bizNumber: true, residentNumber: true, phone: true },
    }),
    prisma.settings.findUnique({ where: { userId: session.id } }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) {
    return NextResponse.json({ error: "설정에서 세무대리인 홈택스 ID/PW를 먼저 입력하세요" }, { status: 400 });
  }
  if (!client.bizNumber) {
    return NextResponse.json({ error: `${client.name}: 사업자등록번호가 없습니다` }, { status: 400 });
  }
  if (!client.residentNumber) {
    return NextResponse.json({ error: `${client.name}: 주민등록번호가 없습니다` }, { status: 400 });
  }
  if (!client.phone) {
    return NextResponse.json({ error: `${client.name}: 전화번호가 없습니다` }, { status: 400 });
  }

  return NextResponse.json({
    agentId: settings.agentHometaxId,
    agentPw: settings.agentHometaxPw,
    certName: settings.certName ?? "",
    certPw: settings.certPassword ?? "",
    clientType: client.clientType,
    bizNumber: client.bizNumber,
    residentNumber: client.residentNumber,
    phone: client.phone,
  });
}
