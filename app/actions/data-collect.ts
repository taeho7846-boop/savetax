"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { unlink, rmdir } from "fs/promises";
import path from "path";

// 수집 기록 + 업로드된 파일 삭제 (처음 상태로 초기화)
export async function deleteDataCollection(
  clientId: number,
  docType: string,
  taxYear: string
) {
  await requireAuth();

  const record = await prisma.dataCollection.findUnique({
    where: { clientId_docType_taxYear: { clientId, docType, taxYear } },
  });
  if (!record) return;

  // params._files에 기록된 업로드 파일 삭제
  if (record.params) {
    try {
      const files = JSON.parse(record.params)._files;
      if (Array.isArray(files)) {
        const uploadsRoot = path.join(process.cwd(), "public", "uploads", "data-collect");
        for (const f of files) {
          if (typeof f?.url !== "string") continue;
          const rel = f.url.replace(/^\/api\/uploads\//, "");
          const filePath = path.resolve(process.cwd(), "public", "uploads", rel);
          if (!filePath.startsWith(uploadsRoot)) continue; // 경로 조작 방지
          try { await unlink(filePath); } catch {}
          try { await rmdir(path.dirname(filePath)); } catch {} // 비어 있을 때만 삭제됨
        }
      }
    } catch {}
  }

  await prisma.dataCollection.delete({ where: { id: record.id } });
  revalidatePath("/data-collect");
}

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
