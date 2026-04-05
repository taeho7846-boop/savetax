"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTask(formData: FormData) {
  const session = await requireAuth();

  const dueDateStr = formData.get("dueDate") as string;

  await prisma.task.create({
    data: {
      clientId: (formData.get("clientId") as string)?.trim() ? parseInt(formData.get("clientId") as string) : null,
      assignedUserId: session.id,
      createdByUserId: session.id,
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
}

export async function getCreateTaskData() {
  const session = await requireAuth();
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, contractStatus: "active", assignedUserId: session.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { clients, currentUserRole: session.role };
}

export async function createTaskInModal(formData: FormData) {
  const session = await requireAuth();

  const dueDateStr = formData.get("dueDate") as string;
  const isManager = ["owner", "admin", "accountant"].includes(session.role);

  await prisma.task.create({
    data: {
      clientId: (formData.get("clientId") as string)?.trim() ? parseInt(formData.get("clientId") as string) : null,
      assignedUserId: session.id,
      createdByUserId: session.id,
      title: formData.get("title") as string,
      taskType: (formData.get("taskType") as string) || null,
      status: (formData.get("status") as string) || "scheduled",
      priority: (formData.get("priority") as string) || "normal",
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      notes: (formData.get("notes") as string) || null,
      sharedWithEmployees: isManager ? formData.get("sharedWithEmployees") === "true" : false,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
