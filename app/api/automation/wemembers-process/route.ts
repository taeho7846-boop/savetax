import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "로그인 필요" }, { status: 401 });
  }

  const { clientName, year, month, incomeTypes } = await req.json();

  if (!clientName || !year || !month || !incomeTypes?.length) {
    return NextResponse.json({ success: false, message: "필수 항목 누락" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wemembersId: true, wemembersPw: true },
  });

  if (!settings?.wemembersId || !settings?.wemembersPw) {
    return NextResponse.json({ success: false, message: "설정에서 위멤버스 ID/PW를 먼저 입력해주세요" }, { status: 400 });
  }

  const userName = session.name || "미지정";
  const basePath = `G:\\공유 드라이브\\고객사 관리\\${userName}\\${clientName}\\5. 위멤버스`;

  // 업로드할 파일 목록 구성
  const uploads: { incomeType: "salary" | "business"; filePath: string }[] = [];

  if (incomeTypes.includes("salary")) {
    uploads.push({
      incomeType: "salary",
      filePath: `${basePath}\\근로소득\\${year}년 ${month}월 급여명세서_${clientName}.xlsx`,
    });
  }
  if (incomeTypes.includes("business")) {
    uploads.push({
      incomeType: "business",
      filePath: `${basePath}\\사업소득\\${year}년 ${month}월 사업소득조회_${clientName}.xlsx`,
    });
  }

  try {
    const { uploadToWemembers } = await import("@/lib/wemembers");

    // 첫 번째 소득 업로드
    const firstResult = await uploadToWemembers(
      settings.wemembersId,
      settings.wemembersPw,
      {
        clientName,
        month,
        year,
        incomeType: uploads[0].incomeType,
        filePath: uploads[0].filePath,
      },
    );

    if (!firstResult.success) {
      return NextResponse.json(firstResult);
    }

    // 두 번째 소득이 있으면 같은 거래처에서 바로 추가 업로드
    // TODO: 위멤버스 세션 유지해서 같은 거래처에서 추가 업로드
    if (uploads.length > 1) {
      const secondResult = await uploadToWemembers(
        settings.wemembersId,
        settings.wemembersPw,
        {
          clientName,
          month,
          year,
          incomeType: uploads[1].incomeType,
          filePath: uploads[1].filePath,
        },
      );
      if (!secondResult.success) {
        return NextResponse.json({ success: true, message: `${uploads[0].incomeType} 업로드 완료, ${uploads[1].incomeType} 실패: ${secondResult.message}` });
      }
    }

    const typeLabels = uploads.map(u => u.incomeType === "salary" ? "근로소득" : "사업소득").join(" + ");
    return NextResponse.json({ success: true, message: `위멤버스 ${clientName} ${typeLabels} 업로드 완료!` });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
