"use server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

  return NextResponse.json({
    hometaxId: client.hometaxId,
    hometaxPw: client.hometaxPw,
    residentNumber: client.residentNumber ?? "",
  });
}
