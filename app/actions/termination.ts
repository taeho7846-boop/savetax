"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 체크리스트 토글 가능한 boolean 필드 목록 (안전한 화이트리스트)
const BOOL_FIELDS = [
  "ediSoloBiz",
  "ediPensionDone",
  "ediHealthDone",
  "ediEmploymentDone",
  "cmsTerminated",
  "hometaxTerminated",
  "feeSeparate",
  "feePaid",
] as const;
type BoolField = (typeof BOOL_FIELDS)[number];

async function ensureProcess(clientId: number) {
  const existing = await prisma.terminationProcess.findUnique({ where: { clientId } });
  if (existing) return existing;
  return prisma.terminationProcess.create({ data: { clientId } });
}

export async function toggleTerminationField(clientId: number, field: BoolField, value: boolean) {
  await requireAuth();
  if (!BOOL_FIELDS.includes(field)) throw new Error("허용되지 않은 항목입니다.");
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: { [field]: value },
  });
  revalidatePath("/termination");
  return { ok: true };
}

// 폐업부가세 상태: na(해당없음) / needed(신고필요) / done(신고완료)
export async function setClosureVat(clientId: number, status: "na" | "needed" | "done") {
  await requireAuth();
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: { closureVat: status },
  });
  revalidatePath("/termination");
  return { ok: true };
}

export async function setTerminationFee(clientId: number, separate: boolean, amount: number | null, paid: boolean) {
  await requireAuth();
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: {
      feeSeparate: separate,
      feeAmount: separate ? amount : null,
      feePaid: separate ? paid : false,
    },
  });
  revalidatePath("/termination");
  return { ok: true };
}

export async function setTerminationReason(clientId: number, reason: string) {
  await requireAuth();
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: { reason: reason.trim() || null },
  });
  revalidatePath("/termination");
  return { ok: true };
}

export async function setTerminationNotes(clientId: number, notes: string) {
  await requireAuth();
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: { notes: notes.trim() || null },
  });
  revalidatePath("/termination");
  return { ok: true };
}

// 전체 완료 처리 / 완료 취소
export async function setTerminationCompleted(clientId: number, completed: boolean) {
  await requireAuth();
  await ensureProcess(clientId);
  await prisma.terminationProcess.update({
    where: { clientId },
    data: { completedAt: completed ? new Date() : null },
  });
  revalidatePath("/termination");
  return { ok: true };
}
