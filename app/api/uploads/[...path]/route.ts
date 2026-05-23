import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  hwp: "application/x-hwp",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(process.cwd(), "public", "uploads", ...segments);

  try {
    const data = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // settings / idcards 폴더 파일은 자주 교체(재생성)되므로 캐시 안 함
    // - settings: 사용자가 업로드한 템플릿이 갱신될 수 있음
    // - idcards: 수임신청서 PDF가 거래처 정보 수정 후 재생성될 수 있음
    const isMutable = segments[0] === "settings" || segments[0] === "idcards";
    const cacheControl = isMutable
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다" }, { status: 404 });
  }
}
