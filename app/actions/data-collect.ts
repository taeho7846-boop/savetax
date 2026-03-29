"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleDataCollection(
  clientId: number,
  docType: string,
  taxYear: string
) {
  await requireAuth();

  const existing = await prisma.dataCollection.findUnique({
    where: { clientId_docType_taxYear: { clientId, docType, taxYear } },
  });

  if (existing) {
    const nextStatus = existing.status === "collected" ? "pending" : "collected";
    await prisma.dataCollection.update({
      where: { id: existing.id },
      data: { status: nextStatus },
    });
  } else {
    await prisma.dataCollection.create({
      data: { clientId, docType, taxYear, status: "collected" },
    });
  }

  revalidatePath("/data-collect");
}

export async function bulkRequestCollection(
  clientIds: number[],
  docTypes: string[],
  taxYear: string
) {
  await requireAuth();

  for (const clientId of clientIds) {
    for (const docType of docTypes) {
      await prisma.dataCollection.upsert({
        where: { clientId_docType_taxYear: { clientId, docType, taxYear } },
        create: { clientId, docType, taxYear, status: "pending" },
        update: {},
      });
    }
  }

  revalidatePath("/data-collect");
}
