import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest, ACTIVE_STATUS, staffAutoMap, parseSchedule } from "@/lib/autobook";

// GET /api/autobook/agent/jobs  (Authorization: Bearer <실행기 토큰>)
// 이 직원이 예약한 할 일(대기·수집 끝·진행 중)과 거래처 정보·판단 설정을 돌려준다.
// 시간표(수집 가능 시간·근무시간) 판단은 실행기가 한다.
export async function GET(req: NextRequest) {
  const auth = await agentFromRequest(req);
  if (!auth) return NextResponse.json({ ok: false, error: "실행기 토큰이 맞지 않습니다" }, { status: 401 });

  const jobs = await prisma.autobookJob.findMany({
    where: { userId: auth.user.id, status: { in: ACTIVE_STATUS } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      client: {
        select: {
          id: true, name: true, wehagoCno: true, clientType: true, bizType: true, bizCategory: true, bizItem: true,
          autobookSetting: true,
        },
      },
    },
  });
  const staffAuto = await staffAutoMap([...new Set(jobs.map(j => j.clientId))], jobs[0]?.yearMonth ?? new Date().toISOString().slice(0, 7));

  return NextResponse.json({
    ok: true,
    schedule: parseSchedule(auth.agent.schedule),
    jobs: jobs.map(j => {
      const s = j.client.autobookSetting;
      const staff = !s || s.staff === "auto" ? staffAuto.get(j.clientId) ?? false : s.staff === "yes";
      return {
        id: j.id, status: j.status, mode: j.mode, yearMonth: j.yearMonth, periodFrom: j.periodFrom, steps: JSON.parse(j.steps || "{}"),
        client: {
          id: j.client.id, name: j.client.name, cno: j.client.wehagoCno, clientType: j.client.clientType,
          bizType: j.client.bizType, bizCategory: j.client.bizCategory, bizItem: j.client.bizItem,
        },
        // 계정 판단 엔진(rules.json clients 항목과 같은 모양)
        setting: {
          개인사업자: j.client.clientType !== "corporate",
          업종: s?.industry || j.client.bizItem || j.client.bizCategory || "",
          직원: staff, 직원판단: !s || s.staff === "auto" ? "인건비" : "직접",
          차량공제: s?.vehicleDeduct ?? false,
          의제매입: s?.deemedPurchase ?? false,
          식자재계정: s?.foodAccount ?? "146",
        },
      };
    }),
  });
}
