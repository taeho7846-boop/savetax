import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { access } from "fs/promises";
import { findFileByName } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ exists: false }, { status: 401 });
  }

  const { clientName, year, month, type } = await req.json();
  const userName = session.name || "미지정";
  const basePath = `G:\\공유 드라이브\\고객사 관리\\${userName}\\${clientName}\\5. 위멤버스`;

  let filePath: string;
  if (type === "salary") {
    filePath = `${basePath}\\근로소득\\${year}년 ${month}월 급여명세서_${clientName}.xlsx`;
  } else if (type === "daily") {
    filePath = `${basePath}\\일용직\\${year}년 ${month}월 일용직급여__${clientName}.xlsx`;
  } else {
    filePath = `${basePath}\\사업소득\\${year}년 ${month}월 사업소득조회_${clientName}.xlsx`;
  }

  try {
    await access(filePath);
    return NextResponse.json({ exists: true, path: filePath });
  } catch {
    // 로컬(G:)에 없으면 구글드라이브에서 파일명으로 검색
    // (운영 서버에는 G: 드라이브가 없음 — 확장이 운영 서버로 업로드한 파일은 드라이브에 있음)
    try {
      const fileName = filePath.split("\\").pop()!;
      const driveFile = await findFileByName(fileName);
      if (driveFile) return NextResponse.json({ exists: true, path: filePath, source: "drive" });
    } catch {}
    return NextResponse.json({ exists: false });
  }
}
