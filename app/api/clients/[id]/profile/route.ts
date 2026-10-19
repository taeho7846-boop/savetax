import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientProfile } from "@/lib/client-profile";
import { kstToday } from "@/lib/bookkeeping";

/**
 * GET /api/clients/[id]/profile — 거래처 프로필 모달 데이터 (요약·경고·타일·이력·월별 매출매입)
 * 집계 로직은 lib/client-profile.getClientProfile. 권한 범위(담당 사수/부사수·소속)를 벗어나면 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const profile = await getClientProfile(session, clientId, kstToday());
  if (!profile) return NextResponse.json({ error: "거래처를 찾을 수 없거나 권한 범위 밖입니다" }, { status: 404 });

  return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
}
