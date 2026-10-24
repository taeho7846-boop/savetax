import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest, ACTIVE_STATUS, staffMonthsMap, parseSchedule } from "@/lib/autobook";

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
  // 과세기간 시작 달 ~ 처리분 달까지 급여가 있는 달 (예약마다 기간이 같으므로 가장 넓게 한 번에 조회)
  const fromYM = jobs.reduce((a, j) => (j.periodFrom.slice(0, 7) < a ? j.periodFrom.slice(0, 7) : a), "9999-12");
  const toYM = jobs.reduce((a, j) => (j.yearMonth > a ? j.yearMonth : a), "0000-01");
  const staffMonths = jobs.length ? await staffMonthsMap([...new Set(jobs.map(j => j.clientId))], fromYM, toYM) : new Map<number, string[]>();

  return NextResponse.json({
    ok: true,
    schedule: parseSchedule(auth.agent.schedule),
    jobs: jobs.map(j => {
      const s = j.client.autobookSetting;
      const months = (staffMonths.get(j.clientId) ?? []).filter(m => m >= j.periodFrom.slice(0, 7) && m <= j.yearMonth);
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
          // 직원: 거래한 달이 직원월에 있으면 있음(811), 없으면 없음(812). 직원(전체)은 보고서 머리말용
          직원월: months, 직원: months.length > 0,
          차량공제: s?.vehicleDeduct ?? false,
          의제매입: s?.deemedPurchase ?? false,
          식자재계정: s?.foodAccount ?? "146",
        },
      };
    }),
  });
}
