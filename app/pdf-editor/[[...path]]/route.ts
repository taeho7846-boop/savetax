import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

// PDF 편집기 정적 파일 서빙 — 로그인 필수 (도장 이미지 등 포함이라 public/ 대신 여기서 보호)
// 앱 본체는 프로젝트 루트 /pdf-editor-app 에 있음. PDF 처리는 100% 브라우저 안에서만 수행됨.
const ROOT = path.join(process.cwd(), "pdf-editor-app");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".gz": "application/octet-stream", // tesseract가 직접 gunzip → Content-Encoding 설정 금지
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { path: segs } = await params;
  // /pdf-editor 로 들어오면 index.html로 (상대경로가 /pdf-editor/ 기준으로 풀리도록 리다이렉트)
  if (!segs || segs.length === 0) {
    return NextResponse.redirect(new URL("/pdf-editor/index.html", req.url));
  }

  const file = path.normalize(path.join(ROOT, ...segs));
  if (!file.startsWith(ROOT)) return new NextResponse("forbidden", { status: 403 });

  try {
    const buf = await fs.readFile(file);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
