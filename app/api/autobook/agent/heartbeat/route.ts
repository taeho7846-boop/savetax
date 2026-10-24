import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest, parseSchedule } from "@/lib/autobook";

// POST /api/autobook/agent/heartbeat  (Authorization: Bearer <실행기 토큰>)
// { machine?, version?, wehagoLoggedIn? } → { ok, user, schedule, serverTime }
// 직원 PC 실행기가 몇 분마다 보내는 신호. 화면의 '내 컴퓨터 실행기 연결됨' 표시에 쓰인다
export async function POST(req: NextRequest) {
  const auth = await agentFromRequest(req);
  if (!auth) return NextResponse.json({ ok: false, error: "실행기 토큰이 맞지 않습니다" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const agent = await prisma.autobookAgent.update({
    where: { id: auth.agent.id },
    data: {
      lastSeenAt: new Date(),
      ...(typeof body.machine === "string" ? { machine: body.machine.slice(0, 80) } : {}),
      ...(typeof body.version === "string" ? { version: body.version.slice(0, 30) } : {}),
      ...(typeof body.wehagoLoggedIn === "boolean" ? { wehagoLoggedIn: body.wehagoLoggedIn } : {}),
    },
  });
  return NextResponse.json({ ok: true, user: auth.user, schedule: parseSchedule(agent.schedule), serverTime: new Date().toISOString() });
}
