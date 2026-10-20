// 상단 알림 버튼용 — 내 권한 범위 거래처의 미처리 국세청 변동 알림 + 마지막 점검 정보
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getClientScopeWhere } from "@/lib/client-scope";
import { getNtsLastCheck, NTS_MANAGER_ROLES } from "@/lib/nts-biz";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const scope = await getClientScopeWhere(session);
  const [alerts, lastCheck] = await Promise.all([
    prisma.ntsAlert.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { resolvedAt: null, client: scope as any },
      include: { client: { select: { id: true, name: true, ceoName: true, clientType: true } } },
      orderBy: { detectedAt: "desc" },
    }),
    getNtsLastCheck(),
  ]);

  return NextResponse.json({
    alerts: alerts.map(a => ({
      id: a.id,
      kind: a.kind,
      before: a.before,
      after: a.after,
      afterCode: a.afterCode,
      detail: a.detail,
      detectedAt: a.detectedAt.toISOString(),
      client: a.client,
    })),
    lastCheck,
    canCheck: NTS_MANAGER_ROLES.includes(session.role),
  });
}
