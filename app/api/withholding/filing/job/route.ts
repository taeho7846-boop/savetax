import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEfileJob, getEfileJob, updateEfileJob, type EfileKind } from "@/lib/efile-jobs";

// 원천세 자동신고 — 파일 제작 작업(job)
//
// POST /api/withholding/filing/job   { yearMonth: "2026-09", clientIds: number[], kinds?: ["income","local"] }
//   → 체크한 거래처 중 위하고 연동·해당 종류 마감된 거래처로 job 생성. 응답: { ok, jobId, targets, skipped, kinds, params }
// GET  /api/withholding/filing/job?id=…            → 진행 상황 (원천세 탭 폴링)
// GET  /api/withholding/filing/job?id=…&detail=1   → 확장용: 대상 cno 목록 + 파일 비밀번호
// PATCH /api/withholding/filing/job { jobId, kind, state, message }  → 확장이 진행 상태 보고

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const yearMonth: string = body?.yearMonth || "";
  const clientIds: number[] = Array.isArray(body?.clientIds) ? body.clientIds.map(Number) : [];
  const kinds: EfileKind[] = Array.isArray(body?.kinds) && body.kinds.length ? body.kinds : ["income", "local"];
  if (!/^\d{4}-\d{2}$/.test(yearMonth) || clientIds.length === 0) {
    return NextResponse.json({ ok: false, error: "yearMonth, clientIds 필요" }, { status: 400 });
  }

  const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { efilePassword: true, wehagoId: true } });
  if (!settings?.efilePassword) {
    return NextResponse.json({ ok: false, error: "설정 > 위하고 계정에 '전자신고 파일 비밀번호'를 먼저 저장해주세요" }, { status: 400 });
  }

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, isDeleted: false },
    select: {
      id: true, name: true, wehagoCno: true, wehagoCdCom: true,
      withholdingFilings: { where: { yearMonth }, select: { kind: true, closed: true, reportType: true, status: true } },
    },
  });
  const targets: { clientId: number; name: string; cno: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const c of clients) {
    if (!c.wehagoCno) { skipped.push({ name: c.name, reason: "위하고 미연동" }); continue; }
    const fi = c.withholdingFilings.find(f => f.kind === "income");
    if (!fi?.closed) { skipped.push({ name: c.name, reason: "원천세 미마감 (마감상태 조회 후 다시)" }); continue; }
    if (fi.reportType === "반기") { skipped.push({ name: c.name, reason: "반기 업체 (이번 달 신고 대상 아님)" }); continue; }
    targets.push({ clientId: c.id, name: c.name, cno: c.wehagoCno });
  }
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "제작할 거래처가 없습니다", skipped }, { status: 400 });
  }

  const job = createEfileJob({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    userId: session.id,
    yearMonth,
    payYm: yearMonth.replace("-", ""),
    kinds,
    targets,
    startedAt: Date.now(),
  });
  return NextResponse.json({ ok: true, jobId: job.id, targets, skipped, kinds });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const job = getEfileJob(id);
  if (!job) return NextResponse.json({ ok: false, error: "작업을 찾을 수 없습니다 (만료)" }, { status: 404 });
  if (job.userId !== session.id) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 403 });

  if (req.nextUrl.searchParams.get("detail") === "1") {
    const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { efilePassword: true } });
    return NextResponse.json({
      ok: true, jobId: job.id, yearMonth: job.yearMonth, payYm: job.payYm, kinds: job.kinds,
      targets: job.targets, password: settings?.efilePassword || "",
    });
  }
  return NextResponse.json({ ok: true, jobId: job.id, yearMonth: job.yearMonth, kinds: job.kinds, targets: job.targets, progress: job.progress, done: job.done });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const job = getEfileJob(String(body?.jobId || ""));
  if (!job || job.userId !== session.id) return NextResponse.json({ ok: false, error: "작업 없음" }, { status: 404 });
  const kind = body?.kind as EfileKind;
  if (!job.kinds.includes(kind)) return NextResponse.json({ ok: false, error: "kind 오류" }, { status: 400 });
  updateEfileJob(job.id, kind, { state: body?.state || "running", message: body?.message || "" });
  return NextResponse.json({ ok: true });
}
