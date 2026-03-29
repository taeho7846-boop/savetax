"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleWithholdingTask(
  clientId: number,
  yearMonth: string,
  taskType: string
) {
  await requireAuth();

  const existing = await prisma.withholdingRecord.findUnique({
    where: { clientId_yearMonth_taskType: { clientId, yearMonth, taskType } },
  });

  if (existing) {
    await prisma.withholdingRecord.update({
      where: { id: existing.id },
      data: { done: !existing.done },
    });
  } else {
    await prisma.withholdingRecord.create({
      data: { clientId, yearMonth, taskType, done: true },
    });
  }

  revalidatePath("/withholding");
}
