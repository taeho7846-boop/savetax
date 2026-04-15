import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { driveFolderId: true },
  });

  if (!client?.driveFolderId) {
    return NextResponse.json({ error: "드라이브 폴더가 설정되지 않았습니다" }, { status: 404 });
  }

  return NextResponse.json({
    url: `https://drive.google.com/drive/folders/${client.driveFolderId}`,
  });
}
