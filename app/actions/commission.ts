"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 세무사(manager)는 본인 + 소속 직원의 고객도 조회
async function getVisibleUserIds(session: { id: number; role: string }) {
  const employees = await prisma.user.findMany({
    where: { managerId: session.id, isActive: true },
    select: { id: true },
  });
  if (employees.length === 0) return { equals: session.id };
  return { in: [session.id, ...employees.map((e) => e.id)] };
}

export async function getCommissions() {
  const session = await requireAuth();
  const assignedFilter = await getVisibleUserIds(session);
  return prisma.commissionProcess.findMany({
    where: {
      client: {
        isDeleted: false,
        ...(assignedFilter ? { assignedUserId: assignedFilter } : {}),
      },
      completedAt: null,
    },
    include: {
      client: { select: { id: true, name: true, ceoName: true, phone: true, laborTypes: true, assignedUser: { select: { name: true } } } },
      happyCalls: { orderBy: { calledAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCompletedCommissions() {
  const session = await requireAuth();
  const assignedFilter = await getVisibleUserIds(session);
  return prisma.commissionProcess.findMany({
    where: {
      client: {
        isDeleted: false,
        ...(assignedFilter ? { assignedUserId: assignedFilter } : {}),
      },
      completedAt: { not: null },
    },
    include: {
      client: { select: { id: true, name: true, ceoName: true, phone: true, laborTypes: true, assignedUser: { select: { name: true } } } },
      happyCalls: { orderBy: { calledAt: "asc" } },
    },
    orderBy: { completedAt: "desc" },
  });
}

export async function getClientsNotInCommission() {
  const session = await requireAuth();
  const assignedFilter = await getVisibleUserIds(session);
  const inCommission = await prisma.commissionProcess.findMany({
    select: { clientId: true },
  });
  const excludeIds = inCommission.map((c) => c.clientId);
  return prisma.client.findMany({
    where: {
      isDeleted: false,
      ...(assignedFilter ? { assignedUserId: assignedFilter } : {}),
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

  // 연결 시 connectedAt 세팅 (자료수집 D+0 시작)
  if (result === "connected") {
    await prisma.commissionProcess.update({
      where: { id: commissionId },
      data: { connectedAt: new Date() },
    });
  }

  // 부재중 3회 도달 시 관리제외요청
  if (result === "no_answer") {
    const noAnswerCount = await prisma.happyCall.count({
      where: { commissionId, result: "no_answer" },
    });
    if (noAnswerCount >= 3) {
      await prisma.commissionProcess.update({
        where: { id: commissionId },
        data: { excludeRequested: true, excludeRequestedAt: new Date() },
      });
    }
  }

  revalidatePath("/commission");
  revalidatePath("/dashboard");
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

// 자료 요청 완료 (대시보드 오늘의 업무에서 호출)
export async function markDataRequested(commissionId: number) {
  await requireAuth();
  const cp = await prisma.commissionProcess.findUnique({ where: { id: commissionId } });
  if (!cp) return;
  const newCount = cp.dataRequestCount + 1;
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: {
      dataRequestCount: newCount,
      lastDataRequestAt: new Date(),
      // 3회 도달 시 관리제외요청
      ...(newCount >= 3 ? { excludeRequested: true, excludeRequestedAt: new Date() } : {}),
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/commission");
}

// 수동 관리제외요청
export async function requestExclusion(commissionId: number) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { excludeRequested: true, excludeRequestedAt: new Date() },
  });
  revalidatePath("/dashboard");
  revalidatePath("/commission");
}

// 오늘의 업무 미루기
export async function postponeTask(commissionId: number, until: string, note: string) {
  await requireAuth();
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: {
      postponedUntil: new Date(until + "T00:00:00"),
      postponeNote: note || null,
    },
  });
  revalidatePath("/dashboard");
}

// 관리제외 확정 → 고객사 삭제(휴지통)
export async function confirmExclusion(commissionId: number) {
  await requireAuth();
  const cp = await prisma.commissionProcess.findUnique({
    where: { id: commissionId },
    select: { clientId: true },
  });
  await prisma.commissionProcess.update({
    where: { id: commissionId },
    data: { excludeConfirmed: true },
  });
  // 고객사 소프트 삭제 (휴지통으로)
  if (cp?.clientId) {
    await prisma.client.update({
      where: { id: cp.clientId },
      data: { isDeleted: true },
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/commission");
  revalidatePath("/clients");
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
