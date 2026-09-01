import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getJob, setJob, runCollect, type CollectJob } from "@/lib/wehago-collect";

// POST — 위하고 연동 수집 시작 (로그인 사용자 관할의 미연동 거래처)
// GET  — 진행 상황 조회
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });

  // 동시 실행 방지 (30분 넘게 안 끝난 잡은 죽은 것으로 간주)
  const existing = getJob();
  if (existing && !existing.done && Date.now() - existing.startedAt < 30 * 60 * 1000) {
    return NextResponse.json({ message: "이미 다른 수집이 진행 중입니다. 잠시 후 다시 시도해주세요." }, { status: 409 });
  }

  // 위하고 계정: 본인 설정 → 없으면 소속 세무사(매니저) 설정
  let settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoPw: true },
  });
  if (!settings?.wehagoId || !settings?.wehagoPw) {
    const me = await prisma.user.findUnique({ where: { id: session.id }, select: { managerId: true } });
    if (me?.managerId) {
      settings = await prisma.settings.findUnique({
        where: { userId: me.managerId },
        select: { wehagoId: true, wehagoPw: true },
      });
    }
  }
  if (!settings?.wehagoId || !settings?.wehagoPw) {
    return NextResponse.json({ message: "설정 페이지에 위하고 ID/PW를 먼저 저장해주세요 (본인 또는 소속 세무사)" }, { status: 400 });
  }

  // 수집 대상: 관할 거래처 중 위하고 연동정보 없는 곳 (위하고 사용 거래처만)
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }
  const targets = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: "active",
      wehagoCno: null,
      bizNumber: { not: null },
      accountingProgram: { contains: "위하고" },
      OR: [
        { laborTypes: { contains: "근로소득" } },
        { laborTypes: { contains: "사업소득" } },
        { laborTypes: { contains: "일용직" } },
      ],
      AND: [assignedFilter],
    },
    select: { id: true, name: true, bizNumber: true },
    orderBy: { name: "asc" },
  });

  if (targets.length === 0) {
    return NextResponse.json({ message: "수집할 거래처가 없습니다 (모두 연동됨)" }, { status: 404 });
  }

  const job: CollectJob = {
    id: String(Date.now()),
    userId: session.id,
    startedAt: Date.now(),
    total: targets.length,
    current: 0,
    currentName: "시작 중...",
    results: [],
    done: false,
  };
  setJob(job);
  // 백그라운드 실행 (응답은 즉시)
  void runCollect(job, settings.wehagoId, settings.wehagoPw, targets as any);

  return NextResponse.json({ jobId: job.id, total: targets.length });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });
  const job = getJob();
  if (!job) return NextResponse.json({ message: "진행 중인 수집이 없습니다" }, { status: 404 });
  return NextResponse.json({
    total: job.total,
    current: job.current,
    currentName: job.currentName,
    results: job.results,
    done: job.done,
    fatal: job.fatal ?? null,
  });
}
