"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 근로소득 있는데 EDI 미완료인 경우 — 완료처리 됐어도 진행중으로 올라오는 조건
const ediPendingCondition = {
  completedAt: { not: null },
  client: { laborTypes: { contains: "근로소득" } },
  OR: [{ nationalPensionDone: false }, { healthInsuranceDone: false }],
};

export async function getCommissions() {
  await requireAuth();
  return prisma.commissionProcess.findMany({
    where: {
      client: { isDeleted: false },
      OR: [
        { completedAt: null },
        ediPendingCondition,
      ],
    },
    include: {
      client: { select: { id: true, name: true, ceoName: true, phone: true, laborTypes: true } },
      happyCalls: { orderBy: { calledAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCompletedCommissions() {
  await requireAuth();
  return prisma.commissionProcess.findMany({
    where: {
      client: { isDeleted: false },
      completedAt: { not: null },
      // 근로소득 없는 경우 → 항상 완료 테이블
      // 근로소득 있는 경우 → 국민연금+건강보험 둘 다 완료돼야 완료 테이블
      OR: [
        { client: { laborTypes: null } },
        { client: { laborTypes: { not: { contains: "근로소득" } } } },
        { nationalPensionDone: true, healthInsuranceDone: true },
      ],
    },
    include: {
      client: { select: { id: true, name: true, ceoName: true, phone: true, laborTypes: true } },
      happyCalls: { orderBy: { calledAt: "asc" } },
    },
    orderBy: { completedAt: "desc" },
  });
}

export async function getClientsNotInCommission() {
  await requireAuth();
  const inCommission = await prisma.commissionProcess.findMany({
    select: { clientId: true },
  });
  const excludeIds = inCommission.map((c) => c.clientId);
  return prisma.client.findMany({
    where: {
      isDeleted: false,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: { id: true, name: true, ceoName: true },
    orderBy: { name: "asc" },
  });
}

export async function bulkImportAllClients() {
  await requireAuth();

  const [allClients, existing] = await Promise.all([
    prisma.client.findMany({
      where: { isDeleted: false },
      select: { id: true },
    }),
    prisma.commissionProcess.findMany({ select: { clientId: true } }),
  ]);

  const existingIds = new Set(existing.map((e) => e.clientId));
  const toCreate = allClients
    .filter((c) => !existingIds.has(c.id))
    .map((c) => ({ clientId: c.id }));

  if (toCreate.length > 0) {
    await prisma.commissionProcess.createMany({ data: toCreate });
  }

  revalidatePath("/commission");
  return toCreate.length;
}

export async function createCommission(clientId: number) {
  await requireAuth();
  await prisma.commissionProcess.create({ data: { clientId } });
  revalidatePath("/commission");
}

export async function addHappyCall(
  commissionId: number,
  result: string,
  notes: string
) {
  await requireAuth();
  const count = await prisma.happyCall.count({ where: { commissionId } });
  await prisma.happyCall.create({
    data: {
      commissionId,
      attemptNo: count + 1,
      result,
      notes: notes || null,
    },
  });
  revalidatePath("/commission");
}

export async function toggleField(
  commissionId: number,
  field:
    | "hasIdCard"
    | "hasHometaxCredentials"
    | "hometaxCommissionDone"
    | "wihagoDone"
    | "nationalPensionDone"
    | "healthInsuranceDone"
    | "hasEmployees",
  value: boolean
) {
  await requireAuth();
  const extra: Record<string, unknown> = {};
  if (field === "hometaxCommissionDone")
    extra.hometaxCommissionAt = value ? new Date() : null;
  if (field === "wihagoDone") extra.wihagoAt = value ? new Date() : null;
  if (field === "nationalPensionDone")
    extra.nationalPensionAt = value ? new Date() : null;
  if (field === "healthInsuranceDone")
    extra.healthInsuranceAt = value ? new Date() : null;

  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { [field]: value, ...extra },
  });
  revalidatePath("/commission");
}

export async function setWihagoType(
  commissionId: number,
  wihagoType: string | null
) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { wihagoType },
  });
  revalidatePath("/commission");
}

export async function saveNotes(commissionId: number, notes: string) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { notes: notes || null },
  });
  revalidatePath("/commission");
}

export async function markComplete(commissionId: number) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { completedAt: new Date() },
  });
  revalidatePath("/commission");
}

export async function removeFromCommission(commissionId: number) {
  await requireAuth();
  await prisma.commissionProcess.delete({ where: { id: commissionId } });
  revalidatePath("/commission");
}

export async function deleteIdCard(commissionId: number) {
  await requireAuth();
  const commission = await prisma.commissionProcess.findUnique({
    where: { id: commissionId },
    select: { idCardPath: true },
  });
  if (commission?.idCardPath) {
    const { unlink } = await import("fs/promises");
    const { join } = await import("path");
    try {
      await unlink(join(process.cwd(), "public", commission.idCardPath));
    } catch {}
  }
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { idCardPath: null },
  });
  revalidatePath("/commission");
}

export async function restoreCommission(commissionId: number) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { completedAt: null },
  });
  revalidatePath("/commission");
}
