"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleFeeRecord(clientId: number, yearMonth: string) {
  await requireAuth();

  const existing = await prisma.feeRecord.findUnique({
    where: { clientId_yearMonth: { clientId, yearMonth } },
  });

  if (existing) {
    await prisma.feeRecord.update({
      where: { id: existing.id },
      data: { status: existing.status === "paid" ? "unpaid" : "paid" },
    });
  } else {
    await prisma.feeRecord.create({
      data: { clientId, yearMonth, status: "paid" },
    });
  }

  revalidatePath("/receivables");
}
