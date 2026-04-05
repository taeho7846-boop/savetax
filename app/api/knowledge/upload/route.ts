import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일 없음" }, { status: 400 });

  // 파일 저장
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const dir = join(process.cwd(), "public", "uploads", "knowledge");
  await mkdir(dir, { recursive: true });

  const ext = file.name.split(".").pop() || "bin";
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = join(dir, fileName);
  await writeFile(filePath, buffer);

  const url = `/uploads/knowledge/${fileName}`;

  return NextResponse.json({ url, name: file.name });
}
