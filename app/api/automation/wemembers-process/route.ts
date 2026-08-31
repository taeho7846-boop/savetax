import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { findFileByName, downloadFile } from "@/lib/google-drive";
import { access, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

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

  // 업로드할 파일 목록 구성 (근로 → 사업 순서)
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
  if (incomeTypes.includes("daily")) {
    uploads.push({
      incomeType: "daily" as any,
      filePath: `${basePath}\\일용직\\${year}년 ${month}월 일용직급여__${clientName}.xlsx`,
    });
  }

  try {
    // 로컬(G:)에 파일이 없으면 구글드라이브에서 내려받아 임시 경로로 대체
    // (운영 서버에는 G:가 없음 — 확장이 운영 서버로 업로드한 엑셀은 드라이브에 있음)
    for (const u of uploads) {
      try {
        await access(u.filePath);
      } catch {
        const fileName = u.filePath.split("\\").pop()!;
        const driveFile = await findFileByName(fileName);
        if (!driveFile) {
          return NextResponse.json({ success: false, message: `파일을 찾을 수 없습니다: ${fileName}` }, { status: 404 });
        }
        const buf = await downloadFile(driveFile.id);
        const tmpDir = path.join(os.tmpdir(), "savetax-wemembers");
        await mkdir(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, fileName);
        await writeFile(tmpPath, buf);
        u.filePath = tmpPath;
      }
    }

    const { uploadMultiToWemembers } = await import("@/lib/wemembers");

    const result = await uploadMultiToWemembers(
      settings.wemembersId,
      settings.wemembersPw,
      {
        clientName,
        month,
        year,
        uploads,
      },
    );

    // 성공하면 DB에 위멤버스 완료 기록
    if (result.success) {
      const client = await prisma.client.findFirst({
        where: { name: clientName, isDeleted: false },
        select: { id: true },
      });
      if (client) {
        const yearMonth = `${year}-${month}`;
        await prisma.withholdingRecord.upsert({
          where: { clientId_yearMonth_taskType: { clientId: client.id, yearMonth, taskType: "위멤버스완료" } },
          update: { done: true },
          create: { clientId: client.id, yearMonth, taskType: "위멤버스완료", done: true },
        });
        revalidatePath("/withholding");
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
