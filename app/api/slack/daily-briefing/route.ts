import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackDM } from "@/lib/slack";

const CRON_SECRET = process.env.CRON_SECRET || "";

function getKSTNow() {
  const now = new Date();
  // KST = UTC + 9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    dateStr: kst.toISOString().slice(0, 10),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    timeStr: `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function getTomorrowStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + 1);
  return kst.toISOString().slice(0, 10);
}

// 시간 매칭: ±15분 이내
function isTimeMatch(userTime: string, currentHour: number, currentMinute: number) {
  const [h, m] = userTime.split(":").map(Number);
  const userMinutes = h * 60 + m;
  const currentMinutes = currentHour * 60 + currentMinute;
  const diff = Math.abs(userMinutes - currentMinutes);
  return diff <= 15;
}

export async function POST(req: NextRequest) {
  const { secret, type } = await req.json().catch(() => ({ secret: "", type: "" }));
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kst = getKSTNow();

  // 슬랙 연동된 사용자 + 설정 조회
  const slackUsers = await prisma.slackUser.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          settings: {
            select: {
              slackMorningEnabled: true,
              slackMorningTime: true,
              slackEveningEnabled: true,
              slackEveningTime: true,
            },
          },
        },
      },
    },
  });

  if (slackUsers.length === 0) {
    return NextResponse.json({ message: "연동된 슬랙 사용자 없음", sent: 0 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const su of slackUsers) {
    try {
      const userId = su.user.id;
      const userName = su.user.name;
      const s = su.user.settings;
      const morningTime = s?.slackMorningTime ?? "08:00";
      const eveningTime = s?.slackEveningTime ?? "19:00";
      const morningEnabled = s?.slackMorningEnabled ?? true;
      const eveningEnabled = s?.slackEveningEnabled ?? true;

      // type이 지정되면 해당 타입만, 아니면 시간 기반 자동 판단
      const sendMorning = type === "morning" || (!type && morningEnabled && isTimeMatch(morningTime, kst.hour, kst.minute));
      const sendEvening = type === "evening" || (!type && eveningEnabled && isTimeMatch(eveningTime, kst.hour, kst.minute));

      if (sendMorning && morningEnabled) {
        const todayStr = kst.dateStr;
        const today = new Date(todayStr + "T00:00:00+09:00");
        const todayTs = today.getTime();
        const dayMs = 86400000;
        function daysDiff(from: Date) {
          const d = new Date(from);
          d.setHours(0, 0, 0, 0);
          return Math.floor((todayTs - d.getTime()) / dayMs);
        }
        function isPostponed(cp: any) {
          if (!cp.postponedUntil) return false;
          const until = new Date(cp.postponedUntil);
          until.setHours(0, 0, 0, 0);
          return until.getTime() > todayTs;
        }

        // 1. 오늘의 스케줄
        const schedules = await prisma.schedule.findMany({
          where: {
            userId,
            OR: [
              { endDate: null, date: todayStr },
              { date: { lte: todayStr }, endDate: { gte: todayStr } },
            ],
          },
          orderBy: { startTime: "asc" },
        });

        // 2. 오늘의 업무 (수임 프로세스 기반)
        const commissions = await prisma.commissionProcess.findMany({
          where: {
            completedAt: null,
            client: { isDeleted: false, assignedUserId: userId },
          },
          include: {
            client: { select: { name: true } },
            happyCalls: { orderBy: { calledAt: "desc" } },
          },
        });

        const todayTasks: { type: string; clientName: string; label: string }[] = [];

        for (const cp of commissions) {
          const clientName = cp.client.name;
          const noAnswerCalls = cp.happyCalls.filter((h: any) => h.result === "no_answer");
          const connected = cp.happyCalls.find((h: any) => h.result === "connected");

          // 이관자료 대기
          if (cp.transferRequested && !cp.transferReceivedAt) {
            const daysEl = daysDiff(new Date(cp.createdAt));
            if (daysEl >= 3 && !isPostponed(cp)) {
              const daysSinceReq = cp.lastTransferRequestAt ? daysDiff(new Date(cp.lastTransferRequestAt)) : null;
              if (daysSinceReq === null || daysSinceReq >= 1) {
                todayTasks.push({ type: "이관자료", clientName, label: `이관자료 요청 (D+${daysEl})` });
              }
            }
          }

          // 자료수집 단계
          if (connected && !(cp.hasIdCard && cp.hasHometaxCredentials)) {
            const dfc = daysDiff(new Date(cp.connectedAt!));
            const daysSinceReq = cp.lastDataRequestAt ? daysDiff(new Date(cp.lastDataRequestAt)) : null;
            if (!isPostponed(cp)) {
              if (cp.dataRequestCount === 0 && dfc >= 2) {
                todayTasks.push({ type: "자료수집", clientName, label: `1차 자료 요청 (D+${dfc})` });
              } else if (cp.dataRequestCount > 0 && daysSinceReq !== null && daysSinceReq >= 2) {
                todayTasks.push({ type: "자료수집", clientName, label: `${cp.dataRequestCount + 1}차 자료 요청 (D+${dfc})` });
              }
            }
            continue;
          }

          if (connected && cp.hasIdCard && cp.hasHometaxCredentials) continue;

          // 해피콜 단계
          if (!connected && noAnswerCalls.length < 3) {
            const baseDate = cp.happyCalls[0] ? new Date(cp.happyCalls[0].calledAt) : new Date(cp.createdAt);
            const daysElapsed = daysDiff(baseDate);
            if (daysElapsed >= 1 && !isPostponed(cp)) {
              const nextAttempt = noAnswerCalls.length + 1;
              todayTasks.push({ type: "해피콜", clientName, label: `${nextAttempt}차 해피콜 (D+${daysElapsed})` });
            }
          }
        }

        // 3. 메시지 구성
        const lines: string[] = [];
        lines.push(`🌅 *${userName}님, 좋은 아침이에요!* (${todayStr})`);
        lines.push("");

        if (schedules.length > 0) {
          lines.push("📅 *오늘의 일정*");
          for (const sc of schedules) {
            const time = sc.startTime ? `${sc.startTime}${sc.endTime ? `~${sc.endTime}` : ""}` : "종일";
            lines.push(`  • ${time} ${sc.title}`);
          }
        } else {
          lines.push("📅 *오늘의 일정* — 없음");
        }
        lines.push("");

        if (todayTasks.length > 0) {
          lines.push(`📋 *오늘의 업무* (${todayTasks.length}건)`);
          for (const t of todayTasks) {
            const icon = t.type === "해피콜" ? "📞" : t.type === "자료수집" ? "📂" : "📦";
            lines.push(`  • ${icon} ${t.label} [${t.clientName}]`);
          }
        } else {
          lines.push("📋 *오늘의 업무* — 없음");
        }
        lines.push("");
        lines.push("오늘도 화이팅! 💪");

        const result = await sendSlackDM(su.slackId, lines.join("\n"));
        if (result.ok) sent++;
        else errors.push(`${userName}(아침): ${result.error}`);
      }

      if (sendEvening && eveningEnabled) {
        const tomorrowStr = getTomorrowStr();

        const schedules = await prisma.schedule.findMany({
          where: {
            userId,
            OR: [
              { endDate: null, date: tomorrowStr },
              { date: { lte: tomorrowStr }, endDate: { gte: tomorrowStr } },
            ],
          },
          orderBy: { startTime: "asc" },
        });

        if (schedules.length === 0) continue;

        const lines: string[] = [];
        lines.push(`🌙 *${userName}님, 내일 일정 안내* (${tomorrowStr})`);
        lines.push("");
        lines.push("📅 *내일의 일정*");
        for (const sc of schedules) {
          const time = sc.startTime ? `${sc.startTime}${sc.endTime ? `~${sc.endTime}` : ""}` : "종일";
          lines.push(`  • ${time} ${sc.title}`);
        }
        lines.push("");
        lines.push("내일 준비 잘 하시고, 오늘 수고하셨습니다! 🙏");

        const result = await sendSlackDM(su.slackId, lines.join("\n"));
        if (result.ok) sent++;
        else errors.push(`${userName}(저녁): ${result.error}`);
      }
    } catch (e: any) {
      errors.push(`${su.user.name}: ${e.message}`);
    }
  }

  return NextResponse.json({ kstTime: kst.timeStr, sent, total: slackUsers.length, errors });
}
