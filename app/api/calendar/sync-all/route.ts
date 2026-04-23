import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listCalendarEvents } from "@/lib/google-calendar";

const CRON_SECRET = process.env.CRON_SECRET || "";

const COLOR_MAP: Record<string, string> = {
  "1": "blue", "2": "green", "3": "purple", "6": "orange", "11": "red",
};

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({ secret: "" }));
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 구글 캘린더 ID가 설정된 모든 사용자
  const users = await prisma.user.findMany({
    where: { isActive: true, googleCalendarId: { not: null } },
    select: { id: true, name: true, googleCalendarId: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ message: "캘린더 연동된 사용자 없음", synced: 0 });
  }

  // 현재 월 + 다음 월 동기화
  const now = new Date();
  now.setHours(now.getHours() + 9); // KST
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextDate = new Date(now);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  const nextMonth = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`;

  let totalSynced = 0;
  const errors: string[] = [];

  for (const user of users) {
    try {
      const calendarId = user.googleCalendarId!;

      for (const yearMonth of [thisMonth, nextMonth]) {
        const [year, month] = yearMonth.split("-").map(Number);
        const timeMin = new Date(year, month - 1, 1).toISOString();
        const timeMax = new Date(year, month, 0, 23, 59, 59).toISOString();

        const events = await listCalendarEvents(calendarId, timeMin, timeMax);

        const existingSchedules = await prisma.schedule.findMany({
          where: { userId: user.id, date: { startsWith: yearMonth } },
          select: { id: true, googleEventId: true, title: true, date: true, startTime: true },
        });
        const existingEventIds = new Set(existingSchedules.filter(s => s.googleEventId).map(s => s.googleEventId));

        for (const event of events) {
          if (existingEventIds.has(event.id)) continue;

          const date = event.start?.date || event.start?.dateTime?.split("T")[0];
          if (!date) continue;

          const title = event.summary || "(제목 없음)";

          let startTime: string | null = null;
          let endTime: string | null = null;
          if (event.start?.dateTime) {
            startTime = event.start.dateTime.split("T")[1]?.substring(0, 5) || null;
          }
          if (event.end?.dateTime) {
            endTime = event.end.dateTime.split("T")[1]?.substring(0, 5) || null;
          }

          let endDate: string | null = null;
          if (event.end?.date && event.end.date !== date) {
            const ed = new Date(event.end.date);
            ed.setDate(ed.getDate() - 1);
            const edStr = ed.toISOString().split("T")[0];
            if (edStr !== date) endDate = edStr;
          } else if (event.end?.dateTime) {
            const endDateStr = event.end.dateTime.split("T")[0];
            if (endDateStr !== date) endDate = endDateStr;
          }

          const duplicate = existingSchedules.find(
            s => s.title === title && s.date === date && s.startTime === startTime
          );
          if (duplicate) continue;

          const color = event.colorId ? (COLOR_MAP[event.colorId] || "blue") : "blue";

          await prisma.schedule.create({
            data: {
              userId: user.id,
              title,
              date,
              endDate,
              startTime,
              endTime,
              color,
              notes: event.description || null,
              googleEventId: event.id,
            },
          });
          totalSynced++;
        }
      }
    } catch (e: any) {
      errors.push(`${user.name}: ${e.message}`);
    }
  }

  return NextResponse.json({ users: users.length, synced: totalSynced, errors });
}
