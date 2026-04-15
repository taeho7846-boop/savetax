import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCalendarEvents } from "@/lib/google-calendar";

// Google Calendar colorId → savetax 색상
const COLOR_MAP: Record<string, string> = {
  "1": "blue", "2": "green", "3": "purple", "6": "orange", "11": "red",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { yearMonth } = await req.json(); // "2026-04"
  if (!yearMonth) return NextResponse.json({ error: "yearMonth 필요" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { googleCalendarId: true },
  });

  if (!user?.googleCalendarId) {
    return NextResponse.json({ synced: 0, message: "구글 캘린더 ID가 설정되지 않았습니다" });
  }

  try {
    // 해당 월의 시간 범위
    const [year, month] = yearMonth.split("-").map(Number);
    const timeMin = new Date(year, month - 1, 1).toISOString();
    const timeMax = new Date(year, month, 0, 23, 59, 59).toISOString();

    // 구글 캘린더에서 이벤트 가져오기
    const events = await listCalendarEvents(user.googleCalendarId, timeMin, timeMax);

    // 이미 동기화된 이벤트 ID 조회
    const existingSchedules = await prisma.schedule.findMany({
      where: { userId: session.id, date: { startsWith: yearMonth } },
      select: { id: true, googleEventId: true, title: true, date: true, startTime: true },
    });
    const existingEventIds = new Set(existingSchedules.filter(s => s.googleEventId).map(s => s.googleEventId));

    let synced = 0;

    for (const event of events) {
      // 이미 동기화된 이벤트는 스킵
      if (existingEventIds.has(event.id)) continue;

      // savetax에서 만든 이벤트인지 확인 (googleEventId가 있으면 스킵)
      // 구글에서 직접 만든 이벤트만 가져오기

      const date = event.start?.date || event.start?.dateTime?.split("T")[0];
      if (!date) continue;

      const title = event.summary || "(제목 없음)";

      // 시간 추출
      let startTime: string | null = null;
      let endTime: string | null = null;
      if (event.start?.dateTime) {
        startTime = event.start.dateTime.split("T")[1]?.substring(0, 5) || null;
      }
      if (event.end?.dateTime) {
        endTime = event.end.dateTime.split("T")[1]?.substring(0, 5) || null;
      }

      // 같은 제목+날짜+시간으로 이미 있는지 확인 (중복 방지)
      const duplicate = existingSchedules.find(
        s => s.title === title && s.date === date && s.startTime === startTime
      );
      if (duplicate) continue;

      const color = event.colorId ? (COLOR_MAP[event.colorId] || "blue") : "blue";

      await prisma.schedule.create({
        data: {
          userId: session.id,
          title,
          date,
          startTime,
          endTime,
          color,
          notes: event.description || null,
          googleEventId: event.id,
        },
      });
      synced++;
    }

    return NextResponse.json({ synced, total: events.length });
  } catch (e: any) {
    console.error("[Calendar Sync] 실패:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
