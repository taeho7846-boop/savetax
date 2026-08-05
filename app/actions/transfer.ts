"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await requireAuth();
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

// 담당자 이관 모달용: 전체 직원 목록 + 각자 담당 거래처 수 (비활성 포함)
export async function getTransferUsers() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, role: true, isActive: true },
  });

  const counts = await prisma.client.groupBy({
    by: ["assignedUserId"],
    where: { isDeleted: false },
    _count: { id: true },
  });
  const countMap = new Map(counts.map(c => [c.assignedUserId, c._count.id]));

  return users.map(u => ({
    ...u,
    clientCount: countMap.get(u.id) ?? 0,
  }));
}

// 특정 담당자의 거래처 목록 (선택 이관용 체크리스트)
export async function getAssignedClients(userId: number) {
  await requireAdmin();

  return prisma.client.findMany({
    where: { assignedUserId: userId, isDeleted: false },
    orderBy: [{ contractStatus: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      ceoName: true,
      clientType: true,
      contractStatus: true,
      taxTypes: true,
    },
  });
}

// 선택한 거래처들의 담당자를 일괄 변경
export async function transferClients(clientIds: number[], toUserId: number) {
  await requireAdmin();

  if (!clientIds.length) {
    throw new Error("이관할 거래처를 선택하세요.");
  }

  const toUser = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, name: true, isActive: true },
  });
  if (!toUser || !toUser.isActive) {
    throw new Error("받는 담당자가 유효하지 않습니다.");
  }

  const result = await prisma.client.updateMany({
    where: { id: { in: clientIds }, isDeleted: false },
    data: { assignedUserId: toUserId },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { count: result.count, toUserName: toUser.name };
}
