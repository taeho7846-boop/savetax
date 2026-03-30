"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 배분 대상 세무사 목록 (accountant만)
export async function getDistributionData(clientType: string) {
  await requireAuth();

  const accountants = await prisma.user.findMany({
    where: { role: "accountant", isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const distributions = await prisma.distribution.findMany({
    where: { clientType },
    include: { assignedUser: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // 세무사별 배분 수
  const counts: Record<number, number> = {};
  for (const a of accountants) counts[a.id] = 0;
  for (const d of distributions) {
    if (counts[d.assignedUserId] !== undefined) counts[d.assignedUserId]++;
  }

  return { accountants, distributions, counts };
}

// 거래처 추가 + 자동 배분
export async function addDistribution(
  clientNames: string[],
  clientType: string, // "corporate" | "individual"
) {
  await requireAuth();

  const names = clientNames.filter((n) => n.trim());
  if (names.length === 0) return;

  const accountants = await prisma.user.findMany({
    where: { role: "accountant", isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (accountants.length === 0) throw new Error("배정 가능한 세무사가 없습니다");

  // 현재 세무사별 배분 수 조회
  const existing = await prisma.distribution.groupBy({
    by: ["assignedUserId"],
    where: { clientType },
    _count: true,
  });

  const counts: Record<number, number> = {};
  for (const a of accountants) counts[a.id] = 0;
  for (const e of existing) {
    if (counts[e.assignedUserId] !== undefined) counts[e.assignedUserId] = e._count;
  }

  // 라운드 로빈: 가장 적은 사람부터 배정
  const batchId = `${Date.now()}`;

  for (const name of names) {
    // 가장 적은 수를 가진 세무사 찾기 (동점이면 순서 유지)
    let minCount = Infinity;
    let minId = accountants[0].id;
    for (const a of accountants) {
      if (counts[a.id] < minCount) {
        minCount = counts[a.id];
        minId = a.id;
      }
    }

    await prisma.distribution.create({
      data: {
        clientName: name.trim(),
        clientType,
        assignedUserId: minId,
        batchId,
      },
    });

    counts[minId]++;
  }

  revalidatePath("/distribution");
}

// 배분 삭제
export async function deleteDistribution(id: number) {
  await requireAuth();
  await prisma.distribution.delete({ where: { id } });
  revalidatePath("/distribution");
}
