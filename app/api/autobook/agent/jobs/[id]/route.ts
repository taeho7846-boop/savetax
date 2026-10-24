import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest, JOB_STATUS, STEPS, pushLog, type JobStatus } from "@/lib/autobook";

const STEP_KEYS = new Set<string>(STEPS.map(s => s.key));
const STEP_STATES = new Set(["ok", "run", "stop", "skip"]);

// POST /api/autobook/agent/jobs/:id  (Authorization: Bearer <실행기 토큰>)
// 실행기가 진행 상황을 보낸다. 모든 칸은 선택:
// { status?, step?, steps?: {collect:"ok",...}, summary?, message?, log?: "한 줄", alerts?: [{kind,date,trade,amount,note}] }
// 응답의 status가 canceled면 실행기는 그 거래처를 멈춘다(화면에서 취소한 경우)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await agentFromRequest(req);
  if (!auth) return NextResponse.json({ ok: false, error: "실행기 토큰이 맞지 않습니다" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.autobookJob.findUnique({ where: { id: Number(id) } });
  if (!job || job.userId !== auth.user.id) return NextResponse.json({ ok: false, error: "내 예약이 아닙니다" }, { status: 404 });
  if (job.status === "canceled") return NextResponse.json({ ok: true, status: "canceled" });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!JOB_STATUS.includes(b.status as JobStatus) || b.status === "canceled") return NextResponse.json({ ok: false, error: "status 값이 맞지 않습니다" }, { status: 400 });
    data.status = b.status;
    if (b.status === "running" && !job.startedAt) data.startedAt = new Date();
    if (b.status === "done" || b.status === "stopped") data.finishedAt = new Date();
  }
  if (b.step !== undefined) {
    if (b.step !== null && !STEP_KEYS.has(b.step)) return NextResponse.json({ ok: false, error: "step 값이 맞지 않습니다" }, { status: 400 });
    data.step = b.step;
  }
  if (b.steps && typeof b.steps === "object") {
    const merged = { ...JSON.parse(job.steps || "{}") };
    for (const [k, v] of Object.entries(b.steps)) if (STEP_KEYS.has(k) && STEP_STATES.has(String(v))) merged[k] = v;
    data.steps = JSON.stringify(merged);
  }
  if (b.summary !== undefined) data.summary = JSON.stringify(b.summary).slice(0, 20000);
  if (typeof b.message === "string") data.message = b.message.slice(0, 1000);
  if (typeof b.log === "string" && b.log.trim()) data.log = pushLog(job.log, b.log.slice(0, 500));

  const alerts = Array.isArray(b.alerts) ? b.alerts.slice(0, 50) : [];
  await prisma.$transaction([
    prisma.autobookJob.update({ where: { id: job.id }, data }),
    ...(alerts.length ? [prisma.autobookAlert.createMany({
      data: alerts.map((a: { kind?: string; date?: string; trade?: string; amount?: number; note?: string }) => ({
        jobId: job.id, clientId: job.clientId, kind: String(a.kind || "other").slice(0, 30),
        date: a.date ? String(a.date).slice(0, 10) : null, trade: a.trade ? String(a.trade).slice(0, 100) : null,
        amount: Number.isFinite(Number(a.amount)) ? Math.round(Number(a.amount)) : null, note: String(a.note || "").slice(0, 500),
      })),
    })] : []),
  ]);
  return NextResponse.json({ ok: true, status: (data.status as string) ?? job.status });
}
