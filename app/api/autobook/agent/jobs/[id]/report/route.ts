import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest, pushLog, REPORT_FOLDER } from "@/lib/autobook";
import { createFolder, uploadFile, listFiles, deleteFile } from "@/lib/google-drive";

// POST /api/autobook/agent/jobs/:id/report  (Authorization: Bearer <실행기 토큰>)
// { fileName: "거래처_기장보고서_2026-10-24.pdf", fileBase64 } → 거래처 드라이브 'AI자동기장/2026'에 저장(같은 이름은 덮어씀)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await agentFromRequest(req);
  if (!auth) return NextResponse.json({ ok: false, error: "실행기 토큰이 맞지 않습니다" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.autobookJob.findUnique({ where: { id: Number(id) }, include: { client: { select: { name: true, driveFolderId: true } } } });
  if (!job || job.userId !== auth.user.id) return NextResponse.json({ ok: false, error: "내 예약이 아닙니다" }, { status: 404 });

  const { fileName, fileBase64 } = await req.json().catch(() => ({}));
  if (!fileName || !fileBase64 || !/\.pdf$/i.test(String(fileName))) return NextResponse.json({ ok: false, error: "fileName(.pdf), fileBase64 필요" }, { status: 400 });
  if (!job.client.driveFolderId) return NextResponse.json({ ok: false, error: `${job.client.name} 구글드라이브 폴더가 연결되지 않았습니다` });

  const name = String(fileName).replace(/[\\/]/g, "_").slice(0, 150);
  const folder = await createFolder(job.yearMonth.slice(0, 4), await createFolder(REPORT_FOLDER, job.client.driveFolderId));
  for (const f of await listFiles(folder)) if (f.name === name) await deleteFile(f.id);
  const up = await uploadFile(folder, name, Buffer.from(fileBase64, "base64"), "application/pdf");

  await prisma.autobookJob.update({
    where: { id: job.id },
    data: { reportFileId: up.fileId, reportLink: up.fileUrl, reportName: name, log: pushLog(job.log, `보고서 저장: ${name}`) },
  });
  return NextResponse.json({ ok: true, fileId: up.fileId, link: up.fileUrl });
}
