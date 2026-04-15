import { GoogleAuth } from "google-auth-library";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!authClient) {
    let credentials: any = {};
    try {
      const fs = require("fs");
      const path = require("path");
      const keyPath = path.join(process.cwd(), "google-credentials.json");
      if (fs.existsSync(keyPath)) {
        credentials = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      }
    } catch {}
    authClient = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }
  return authClient;
}

async function getToken(): Promise<string> {
  const client = await getAuth().getClient();
  const token = await client.getAccessToken();
  return token.token || "";
}

// 이벤트 생성
export async function createCalendarEvent(
  calendarId: string,
  event: {
    title: string;
    date: string; // YYYY-MM-DD
    startTime?: string | null; // HH:MM
    endTime?: string | null;
    notes?: string | null;
    color?: string;
  }
): Promise<string | null> {
  if (!calendarId) return null;

  const token = await getToken();
  const body: any = {
    summary: event.title,
    description: event.notes || undefined,
    colorId: mapColor(event.color),
  };

  if (event.startTime) {
    // 시간이 있으면 dateTime 사용
    body.start = { dateTime: `${event.date}T${event.startTime}:00`, timeZone: "Asia/Seoul" };
    body.end = {
      dateTime: event.endTime
        ? `${event.date}T${event.endTime}:00`
        : `${event.date}T${addHour(event.startTime)}:00`,
      timeZone: "Asia/Seoul",
    };
  } else {
    // 종일 이벤트
    body.start = { date: event.date };
    body.end = { date: event.date };
  }

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      console.error("[Google Calendar] 이벤트 생성 실패:", data.error.message);
      return null;
    }
    return data.id;
  } catch (e) {
    console.error("[Google Calendar] 이벤트 생성 오류:", e);
    return null;
  }
}

// 이벤트 수정
export async function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  event: {
    title: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    notes?: string | null;
    color?: string;
  }
): Promise<boolean> {
  if (!calendarId || !eventId) return false;

  const token = await getToken();
  const body: any = {
    summary: event.title,
    description: event.notes || undefined,
    colorId: mapColor(event.color),
  };

  if (event.startTime) {
    body.start = { dateTime: `${event.date}T${event.startTime}:00`, timeZone: "Asia/Seoul" };
    body.end = {
      dateTime: event.endTime
        ? `${event.date}T${event.endTime}:00`
        : `${event.date}T${addHour(event.startTime)}:00`,
      timeZone: "Asia/Seoul",
    };
  } else {
    body.start = { date: event.date };
    body.end = { date: event.date };
  }

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 이벤트 삭제
export async function deleteCalendarEvent(calendarId: string, eventId: string): Promise<boolean> {
  if (!calendarId || !eventId) return false;

  const token = await getToken();
  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok || res.status === 404; // 이미 삭제된 경우도 OK
  } catch {
    return false;
  }
}

// 이벤트 목록 조회 (동기화용)
export async function listCalendarEvents(
  calendarId: string,
  timeMin: string, // ISO format
  timeMax: string
): Promise<any[]> {
  if (!calendarId) return [];

  const token = await getToken();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  try {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

// savetax 색상 → Google Calendar colorId 매핑
function mapColor(color?: string): string | undefined {
  const map: Record<string, string> = {
    blue: "1",    // Lavender
    red: "11",    // Tomato
    green: "2",   // Sage
    purple: "3",  // Grape
    orange: "6",  // Tangerine
  };
  return color ? map[color] : undefined;
}

// 시간에 1시간 추가 (기본 종료 시간)
function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const nh = Math.min(h + 1, 23);
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
