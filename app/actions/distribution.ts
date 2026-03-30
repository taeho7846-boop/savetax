"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const TARGET_NAMES = ["김태호", "도희수", "최원석", "이종민"];

async function getAccountants() {
  const allUsers = await prisma.user.findMany({
    where: { name: { in: TARGET_NAMES }, isActive: true },
    select: { id: true, name: true },
  });
  return TARGET_NAMES
    .map(n => allUsers.find(u => u.name === n))
    .filter((u): u is { id: number; name: string } => !!u);
}

export async function getDistributionData(clientType: string) {
  await requireAuth();

  const accountants = await getAccountants();

  const [distributions, passes] = await Promise.all([
    prisma.distribution.findMany({
      where: { clientType },
      include: { assignedUser: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.distributionPass.findMany({
      where: { clientType },
    }),
  ]);

  // 세무사별 실제 배분 수 (스킵 제외)
  const counts: Record<number, number> = {};
  for (const a of accountants) counts[a.id] = 0;
  for (const d of distributions) {
    if (!d.isSkipped && counts[d.assignedUserId] !== undefined) counts[d.assignedUserId]++;
  }

  // PASS 상태
  const passSet = new Set(passes.map(p => p.userId));

  return { accountants, distributions, counts, passUserIds: [...passSet] };
}

// PASS 토글
export async function togglePass(userId: number, clientType: string) {
  await requireAuth();

  const existing = await prisma.distributionPass.findUnique({
    where: { userId_clientType: { userId, clientType } },
  });

  if (existing) {
    await prisma.distributionPass.delete({ where: { id: existing.id } });
  } else {
    await prisma.distributionPass.create({ data: { userId, clientType } });
  }

  revalidatePath("/distribution");
}

// 거래처 추가 + 자동 배분
export async function addDistribution(
  clientNames: string[],
  clientType: string,
) {
  await requireAuth();

  const names = clientNames.filter((n) => n.trim());
  if (names.length === 0) return;

  const accountants = await getAccountants();
  if (accountants.length === 0) throw new Error("배정 가능한 세무사가 없습니다");

  // PASS 상태 조회
  const passes = await prisma.distributionPass.findMany({ where: { clientType } });
  const passSet = new Set(passes.map(p => p.userId));

  // 현재 세무사별 총 행 수 (스킵 포함) — 라운드 로빈 순서 결정용
  const existing = await prisma.distribution.groupBy({
    by: ["assignedUserId"],
    where: { clientType },
    _count: true,
  });

  const totalRows: Record<number, number> = {};
  for (const a of accountants) totalRows[a.id] = 0;
  for (const e of existing) {
    if (totalRows[e.assignedUserId] !== undefined) totalRows[e.assignedUserId] = e._count;
  }

  // 실제 배분 수 (스킵 제외)
  const realExisting = await prisma.distribution.groupBy({
    by: ["assignedUserId"],
    where: { clientType, isSkipped: false },
    _count: true,
  });
  const realCounts: Record<number, number> = {};
  for (const a of accountants) realCounts[a.id] = 0;
  for (const e of realExisting) {
    if (realCounts[e.assignedUserId] !== undefined) realCounts[e.assignedUserId] = e._count;
  }

  // 가장 실제 배분이 적은 사람 찾기 (PASS인 사람 제외)
  const batchId = `${Date.now()}`;
  const activeAccountants = accountants.filter(a => !passSet.has(a.id));

  if (activeAccountants.length === 0) throw new Error("모든 세무사가 PASS 상태입니다");

  let minCount = Infinity;
  let minId = activeAccountants[0].id;
  for (const a of activeAccountants) {
    if (realCounts[a.id] < minCount) {
      minCount = realCounts[a.id];
      minId = a.id;
    }
  }

  // 배정 대상에게 거래처 몰아서 배정
  for (const name of names) {
    await prisma.distribution.create({
      data: {
        clientName: name.trim(),
        clientType,
        assignedUserId: minId,
        batchId,
      },
    });
  }

  // PASS인 사람들에게 "-" 행 추가 (같은 라운드에 스킵 표시)
  for (const a of accountants) {
    if (passSet.has(a.id)) {
      await prisma.distribution.create({
        data: {
          clientName: "-",
          clientType,
          assignedUserId: a.id,
          isSkipped: true,
          batchId,
        },
      });
    }
  }

  revalidatePath("/distribution");
}

// 배분 삭제
export async function deleteDistribution(id: number) {
  await requireAuth();
  await prisma.distribution.delete({ where: { id } });
  revalidatePath("/distribution");
}
