import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackDM } from "@/lib/slack";

const CRON_SECRET = process.env.CRON_SECRET || "";

function getKSTDate(offset = 0) {
  const now = new Date();
  now.setHours(now.getHours() + 9); // UTC → KST
  now.setDate(now.getDate() + offset);
  return now.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const { secret, type = "morning" } = await req.json().catch(() => ({ secret: "", type: "morning" }));
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slackUsers = await prisma.slackUser.findMany({
    include: { user: { select: { id: true, name: true } } },
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
      let message = "";

      if (type === "morning") {
        // ── 아침: 오늘 일정 + 오늘 할일 ──
        const todayStr = getKSTDate();
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
          for (const s of schedules) {
            const time = s.startTime ? `${s.startTime}${s.endTime ? `~${s.endTime}` : ""}` : "종일";
            lines.push(`  • ${time} ${s.title}`);
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
        message = lines.join("\n");

      } else if (type === "evening") {
        // ── 저녁: 내일 일정 미리보기 ──
        const tomorrowStr = getKSTDate(1);

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

        if (schedules.length === 0) continue; // 내일 일정 없으면 안 보냄

        const lines: string[] = [];
        lines.push(`🌙 *${userName}님, 내일 일정 안내* (${tomorrowStr})`);
        lines.push("");
        lines.push("📅 *내일의 일정*");
        for (const s of schedules) {
          const time = s.startTime ? `${s.startTime}${s.endTime ? `~${s.endTime}` : ""}` : "종일";
          lines.push(`  • ${time} ${s.title}`);
        }
        lines.push("");
        lines.push("내일 준비 잘 하시고, 오늘 수고하셨습니다! 🙏");
        message = lines.join("\n");
      }

      if (!message) continue;

      const result = await sendSlackDM(su.slackId, message);
      if (result.ok) {
        sent++;
      } else {
        errors.push(`${userName}: ${result.error}`);
      }
    } catch (e: any) {
      errors.push(`${su.user.name}: ${e.message}`);
    }
  }

  return NextResponse.json({ type, sent, total: slackUsers.length, errors });
}
