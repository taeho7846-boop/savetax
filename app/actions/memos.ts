"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createMemo(formData: FormData) {
  const session = await requireAuth();

  const clientId = formData.get("clientId");
  const taskId = formData.get("taskId");

  await prisma.memo.create({
    data: {
      clientId: clientId ? parseInt(clientId as string) : null,
      taskId: taskId ? parseInt(taskId as string) : null,
      authorId: session.id,
      content: formData.get("content") as string,
      memoType: (formData.get("memoType") as string) || "general",
    },
  });

  revalidatePath("/memos");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  redirect("/memos");
}

export async function getCreateMemoData() {
  const session = await requireAuth();
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, assignedUserId: session.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { clients };
}

export async function createMemoInModal(formData: FormData) {
  const session = await requireAuth();

  const clientId = formData.get("clientId");
  const taskId = formData.get("taskId");

  await prisma.memo.create({
    data: {
      clientId: clientId ? parseInt(clientId as string) : null,
      taskId: taskId ? parseInt(taskId as string) : null,
      authorId: session.id,
      content: formData.get("content") as string,
      memoType: (formData.get("memoType") as string) || "general",
    },
  });

  revalidatePath("/memos");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}
