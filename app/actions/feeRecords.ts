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
    // exempt(청구 제외)는 좌클릭으로 건드리지 않는다 — 해제는 setFeeRecordExempt(제외 셀 클릭)
    if (existing.status === "exempt") return;
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
  revalidatePath("/savetax-receivables");
  revalidatePath("/dashboard");
  revalidatePath("/settlement-taeho");
}

/**
 * 청구 제외(exempt) 설정/해제 — 계약 공백(해지 후 재수임 사이), 무료 기장 등 청구하지 않는 달.
 * 제외된 달은 청구 예정·미수 집계에서 빠진다. 해제하면 기록을 지워 기본(미수) 상태로 돌아간다.
 */
export async function setFeeRecordExempt(clientId: number, yearMonth: string, exempt: boolean) {
  await requireAuth();
  if (exempt) {
    await prisma.feeRecord.upsert({
      where: { clientId_yearMonth: { clientId, yearMonth } },
      update: { status: "exempt" },
      create: { clientId, yearMonth, status: "exempt" },
    });
  } else {
    await prisma.feeRecord.deleteMany({ where: { clientId, yearMonth, status: "exempt" } });
  }
  revalidatePath("/receivables");
  revalidatePath("/savetax-receivables");
  revalidatePath("/dashboard");
  revalidatePath("/settlement-taeho");
}
