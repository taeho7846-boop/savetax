import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId } = await req.json();

  const [client, settings, commission] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: { ceoName: true, residentNumber: true },
    }),
    prisma.settings.findUnique({ where: { userId: session.id } }),
    prisma.commissionProcess.findUnique({
      where: { clientId: Number(clientId) },
      select: { id: true, idCardPath: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) {
    return NextResponse.json({ error: "설정에서 세무대리인 홈택스 ID/PW를 먼저 입력하세요" }, { status: 400 });
  }
  if (!client.residentNumber) {
    return NextResponse.json({ error: "주민등록번호가 없습니다" }, { status: 400 });
  }
  if (!client.ceoName) {
    return NextResponse.json({ error: "대표자명이 없습니다" }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const agentIdCardUrl = settings.agentIdCardPath
    ? `${origin}${settings.agentIdCardPath}`
    : "";
  const clientIdCardUrl = commission?.idCardPath
    ? `${origin}${commission.idCardPath}`
    : "";
  const pdfUrl = commission
    ? `${origin}/api/uploads/idcards/${commission.id}_수임신청서.pdf`
    : "";

  return NextResponse.json({
    agentId: settings.agentHometaxId,
    agentPw: settings.agentHometaxPw,
    certName: settings.certName ?? "",
    certPw: settings.certPassword ?? "",
    residentNumber: client.residentNumber,
    ceoName: client.ceoName,
    agentIdCardUrl,
    clientIdCardUrl,
    pdfUrl,
  });
}
