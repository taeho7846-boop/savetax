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
        const todayStart = new Date(todayStr + "T00:00:00+09:00");
        const todayEnd = new Date(todayStr + "T23:59:59+09:00");

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

        const tasks = await prisma.task.findMany({
          where: {
            isDeleted: false,
            assignedUserId: userId,
            status: { notIn: ["done", "hold"] },
            dueDate: { lte: todayEnd },
          },
          include: { client: { select: { name: true } } },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        });

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

        if (tasks.length > 0) {
          const overdue = tasks.filter(t => t.dueDate && t.dueDate < todayStart);
          const todayTasks = tasks.filter(t => t.dueDate && t.dueDate >= todayStart);
          if (overdue.length > 0) {
            lines.push(`🔴 *지연된 업무* (${overdue.length}건)`);
            for (const t of overdue) {
              const client = t.client?.name ? ` [${t.client.name}]` : "";
              const p = t.priority === "urgent" ? "🚨" : t.priority === "high" ? "❗" : "";
              lines.push(`  • ${p}${t.title}${client}`);
            }
            lines.push("");
          }
          if (todayTasks.length > 0) {
            lines.push(`✅ *오늘 할 일* (${todayTasks.length}건)`);
            for (const t of todayTasks) {
              const client = t.client?.name ? ` [${t.client.name}]` : "";
              const p = t.priority === "urgent" ? "🚨" : t.priority === "high" ? "❗" : "";
              lines.push(`  • ${p}${t.title}${client}`);
            }
          }
        } else {
          lines.push("✅ *오늘 할 일* — 없음");
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
