import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackDM } from "@/lib/slack";

// 크론 비밀키 (외부 호출 방지)
const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST(req: NextRequest) {
  // 인증
  const { secret } = await req.json().catch(() => ({ secret: "" }));
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayStart = new Date(todayStr + "T00:00:00.000Z");
  const todayEnd = new Date(todayStr + "T23:59:59.999Z");

  // 슬랙 연동된 모든 사용자 조회
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

      // 1. 오늘의 스케줄
      const schedules = await prisma.schedule.findMany({
        where: {
          userId,
          date: { lte: todayStr },
          OR: [
            { endDate: null, date: todayStr },
            { endDate: { gte: todayStr } },
          ],
        },
        orderBy: { startTime: "asc" },
      });

      // 2. 오늘의 할일 (마감일이 오늘이거나 지난 미완료 건)
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

      // 3. 메시지 구성
      const lines: string[] = [];
      lines.push(`🌅 *${userName}님의 오늘 브리핑* (${todayStr})`);
      lines.push("");

      // 스케줄
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

      // 할일
      if (tasks.length > 0) {
        const overdue = tasks.filter(t => t.dueDate && t.dueDate < todayStart);
        const todayTasks = tasks.filter(t => t.dueDate && t.dueDate >= todayStart);

        if (overdue.length > 0) {
          lines.push(`🔴 *지연된 업무* (${overdue.length}건)`);
          for (const t of overdue) {
            const client = t.client?.name ? ` [${t.client.name}]` : "";
            const priority = t.priority === "urgent" ? "🚨" : t.priority === "high" ? "❗" : "";
            lines.push(`  • ${priority}${t.title}${client}`);
          }
          lines.push("");
        }

        if (todayTasks.length > 0) {
          lines.push(`✅ *오늘 할 일* (${todayTasks.length}건)`);
          for (const t of todayTasks) {
            const client = t.client?.name ? ` [${t.client.name}]` : "";
            const priority = t.priority === "urgent" ? "🚨" : t.priority === "high" ? "❗" : "";
            lines.push(`  • ${priority}${t.title}${client}`);
          }
        }
      } else {
        lines.push("✅ *오늘 할 일* — 없음");
      }

      lines.push("");
      lines.push("좋은 하루 보내세요! 💪");

      const message = lines.join("\n");

      // 발송
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

  return NextResponse.json({ sent, total: slackUsers.length, errors });
}
