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
    tiSupplierName:    (formData.get("tiSupplierName")    as string) || null,
    tiSupplierBizNum:  (formData.get("tiSupplierBizNum")  as string) || null,
    tiSupplierCeoName: (formData.get("tiSupplierCeoName") as string) || null,
    wehagoId:          (formData.get("wehagoId")          as string) || null,
    wehagoPw:          (formData.get("wehagoPw")          as string) || null,
    wemembersId:       (formData.get("wemembersId")       as string) || null,
    wemembersPw:       (formData.get("wemembersPw")       as string) || null,
    alimtalkHappyCallIndiv: (formData.get("alimtalkHappyCallIndiv") as string) || null,
    alimtalkHappyCallCorp:  (formData.get("alimtalkHappyCallCorp")  as string) || null,
    alimtalkDocRemind:      (formData.get("alimtalkDocRemind")      as string) || null,
    alimtalkFeeRemind:      (formData.get("alimtalkFeeRemind")      as string) || null,
    slackMorningEnabled:    formData.get("slackMorningEnabled") === "on",
    slackMorningTime:       (formData.get("slackMorningTime") as string) || "08:00",
    slackEveningEnabled:    formData.get("slackEveningEnabled") === "on",
    slackEveningTime:       (formData.get("slackEveningTime") as string) || "19:00",
    slackDistributionEnabled: formData.get("slackDistributionEnabled") === "on",
  };

  await prisma.settings.upsert({
    where:  { userId: session.id },
    update: data,
    create: { userId: session.id, ...data },
  });

  revalidatePath("/settings");
}
