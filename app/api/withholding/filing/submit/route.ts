import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEfileJob, getEfileJob, updateEfileJob, type EfileKind, type EfileSubmitFile, type EfileVerify } from "@/lib/efile-jobs";

// 원천세 자동신고 3·4단계 — 제작된 전자신고 파일을 홈택스(원천세)·위택스(지방소득세)에 올려 검증하고 제출
//
// 흐름: 사이트 [검증·제출] → 작업 생성 → 확장이 홈택스/위택스 탭에서 파일 업로드·검증 → 결과를 사이트에 표시(state "verified")
//       → 사람이 사이트에서 [제출] 클릭(confirm) → 확장이 제출 버튼을 누르고 접수번호를 보고 (submit-result)
//       사람이 확인하기 전에는 어떤 제출 버튼도 누르지 않는다.
//
// POST  /api/withholding/filing/submit  { yearMonth, kinds? }        → 이번 달 내가 제작한 최신 파일(kind별)로 작업 생성
// GET   /api/withholding/filing/submit?id=…                          → 진행 상황 (사이트 폴링)
// GET   /api/withholding/filing/submit?id=…&kind=…&detail=1          → 확장용: 파일 내용(base64)·비밀번호·확인 여부
// GET   /api/withholding/filing/submit?id=…&kind=…&detail=1&poll=1   → 확장용: 확인 여부만 (가벼운 폴링)
// GET   /api/withholding/filing/submit?ym=YYYY-MM                    → 제출 대기 파일 요약 (버튼 표시용)
// PATCH /api/withholding/filing/submit  { jobId, kind, state, message, verify? }      ← 확장: 진행·검증 결과 보고
// PATCH /api/withholding/filing/submit  { jobId, kind, confirm: true | cancel: true } ← 사이트: 제출 확인/취소

const KIND_LABEL: Record<string, string> = { income: "원천세(홈택스)", local: "지방소득세(위택스)" };

// 이번 달·종류별로 "내가 제작한" 가장 최근 파일 (이미 제출된 파일이면 건너뜀)
async function latestFiles(userId: number, yearMonth: string, kinds: EfileKind[]) {
  const out: Record<string, EfileSubmitFile> = {};
  const skipped: { kind: string; reason: string }[] = [];
  for (const kind of kinds) {
    const file = await prisma.withholdingFilingFile.findFirst({
      where: { yearMonth, kind, createdById: userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, clientIds: true, status: true },
    });
    if (!file) { skipped.push({ kind, reason: `${KIND_LABEL[kind]} 제작된 파일 없음` }); continue; }
    if (file.status === "submitted") { skipped.push({ kind, reason: `${KIND_LABEL[kind]} 최신 파일은 이미 제출됨 (${file.fileName})` }); continue; }
    let clientIds: number[] = [];
    try { clientIds = (JSON.parse(file.clientIds) as unknown[]).map(Number).filter(n => Number.isFinite(n)); } catch { /* 빈 목록 */ }
    const clients = clientIds.length ? await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true, withholdingFilings: { where: { yearMonth, kind }, select: { amount: true, status: true } } },
    }) : [];
    const amounts = clients.map(c => c.withholdingFilings[0]?.amount).filter((a): a is number => typeof a === "number");
    out[kind] = {
      fileId: file.id, fileName: file.fileName, clientIds,
      names: clients.map(c => c.name),
      expectCount: clientIds.length,
      expectAmount: amounts.length === clients.length && clients.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null,
      alreadySubmitted: clients.filter(c => c.withholdingFilings[0]?.status === "submitted").map(c => c.name),
    };
  }
  return { files: out, skipped };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const yearMonth: string = body?.yearMonth || "";
  const kinds: EfileKind[] = Array.isArray(body?.kinds) && body.kinds.length
    ? body.kinds.filter((k: string) => k === "income" || k === "local")
    : ["income", "local"];
  if (!/^\d{4}-\d{2}$/.test(yearMonth) || kinds.length === 0) return NextResponse.json({ ok: false, error: "yearMonth 필요" }, { status: 400 });

  const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { efilePassword: true } });
  if (!settings?.efilePassword) {
    return NextResponse.json({ ok: false, error: "설정 > 위하고 계정에 전자신고 파일 비밀번호를 먼저 저장해주세요" }, { status: 400 });
  }

  const { files, skipped } = await latestFiles(session.id, yearMonth, kinds);
  const useKinds = kinds.filter(k => files[k]);
  if (useKinds.length === 0) {
    return NextResponse.json({ ok: false, error: "제출할 파일이 없습니다. 먼저 [자동신고 · 파일 제작]을 해주세요", skipped }, { status: 400 });
  }

  const job = createEfileJob({
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    userId: session.id, yearMonth, payYm: yearMonth.replace("-", ""),
    kinds: useKinds, targets: [], startedAt: Date.now(),
    type: "submit", files,
  });
  for (const k of useKinds) updateEfileJob(job.id, k, { fileId: files[k].fileId, fileName: files[k].fileName });
  return NextResponse.json({ ok: true, jobId: job.id, kinds: useKinds, files, skipped });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const sp = req.nextUrl.searchParams;

  const ym = sp.get("ym");
  if (ym) {
    if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ ok: false, error: "ym 형식" }, { status: 400 });
    const { files, skipped } = await latestFiles(session.id, ym, ["income", "local"]);
    return NextResponse.json({ ok: true, files, skipped });
  }

  const job = getEfileJob(sp.get("id") || "");
  if (!job || job.type !== "submit") return NextResponse.json({ ok: false, error: "작업을 찾을 수 없습니다 (만료)" }, { status: 404 });
  if (job.userId !== session.id) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 403 });

  if (sp.get("detail") === "1") {
    const kind = sp.get("kind") as EfileKind;
    const f = job.files?.[kind];
    if (!f) return NextResponse.json({ ok: false, error: "kind 오류" }, { status: 400 });
    const p = job.progress[kind];
    if (sp.get("poll") === "1") {
      return NextResponse.json({ ok: true, confirmed: !!p?.confirmed, cancelled: !!p?.cancelled, state: p?.state });
    }
    const file = await prisma.withholdingFilingFile.findUnique({ where: { id: f.fileId }, select: { data: true, fileName: true, createdById: true } });
    if (!file || file.createdById !== session.id) return NextResponse.json({ ok: false, error: "파일을 찾을 수 없습니다" }, { status: 404 });
    const settings = await prisma.settings.findUnique({ where: { userId: session.id }, select: { efilePassword: true } });
    return NextResponse.json({
      ok: true, jobId: job.id, kind, yearMonth: job.yearMonth,
      fileName: file.fileName, fileBase64: Buffer.from(file.data).toString("base64"),
      password: settings?.efilePassword || "",
      expectCount: f.expectCount, expectAmount: f.expectAmount, names: f.names,
      confirmed: !!p?.confirmed, cancelled: !!p?.cancelled, state: p?.state,
    });
  }
  return NextResponse.json({
    ok: true, jobId: job.id, yearMonth: job.yearMonth, kinds: job.kinds, files: job.files, progress: job.progress, done: job.done,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const job = getEfileJob(String(body?.jobId || ""));
  if (!job || job.type !== "submit" || job.userId !== session.id) return NextResponse.json({ ok: false, error: "작업 없음" }, { status: 404 });
  const kind = body?.kind as EfileKind;
  if (!job.kinds.includes(kind)) return NextResponse.json({ ok: false, error: "kind 오류" }, { status: 400 });
  const cur = job.progress[kind];

  // 사이트: 제출 확인 / 취소 — 확인은 검증이 끝난(verified) 상태에서만 받는다
  if (body?.confirm === true) {
    if (cur?.state !== "verified") return NextResponse.json({ ok: false, error: "검증이 끝난 뒤에만 제출할 수 있습니다" }, { status: 409 });
    updateEfileJob(job.id, kind, { confirmed: true, message: "제출 확인됨. 제출 진행 중…" });
    return NextResponse.json({ ok: true });
  }
  if (body?.cancel === true) {
    if (cur?.state === "done") return NextResponse.json({ ok: false, error: "이미 제출이 끝났습니다" }, { status: 409 });
    if (cur?.state === "submitting") return NextResponse.json({ ok: false, error: "제출이 이미 진행 중입니다" }, { status: 409 });
    updateEfileJob(job.id, kind, { cancelled: true, confirmed: false, state: "skip", message: "취소됨. 제출하지 않았습니다" });
    return NextResponse.json({ ok: true });
  }

  // 확장: 진행 상황·검증 결과 보고
  const state = String(body?.state || "running");
  if (!["running", "verified", "submitting", "error"].includes(state)) return NextResponse.json({ ok: false, error: "state 오류" }, { status: 400 });
  if (cur?.cancelled) return NextResponse.json({ ok: true, cancelled: true });
  // 사람이 확인하지 않았는데 제출 중으로 넘어가려는 보고는 거부 (안전장치)
  if (state === "submitting" && !cur?.confirmed) return NextResponse.json({ ok: false, error: "제출 확인 전" }, { status: 409 });

  const patch: Parameters<typeof updateEfileJob>[2] = {
    state: state as "running" | "verified" | "submitting" | "error",
    message: String(body?.message || "").slice(0, 600),
  };
  if (body?.verify && typeof body.verify === "object") {
    const v = body.verify as Record<string, unknown>;
    const num = (x: unknown) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
    const verify: EfileVerify = {
      fileName: typeof v.fileName === "string" ? v.fileName.slice(0, 100) : undefined,
      target: num(v.target), formatErr: num(v.formatErr), contentErr: num(v.contentErr), normal: num(v.normal), taxTotal: num(v.taxTotal),
      rows: Array.isArray(v.rows) ? v.rows.slice(0, 200).map(r => String(r).slice(0, 300)) : undefined,
      notes: Array.isArray(v.notes) ? v.notes.slice(0, 20).map(r => String(r).slice(0, 300)) : undefined,
    };
    patch.verify = verify;
  }
  updateEfileJob(job.id, kind, patch);

  if (state === "verified" || state === "error") {
    const f = job.files?.[kind];
    if (f) {
      await prisma.withholdingFilingFile.update({ where: { id: f.fileId }, data: { status: state === "verified" ? "verified" : "error" } }).catch(() => null);
      if (state === "verified") {
        await prisma.withholdingFiling.updateMany({
          where: { clientId: { in: f.clientIds }, yearMonth: job.yearMonth, kind, status: { in: ["produced", "error", "none"] } },
          data: { status: "verified", errorMsg: null },
        }).catch(() => null);
      }
    }
  }
  return NextResponse.json({ ok: true, confirmed: !!job.progress[kind]?.confirmed });
}
