"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";

import { getDiaryScope, canManageOfficeSchedule } from "@/lib/team";

// 사용자의 구글 캘린더 ID 가져오기
async function getUserCalendarId(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleCalendarId: true },
  });
  return user?.googleCalendarId || null;
}

function revalidateScheduleViews() {
  revalidatePath("/diary");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

// 기간(YYYY-MM-DD ~ YYYY-MM-DD) 안의 일정: 팀 개인 일정 + 사무실 공통 일정
export async function getSchedulesInRange(from: string, to: string) {
  const session = await requireAuth();
  const { userIds } = await getDiaryScope(session.id, session.role);

  return prisma.schedule.findMany({
    where: {
      // 사무실 공통 일정도 같은 사무실 사람이 만든 것만 보인다 (사무실마다 다이어리가 따로)
      userId: { in: userIds },
      AND: [
        { date: { lte: to } },
        {
          OR: [
            { endDate: null, date: { gte: from } },
            { endDate: { gte: from } },
          ],
        },
      ],
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

// 월 단위 조회 (하위호환)
export async function getSchedules(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return getSchedulesInRange(`${yearMonth}-01`, `${yearMonth}-${String(lastDay).padStart(2, "0")}`);
}

function readScheduleForm(formData: FormData, canOffice: boolean) {
  const title = (formData.get("title") as string)?.trim();
  const date = formData.get("date") as string;
  const endDateRaw = (formData.get("endDate") as string) || "";
  const endDate = endDateRaw && endDateRaw > date ? endDateRaw : null;
  const startTime = (formData.get("startTime") as string) || null;
  const endTime = (formData.get("endTime") as string) || null;
  const color = (formData.get("color") as string) || "blue";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const wantsOffice = formData.get("scope") === "office";
  const scope = wantsOffice && canOffice ? "office" : "personal";

  if (!title || !date) throw new Error("제목과 날짜를 입력하세요.");
  return { title, date, endDate, startTime, endTime, color, notes, scope };
}

async function canEdit(schedule: { userId: number; scope: string }, session: { id: number; role: string }) {
  if (schedule.userId === session.id) return true;
  if (schedule.scope === "office") return canManageOfficeSchedule(session.id, session.role);
  return false;
}

export async function createSchedule(formData: FormData) {
  const session = await requireAuth();
  const canOffice = await canManageOfficeSchedule(session.id, session.role);
  const data = readScheduleForm(formData, canOffice);

  const schedule = await prisma.schedule.create({
    data: { userId: session.id, ...data },
  });

  // 구글 캘린더에 동기화
  const calendarId = await getUserCalendarId(session.id);
  if (calendarId) {
    const googleEventId = await createCalendarEvent(calendarId, {
      title: data.title, date: data.date, startTime: data.startTime, endTime: data.endTime, notes: data.notes, color: data.color,
    });
    if (googleEventId) {
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { googleEventId },
      });
    }
  }

  revalidateScheduleViews();
}

export async function updateSchedule(id: number, formData: FormData) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || !(await canEdit(schedule, session))) {
    throw new Error("본인의 일정(또는 사무실 일정은 공유 멤버·관리자)만 수정할 수 있습니다.");
  }

  const canOffice = await canManageOfficeSchedule(session.id, session.role);
  const data = readScheduleForm(formData, canOffice);
  // 사무실 일정은 권한 없는 사람이 수정해도 scope 유지
  if (schedule.scope === "office" && !canOffice) data.scope = "office";

  await prisma.schedule.update({ where: { id }, data });

  // 구글 캘린더 동기화 (작성자 본인 캘린더만)
  if (schedule.userId === session.id) {
    const calendarId = await getUserCalendarId(session.id);
    const payload = { title: data.title, date: data.date, startTime: data.startTime, endTime: data.endTime, notes: data.notes, color: data.color };
    if (calendarId && schedule.googleEventId) {
      await updateCalendarEvent(calendarId, schedule.googleEventId, payload);
    } else if (calendarId && !schedule.googleEventId) {
      const googleEventId = await createCalendarEvent(calendarId, payload);
      if (googleEventId) {
        await prisma.schedule.update({ where: { id }, data: { googleEventId } });
      }
    }
  }

  revalidateScheduleViews();
}

export async function deleteSchedule(id: number) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || !(await canEdit(schedule, session))) {
    throw new Error("본인의 일정(또는 사무실 일정은 공유 멤버·관리자)만 삭제할 수 있습니다.");
  }

  if (schedule.userId === session.id) {
    const calendarId = await getUserCalendarId(session.id);
    if (calendarId && schedule.googleEventId) {
      await deleteCalendarEvent(calendarId, schedule.googleEventId);
    }
  }

  await prisma.schedule.delete({ where: { id } });
  revalidateScheduleViews();
}
