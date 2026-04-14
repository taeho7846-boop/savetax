import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAlimtalk } from "@/lib/solapi";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, type, variables } = await req.json();

  // 로그인된 세무사의 설정에서 템플릿 ID 조회
  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { alimtalkHappyCallIndiv: true, alimtalkHappyCallCorp: true, alimtalkDocRemind: true, alimtalkFeeRemind: true },
  });

  // 거래처 정보 조회 (clientType 포함)
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, phone: true, ceoName: true, monthlyFee: true, clientType: true },
  });

  if (!client) return NextResponse.json({ error: "거래처를 찾을 수 없습니다" }, { status: 404 });
  if (!client.phone) return NextResponse.json({ error: "거래처 전화번호가 없습니다" }, { status: 400 });

  // 해피콜은 개인/법인 구분
  let templateId: string | null | undefined;
  if (type === "happy_call") {
    templateId = client.clientType === "corporate"
      ? settings?.alimtalkHappyCallCorp
      : settings?.alimtalkHappyCallIndiv;
  } else if (type === "doc_remind") {
    templateId = settings?.alimtalkDocRemind;
  } else if (type === "fee_remind") {
    templateId = settings?.alimtalkFeeRemind;
  }

  if (!templateId) {
    return NextResponse.json({ error: "설정에서 알림톡 템플릿 ID를 먼저 등록해주세요" }, { status: 400 });
  }

  try {
    const result = await sendAlimtalk({
      to: client.phone,
      templateId,
      variables: {
        "#{거래처명}": client.name,
        "#{대표자명}": client.ceoName || "",
        "#{기장료}": client.monthlyFee ? client.monthlyFee.toLocaleString() : "",
        ...variables,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    console.error("알림톡 발송 실패:", e);
    return NextResponse.json({ error: e.message || "발송 실패" }, { status: 500 });
  }
}
