import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verifyCollectToken } from "@/lib/collect-token";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type FileRef = { name: string; url: string; at: string };

// 크롬 확장이 홈택스에서 수집한 PDF를 업로드 (세션 쿠키 또는 collectToken 인증)
export async function POST(req: NextRequest) {
  const { token, clientId, docType, taxYear, fileName, dataBase64 } = await req.json();

  if (!clientId || !docType || !taxYear || !fileName || !dataBase64) {
    return NextResponse.json(
      { ok: false, error: "clientId, docType, taxYear, fileName, dataBase64 필요" },
      { status: 400 }
    );
  }

  const session = await getSession();
  if (!session && !verifyCollectToken(token, Number(clientId))) {
    return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
  }

  // 경로 조작 방지
  const safeYear = String(taxYear).replace(/[^0-9]/g, "");
  const safeName = String(fileName).replace(/[/\\:*?"<>|]/g, "_");
  if (!safeYear || !safeName) {
    return NextResponse.json({ ok: false, error: "잘못된 taxYear/fileName" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "data-collect", String(Number(clientId)), safeYear);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), Buffer.from(String(dataBase64), "base64"));

  const url = `/api/uploads/data-collect/${Number(clientId)}/${safeYear}/${safeName}`;

  // params JSON의 _files 배열에 파일 참조 병합 (같은 이름은 교체)
  const where = {
    clientId_docType_taxYear: {
      clientId: Number(clientId),
      docType: String(docType),
      taxYear: String(taxYear),
    },
  };
  const existing = await prisma.dataCollection.findUnique({ where });
  let params: Record<string, unknown> = {};
  if (existing?.params) {
    try { params = JSON.parse(existing.params); } catch {}
  }
  const files = (Array.isArray(params._files) ? params._files as FileRef[] : [])
    .filter(f => f.name !== safeName);
  files.push({ name: safeName, url, at: new Date().toISOString() });
  params._files = files;

  await prisma.dataCollection.upsert({
    where,
    create: {
      clientId: Number(clientId),
      docType: String(docType),
      taxYear: String(taxYear),
      status: "collected",
      params: JSON.stringify(params),
    },
    update: { status: "collected", params: JSON.stringify(params) },
  });

  revalidatePath("/data-collect");
  return NextResponse.json({ ok: true, url });
}
