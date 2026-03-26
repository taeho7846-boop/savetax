"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTask(formData: FormData) {
  await requireAuth();

  const dueDateStr = formData.get("dueDate") as string;

  await prisma.task.create({
    data: {
      clientId: parseInt(formData.get("clientId") as string),
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : null,
      title: formData.get("title") as string,
      taskType: (formData.get("taskType") as string) || null,
      status: (formData.get("status") as string) || "scheduled",
      priority: (formData.get("priority") as string) || "normal",
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks");
}

export async function updateTaskStatus(id: number, status: string) {
  await requireAuth();

  await prisma.task.update({
    where: { id },
    data: {
      status,
      completedAt: status === "done" ? new Date() : null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(id: number) {
  await requireAuth();
  await prisma.task.update({ where: { id }, data: { isDeleted: true } });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect("/tasks");
}

export async function getCreateTaskData() {
  await requireAuth();
  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      where: { isDeleted: false, contractStatus: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { clients, users };
}

export async function createTaskInModal(formData: FormData) {
  await requireAuth();

  const dueDateStr = formData.get("dueDate") as string;

  await prisma.task.create({
    data: {
      clientId: parseInt(formData.get("clientId") as string),
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : null,
      title: formData.get("title") as string,
      taskType: (formData.get("taskType") as string) || null,
      status: (formData.get("status") as string) || "scheduled",
      priority: (formData.get("priority") as string) || "normal",
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
