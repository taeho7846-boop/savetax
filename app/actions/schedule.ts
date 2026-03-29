"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getSchedules(yearMonth: string) {
  const session = await requireAuth();

  // 본인 + 소속 직원 + 소속 세무사의 일정 모두 보기
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { managerId: true },
  });

  let userIds: number[] = [session.id];

  if (session.role === "owner" || session.role === "admin" || session.role === "accountant") {
    // 소속 직원 일정도 보기
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    userIds.push(...employees.map(e => e.id));
  }

  if (session.role === "employee" && user?.managerId) {
    // 소속 세무사 + 같은 소속 직원 일정 보기
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

  await prisma.schedule.create({
    data: { userId: session.id, title, date, startTime, endTime, color, notes },
  });

  revalidatePath("/schedule");
}

export async function updateSchedule(id: number, formData: FormData) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || schedule.userId !== session.id) {
    throw new Error("본인의 일정만 수정할 수 있습니다.");
  }

  await prisma.schedule.update({
    where: { id },
    data: {
      title: (formData.get("title") as string)?.trim(),
      date: formData.get("date") as string,
      startTime: (formData.get("startTime") as string) || null,
      endTime: (formData.get("endTime") as string) || null,
      color: (formData.get("color") as string) || "blue",
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  });

  revalidatePath("/schedule");
}

export async function deleteSchedule(id: number) {
  const session = await requireAuth();

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule || schedule.userId !== session.id) {
    throw new Error("본인의 일정만 삭제할 수 있습니다.");
  }

  await prisma.schedule.delete({ where: { id } });
  revalidatePath("/schedule");
}
