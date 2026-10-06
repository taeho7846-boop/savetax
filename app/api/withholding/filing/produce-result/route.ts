import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEfileJob, updateEfileJob, type EfileKind } from "@/lib/efile-jobs";

// 원천세 자동신고 — 위하고 전자신고 파일 제작 결과 수신 (크롬 확장 → 서버)
// POST { jobId, kind, fileName, fileBase64, produced: [cno], skipped: [{cno,name,reason}], error? }
//   파일을 DB(WithholdingFilingFile)에 보관하고 거래처별 WithholdingFiling.status = produced 로 갱신
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const job = getEfileJob(String(body?.jobId || ""));
  const kind = body?.kind as EfileKind;
  if (!job || job.userId !== session.id) return NextResponse.json({ ok: false, error: "작업 없음 (만료)" }, { status: 404 });
  if (!job.kinds.includes(kind)) return NextResponse.json({ ok: false, error: "kind 오류" }, { status: 400 });

  if (body?.error) {
    updateEfileJob(job.id, kind, { state: "error", message: String(body.error) });
    return NextResponse.json({ ok: true });
  }
  const fileName = String(body?.fileName || "");
  const fileBase64 = String(body?.fileBase64 || "");
  const produced: string[] = Array.isArray(body?.produced) ? body.produced.map(String) : [];
  if (!fileName || !fileBase64) {
    updateEfileJob(job.id, kind, { state: "error", message: "파일이 전달되지 않았습니다" });
    return NextResponse.json({ ok: false, error: "fileName, fileBase64 필요" }, { status: 400 });
  }

  const producedClientIds = job.targets.filter(t => produced.includes(t.cno)).map(t => t.clientId);
  const file = await prisma.withholdingFilingFile.create({
    data: {
      yearMonth: job.yearMonth, kind, fileName,
      data: Buffer.from(fileBase64, "base64"),
      clientIds: JSON.stringify(producedClientIds),
      createdById: session.id,
    },
  });
  for (const clientId of producedClientIds) {
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId, yearMonth: job.yearMonth, kind } },
      create: { clientId, yearMonth: job.yearMonth, kind, closed: true, status: "produced", fileName },
      update: { status: "produced", fileName, errorMsg: null },
    });
  }
  updateEfileJob(job.id, kind, {
    state: "done", fileId: file.id, fileName,
    produced: job.targets.filter(t => produced.includes(t.cno)).map(t => t.name),
    skipped: Array.isArray(body?.skipped) ? body.skipped.map((s: { name?: string; reason?: string }) => `${s.name || ""}: ${s.reason || ""}`) : [],
    message: `${producedClientIds.length}곳 제작 완료 (${fileName})`,
  });
  return NextResponse.json({ ok: true, fileId: file.id, produced: producedClientIds.length });
}
