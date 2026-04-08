import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "clientId 필요" }, { status: 400 });

  // 설정에서 위하고 계정 가져오기
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoPw: true },
  });

  if (!settings?.wehagoId || !settings?.wehagoPw) {
    return NextResponse.json({ error: "설정에서 위하고 ID/PW를 먼저 입력해주세요" }, { status: 400 });
  }

  // 거래처 정보 가져오기
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, clientType: true, ceoName: true, bizNumber: true, residentNumber: true, openDate: true },
  });

  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없습니다" }, { status: 404 });
  if (!client.bizNumber) return NextResponse.json({ error: "사업자등록번호가 없습니다. 고객사 정보를 먼저 입력해주세요." }, { status: 400 });
  if (!client.ceoName) return NextResponse.json({ error: "대표자명이 없습니다. 고객사 정보를 먼저 입력해주세요." }, { status: 400 });
  if (!client.openDate) return NextResponse.json({ error: "개업년월일이 없습니다. 고객사 정보를 먼저 입력해주세요." }, { status: 400 });

  try {
    const { createWehagoClient } = await import("@/lib/wehago");
    const result = await createWehagoClient(settings.wehagoId, settings.wehagoPw, {
      name: client.name,
      clientType: client.clientType,
      ceoName: client.ceoName,
      bizNumber: client.bizNumber,
      residentNumber: client.residentNumber || undefined,
      openDate: client.openDate || undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Wehago] 자동화 오류:", error);
    return NextResponse.json({ success: false, message: `오류: ${error.message}` }, { status: 500 });
  }
}
