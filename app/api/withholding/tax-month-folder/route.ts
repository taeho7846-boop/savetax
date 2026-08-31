import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder } from "@/lib/google-drive";

// POST { clientId, yearMonth } → 거래처폴더/1. 원천세/{YYYY년 MM월} 드라이브 폴더 URL 반환 (없으면 생성)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });

  const { clientId, yearMonth } = await req.json();
  if (!clientId || !yearMonth) return NextResponse.json({ message: "필수 항목 누락" }, { status: 400 });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, driveFolderId: true },
  });
  if (!client?.driveFolderId) {
    return NextResponse.json({ message: "이 거래처는 구글드라이브 폴더가 연결되어 있지 않습니다" }, { status: 404 });
  }

  const [year, month] = (yearMonth as string).split("-");
  try {
    const taxFolderId = await createFolder("1. 원천세", client.driveFolderId);
    const monthFolderId = await createFolder(`${year}년 ${month}월`, taxFolderId);
    return NextResponse.json({ url: `https://drive.google.com/drive/folders/${monthFolderId}` });
  } catch (e: any) {
    console.error("[tax-month-folder]", e);
    return NextResponse.json({ message: e?.message || "폴더 조회 실패" }, { status: 500 });
  }
}
