"use server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { mintCollectToken } from "@/lib/collect-token";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId } = await req.json();

  const client = await prisma.client.findUnique({
    where: { id: Number(clientId) },
    select: {
      name: true,
      hometaxId: true,
      hometaxPw: true,
      residentNumber: true,
      bizNumber: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!client.hometaxId || !client.hometaxPw) {
    return NextResponse.json(
      { error: `${client.name}: 홈택스 ID/PW가 등록되지 않았습니다` },
      { status: 400 }
    );
  }

  // 사용자 설정에서 인증서/관리번호 정보 가져오기
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { certName: true, certPassword: true, agentNumber: true },
  });

  return NextResponse.json({
    hometaxId: client.hometaxId,
    hometaxPw: client.hometaxPw,
    residentNumber: client.residentNumber ?? "",
    bizNumber: client.bizNumber ?? "",
    certName: settings?.certName ?? "",
    certPw: settings?.certPassword ?? "",
    agentNumber: settings?.agentNumber ?? "",
    // 크롬 확장이 수집 결과(파일 업로드/상태 갱신)를 보고할 때 쓰는 단기 토큰
    collectToken: mintCollectToken(Number(clientId)),
  });
}
