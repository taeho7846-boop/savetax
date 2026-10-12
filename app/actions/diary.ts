"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTeamUserIds, isManagerRole, todaySeoul } from "@/lib/team";

export type DiaryTask = {
  id: number;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  taskType: string | null;
  dueDate: string | null; // YYYY-MM-DD
  completedAt: string | null;
  clientId: number | null;
  clientName: string | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  createdByUserId: number | null;
};

export type DiaryMemo = {
  id: number;
  title: string | null;
  content: string;
  memoType: string;
  createdAt: string;
  clientId: number | null;
  clientName: string | null;
  authorId: number;
  authorName: string;
};

export type DiaryMember = { id: number; name: string };

function revalidateDiary(clientId?: number | null) {
  revalidatePath("/diary");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

// Task.dueDate는 UTC 자정으로 저장되므로 ISO 문자열 앞 10자리가 입력한 날짜와 일치
function dueKey(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function taskVisibilityFilter(session: { id: number; role: string }) {
  const teamIds = await getTeamUserIds(session.id, session.role);
  if (isManagerRole(session.role)) {
    return {
      teamIds,
      filter: [
        { assignedUserId: { in: teamIds } },
        { createdByUserId: { in: teamIds } },
      ],
    };
  }
  const me = await prisma.user.findUnique({ where: { id: session.id }, select: { managerId: true } });
  const filter: Prisma.TaskWhereInput[] = [
    { createdByUserId: session.id },
    { assignedUserId: session.id },
  ];
  if (me?.managerId) {
    filter.push({ createdByUserId: me.managerId, sharedWithEmployees: true });
  }
  return { teamIds, filter };
}

// 기간 안의 할 일 + (오늘 기준) 이월된 미완료 할 일
export async function getDiaryTasks(from: string, to: string): Promise<DiaryTask[]> {
  const session = await requireAuth();
  const { filter } = await taskVisibilityFilter(session);
  const today = todaySeoul();

  const tasks = await prisma.task.findMany({
    where: {
      isDeleted: false,
      OR: filter,
      AND: [
        {
          OR: [
            { dueDate: { gte: new Date(from), lte: new Date(to) } },
            { dueDate: { lt: new Date(today) }, status: { not: "done" } },
            // 마감일 없는 미완료 할 일은 오늘 칸에 보여준다
            { dueDate: null, status: { not: "done" } },
          ],
        },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });

  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    dueDate: dueKey(t.dueDate),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    clientId: t.clientId,
    clientName: t.client?.name ?? null,
    assignedUserId: t.assignedUserId,
    assignedUserName: t.assignedUser?.name ?? null,
    createdByUserId: t.createdByUserId,
  }));
}

export async function getDiaryMemos(limit = 30): Promise<DiaryMemo[]> {
  const session = await requireAuth();
  const memos = await prisma.memo.findMany({
    where: { authorId: session.id, taskId: null },
    include: {
      client: { select: { id: true, name: true } },
      author: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return memos.map(m => ({
    id: m.id,
    title: m.title,
    content: m.content,
    memoType: m.memoType,
    createdAt: m.createdAt.toISOString(),
    clientId: m.clientId,
    clientName: m.client?.name ?? null,
    authorId: m.authorId,
    authorName: m.author.name,
  }));
}

export async function getDiaryMembers(): Promise<DiaryMember[]> {
  const session = await requireAuth();
  const teamIds = await getTeamUserIds(session.id, session.role);
  const users = await prisma.user.findMany({
    where: { id: { in: teamIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  // 본인 먼저
  return [...users.filter(u => u.id === session.id), ...users.filter(u => u.id !== session.id)];
}

// 빠른 할 일 추가 (다이어리 인라인 입력, 독바 빠른입력, 거래처 페이지 버튼 공용)
export async function quickCreateTask(input: {
  title: string;
  dueDate?: string | null;
  clientId?: number | null;
  notes?: string | null;
}) {
  const session = await requireAuth();
  const title = input.title.trim();
  if (!title) throw new Error("내용을 입력하세요.");

  const task = await prisma.task.create({
    data: {
      title,
      notes: input.notes?.trim() || null,
      clientId: input.clientId ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      assignedUserId: session.id,
      createdByUserId: session.id,
      status: "scheduled",
      priority: "normal",
    },
  });

  revalidateDiary(input.clientId);
  return { id: task.id };
}

export async function quickCreateMemo(input: { content: string; clientId?: number | null; title?: string | null }) {
  const session = await requireAuth();
  const content = input.content.trim();
  if (!content) throw new Error("내용을 입력하세요.");

  const memo = await prisma.memo.create({
    data: {
      content,
      title: input.title?.trim() || null,
      clientId: input.clientId ?? null,
      authorId: session.id,
      memoType: "general",
    },
  });

  revalidateDiary(input.clientId);
  return { id: memo.id };
}

export async function setTaskDone(id: number, done: boolean) {
  await requireAuth();
  const task = await prisma.task.findUnique({ where: { id }, select: { clientId: true } });
  await prisma.task.update({
    where: { id },
    data: {
      status: done ? "done" : "scheduled",
      completedAt: done ? new Date() : null,
    },
  });
  revalidateDiary(task?.clientId);
}

export async function moveTaskDueDate(id: number, dueDate: string | null) {
  await requireAuth();
  const task = await prisma.task.findUnique({ where: { id }, select: { clientId: true } });
  await prisma.task.update({
    where: { id },
    data: { dueDate: dueDate ? new Date(dueDate) : null },
  });
  revalidateDiary(task?.clientId);
}

export async function deleteDiaryTask(id: number) {
  const session = await requireAuth();
  const task = await prisma.task.findUnique({ where: { id }, select: { clientId: true, createdByUserId: true, assignedUserId: true } });
  if (!task) return;
  if (task.createdByUserId !== session.id && task.assignedUserId !== session.id && !isManagerRole(session.role)) {
    throw new Error("본인 할 일만 삭제할 수 있습니다.");
  }
  await prisma.task.update({ where: { id }, data: { isDeleted: true } });
  revalidateDiary(task.clientId);
}

// 메모 → 할 일 전환 (할 일 생성 후 메모는 삭제)
export async function convertMemoToTask(memoId: number, dueDate: string | null) {
  const session = await requireAuth();
  const memo = await prisma.memo.findUnique({ where: { id: memoId } });
  if (!memo || memo.authorId !== session.id) throw new Error("본인의 메모만 전환할 수 있습니다.");

  const firstLine = (memo.title || memo.content).split("\n")[0].trim().slice(0, 100);
  await prisma.task.create({
    data: {
      title: firstLine || "메모에서 전환",
      notes: memo.title ? memo.content : (memo.content.length > firstLine.length ? memo.content : null),
      clientId: memo.clientId,
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedUserId: session.id,
      createdByUserId: session.id,
      status: "scheduled",
      priority: "normal",
    },
  });
  await prisma.memo.delete({ where: { id: memoId } });
  revalidateDiary(memo.clientId);
}

export async function deleteDiaryMemo(id: number) {
  const session = await requireAuth();
  const memo = await prisma.memo.findUnique({ where: { id } });
  if (!memo || memo.authorId !== session.id) throw new Error("본인의 메모만 삭제할 수 있습니다.");
  await prisma.memo.delete({ where: { id } });
  revalidateDiary(memo.clientId);
}

// 빠른입력용 거래처 목록 (본인 담당 + 관리자는 팀 담당까지)
export async function getQuickCaptureClients() {
  const session = await requireAuth();
  const teamIds = await getTeamUserIds(session.id, session.role);
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, contractStatus: "active", assignedUserId: { in: teamIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return clients;
}
