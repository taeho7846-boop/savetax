"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function addCollectionContact(
  clientId: number,
  data: { result: string; promiseDate?: string | null; memo?: string | null; contactedAt?: string | null }
) {
  const session = await requireAuth();

  await prisma.collectionContact.create({
    data: {
      clientId,
      result: data.result,
      promiseDate: data.result === "promise" ? (data.promiseDate || null) : null,
      memo: data.memo?.trim() || null,
      contactedAt: data.contactedAt ? new Date(data.contactedAt) : new Date(),
      createdByUserId: session.id,
    },
  });

  revalidatePath("/savetax-receivables");
}

export async function deleteCollectionContact(id: number) {
  await requireAuth();
  await prisma.collectionContact.delete({ where: { id } });
  revalidatePath("/savetax-receivables");
}
