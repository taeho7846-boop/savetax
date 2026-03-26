"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getSettings() {
  await requireAuth();
  return prisma.settings.findUnique({ where: { id: 1 } });
}

export async function saveSettings(formData: FormData) {
  await requireAuth();

  const data = {
    agentHometaxId: (formData.get("agentHometaxId") as string) || null,
    agentHometaxPw: (formData.get("agentHometaxPw") as string) || null,
    certName:       (formData.get("certName")       as string) || null,
    certPassword:   (formData.get("certPassword")   as string) || null,
  };

  await prisma.settings.upsert({
    where:  { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  revalidatePath("/settings");
}
