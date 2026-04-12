import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder, uploadFile } from "@/lib/google-drive";
import { readFile } from "fs/promises";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  }

  const { clientName, year, month, filePath, fileName, fileBase64 } = await req.json();

  if (!clientName || !fileName || (!filePath && !fileBase64)) {
    return NextResponse.json({ ok: false, error: "clientName, fileName, filePath 또는 fileBase64 필요" }, { status: 400 });
  }

  // 거래처 찾기
  const client = await prisma.client.findFirst({
    where: { name: clientName, isDeleted: false },
    select: { id: true, name: true, driveFolderId: true },
  });

  if (!client) {
    return NextResponse.json({ ok: false, error: `거래처 "${clientName}"을 찾을 수 없습니다` });
  }
  if (!client.driveFolderId) {
    return NextResponse.json({ ok: false, error: `거래처 "${clientName}"의 구글드라이브 폴더가 연결되지 않았습니다` });
  }

  try {
    // 파일 읽기
    let fileBuffer: Buffer;
    if (filePath) {
      fileBuffer = await readFile(filePath);
    } else {
      fileBuffer = Buffer.from(fileBase64, "base64");
    }

    // 5. 위멤버스 > 사업소득 폴더 찾기/생성
    const wimembersFolderId = await createFolder("5. 위멤버스", client.driveFolderId);
    const businessFolderId = await createFolder("사업소득", wimembersFolderId);

    // 파일 업로드
    const result = await uploadFile(
      businessFolderId,
      fileName,
      fileBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return NextResponse.json({
      ok: true,
      message: `${fileName} 업로드 완료`,
      fileUrl: result.fileUrl,
    });
  } catch (e: any) {
    console.error("[Upload Business Income]", e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
