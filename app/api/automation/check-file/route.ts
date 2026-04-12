import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { access } from "fs/promises";

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
  } else {
    filePath = `${basePath}\\사업소득\\${year}년 ${month}월 사업소득조회_${clientName}.xlsx`;
  }

  try {
    await access(filePath);
    return NextResponse.json({ exists: true, path: filePath });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
