import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEfileJob, updateEfileJob, type EfileKind } from "@/lib/efile-jobs";

// 원천세 자동신고 — 홈택스/위택스 제출 결과 수신 (크롬 확장 → 서버)
// POST { jobId, kind, receipts: [접수번호|일괄신고ID], rows?: [접수증 행 글자], raw?: 접수 화면 글자, error? }
//   파일(WithholdingFilingFile)·거래처별(WithholdingFiling) 상태를 submitted 로 바꾸고 접수번호를 남긴다.
//   사이트에서 사람이 [제출]을 확인한 작업의 결과만 받는다.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const job = getEfileJob(String(body?.jobId || ""));
  const kind = body?.kind as EfileKind;
  if (!job || job.type !== "submit" || job.userId !== session.id) return NextResponse.json({ ok: false, error: "작업 없음 (만료)" }, { status: 404 });
  const f = job.files?.[kind];
  if (!f || !job.kinds.includes(kind)) return NextResponse.json({ ok: false, error: "kind 오류" }, { status: 400 });

  if (body?.error) {
    updateEfileJob(job.id, kind, { state: "error", message: String(body.error).slice(0, 600) });
    return NextResponse.json({ ok: true });
  }
  if (!job.progress[kind]?.confirmed) return NextResponse.json({ ok: false, error: "제출 확인 전의 결과는 받을 수 없습니다" }, { status: 409 });

  const receipts: string[] = Array.isArray(body?.receipts)
    ? [...new Set((body.receipts as unknown[]).map(r => String(r).trim()).filter(Boolean))].slice(0, 500)
    : [];
  const rows: string[] = Array.isArray(body?.rows) ? (body.rows as unknown[]).map(r => String(r).slice(0, 400)).slice(0, 500) : [];
  const raw = typeof body?.raw === "string" ? body.raw.slice(0, 6000) : "";
  const now = new Date();

  const prev = await prisma.withholdingFilingFile.findUnique({ where: { id: f.fileId }, select: { resultJson: true } });
  let prevJson: Record<string, unknown> = {};
  try { prevJson = prev?.resultJson ? JSON.parse(prev.resultJson) : {}; } catch { /* 무시 */ }
  await prisma.withholdingFilingFile.update({
    where: { id: f.fileId },
    data: {
      status: "submitted",
      receiptNo: receipts.join(",").slice(0, 190) || null,
      resultJson: JSON.stringify({ ...prevJson, submittedAt: now.toISOString(), receipts, rows, raw }),
    },
  });

  // 거래처별 접수번호: 접수번호가 1개뿐이면 그 번호, 여러 개면 접수증 행에서 사업자번호(또는 상호)가 보이는 행의 번호
  const clients = await prisma.client.findMany({ where: { id: { in: f.clientIds } }, select: { id: true, name: true, bizNumber: true } });
  const receiptRe = kind === "income" ? /\d{3}-\d{4}-\d-\d{9,15}/ : /\d{17,22}/;
  for (const c of clients) {
    const biz = (c.bizNumber || "").replace(/\D/g, "");
    let receiptNo: string | null = receipts.length === 1 ? receipts[0] : null;
    if (!receiptNo) {
      const row = rows.find(r => (biz.length === 10 && r.replace(/\D/g, "").includes(biz)) || (c.name.length >= 2 && r.includes(c.name)));
      receiptNo = row?.match(receiptRe)?.[0] ?? null;
    }
    await prisma.withholdingFiling.upsert({
      where: { clientId_yearMonth_kind: { clientId: c.id, yearMonth: job.yearMonth, kind } },
      create: { clientId: c.id, yearMonth: job.yearMonth, kind, closed: true, status: "submitted", fileName: f.fileName, receiptNo, submittedAt: now },
      update: { status: "submitted", receiptNo, submittedAt: now, errorMsg: null },
    });
  }
  updateEfileJob(job.id, kind, {
    state: "done", receipts,
    message: receipts.length
      ? `제출 완료 · 접수번호 ${receipts.length === 1 ? receipts[0] : receipts.length + "건"}`
      : "제출 완료 (접수번호는 신고내역에서 확인)",
  });
  return NextResponse.json({ ok: true, submitted: clients.length });
}
