"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";

// 사용자의 구글 캘린더 ID 가져오기
async function getUserCalendarId(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleCalendarId: true },
  });
  return user?.googleCalendarId || null;
}

export async function getSchedules(yearMonth: string) {
  const session = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { managerId: true },
  });

  let userIds: number[] = [session.id];

  if (session.role === "owner" || session.role === "admin" || session.role === "accountant") {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    userIds.push(...employees.map(e => e.id));
  }

  if (session.role === "employee" && user?.managerId) {
    const teammates = await prisma.user.findMany({
      where: {
        OR: [
          { id: user.managerId },
          { managerId: user.managerId, isActive: true },
        ],
      },
      select: { id: true },
    });
    userIds.push(...teammates.map(t => t.id));
  }

  const uniqueIds = [...new Set(userIds)];

  const schedules = await prisma.schedule.findMany({
    where: {
      userId: { in: uniqueIds },
      date: { startsWith: yearMonth },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return schedules;
}

export async function createSchedule(formData: FormData) {
  const session = await requireAuth();

  const title = (formData.get("title") as string)?.trim();
  const date = formData.get("date") as string;
  const startTime = (formData.get("startTime") as string) || null;
  const endTime = (formData.get("endTime") as string) || null;
  const color = (formData.get("color") as string) || "blue";
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!title || !date) throw new Error("제목과 날짜를 입력하세요.");

  // DB에 저장
  const schedule = await prisma.schedule.create({
    data: { userId: session.id, title, date, startTime, endTime, color, notes },
  });

  // 구글 캘린더에 동기화
  const calendarId = await getUserCalendarId(session.id);
  if (calendarId) {
    const googleEventId = await createCalendarEvent(calendarId, { title, date, startTime, endTime, notes, color });
    if (googleEventId) {
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: { googleEventId },
      });
    }
  }

  revalidatePath("/schedule");
}

export async function updateSchedule(id: number, formData: FormData) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || schedule.userId !== session.id) {
    throw new Error("본인의 일정만 수정할 수 있습니다.");
  }

  const title = (formData.get("title") as string)?.trim();
  const date = formData.get("date") as string;
  const startTime = (formData.get("startTime") as string) || null;
  const endTime = (formData.get("endTime") as string) || null;
  const color = (formData.get("color") as string) || "blue";
  const notes = (formData.get("notes") as string)?.trim() || null;

  await prisma.schedule.update({
    where: { id },
    data: { title, date, startTime, endTime, color, notes },
  });

  // 구글 캘린더 동기화
  const calendarId = await getUserCalendarId(session.id);
  if (calendarId && schedule.googleEventId) {
    await updateCalendarEvent(calendarId, schedule.googleEventId, { title, date, startTime, endTime, notes, color });
  } else if (calendarId && !schedule.googleEventId) {
    // 기존에 동기화 안 된 일정이면 새로 생성
    const googleEventId = await createCalendarEvent(calendarId, { title, date, startTime, endTime, notes, color });
    if (googleEventId) {
      await prisma.schedule.update({ where: { id }, data: { googleEventId } });
    }
  }

  revalidatePath("/schedule");
}

export async function deleteSchedule(id: number) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || schedule.userId !== session.id) {
    throw new Error("본인의 일정만 삭제할 수 있습니다.");
  }

  // 구글 캘린더에서도 삭제
  const calendarId = await getUserCalendarId(session.id);
  if (calendarId && schedule.googleEventId) {
    await deleteCalendarEvent(calendarId, schedule.googleEventId);
  }

  await prisma.schedule.delete({ where: { id } });
  revalidatePath("/schedule");
}
