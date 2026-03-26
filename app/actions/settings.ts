"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getSettings() {
  const session = await requireAuth();
  return prisma.settings.findUnique({ where: { userId: session.id } });
}

export async function saveSettings(formData: FormData) {
  const session = await requireAuth();

  const data = {
    agentHometaxId: (formData.get("agentHometaxId") as string) || null,
    agentHometaxPw: (formData.get("agentHometaxPw") as string) || null,
    certName:       (formData.get("certName")       as string) || null,
    certPassword:   (formData.get("certPassword")   as string) || null,
  };

  await prisma.settings.upsert({
    where:  { userId: session.id },
    update: data,
    create: { userId: session.id, ...data },
  });

  revalidatePath("/settings");
}
