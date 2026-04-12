import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const { clientName, month, year, incomeType, filePath } = await req.json();

  if (!clientName || !month || !year || !incomeType || !filePath) {
    return NextResponse.json({ error: "clientName, month, year, incomeType, filePath 필요" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wemembersId: true, wemembersPw: true },
  });

  if (!settings?.wemembersId || !settings?.wemembersPw) {
    return NextResponse.json({ error: "설정에서 위멤버스 ID/PW를 먼저 입력해주세요" }, { status: 400 });
  }

  try {
    const { uploadToWemembers } = await import("@/lib/wemembers");
    const result = await uploadToWemembers(
      settings.wemembersId,
      settings.wemembersPw,
      { clientName, month, year, incomeType, filePath },
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
