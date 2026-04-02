"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const TARGET_NAMES = ["김태호", "이휘언"];

// clientType에 "taeho_" 접두어를 붙여 세이브택스 배분과 데이터 분리
function prefixed(clientType: string) {
  return `taeho_${clientType}`;
}

async function getAccountants() {
  const allUsers = await prisma.user.findMany({
    where: { name: { in: TARGET_NAMES }, isActive: true },
    select: { id: true, name: true },
  });
  return TARGET_NAMES
    .map(n => allUsers.find(u => u.name === n))
    .filter((u): u is { id: number; name: string } => !!u);
}

export async function getTaehoDistributionData(clientType: string) {
  await requireAuth();
  const ct = prefixed(clientType);
  const accountants = await getAccountants();

  const [distributions, passes] = await Promise.all([
    prisma.distribution.findMany({
      where: { clientType: ct },
      include: { assignedUser: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.distributionPass.findMany({ where: { clientType: ct } }),
  ]);

  const counts: Record<number, number> = {};
  for (const a of accountants) counts[a.id] = 0;
  for (const d of distributions) {
    if (!d.isSkipped && counts[d.assignedUserId] !== undefined) counts[d.assignedUserId]++;
  }

  const passSet = new Set(passes.map(p => p.userId));
  return { accountants, distributions, counts, passUserIds: [...passSet] };
}

export async function toggleTaehoPass(userId: number, clientType: string) {
  await requireAuth();
  const ct = prefixed(clientType);

  const existing = await prisma.distributionPass.findUnique({
    where: { userId_clientType: { userId, clientType: ct } },
  });

  if (existing) {
    await prisma.distributionPass.delete({ where: { id: existing.id } });
  } else {
    await prisma.distributionPass.create({ data: { userId, clientType: ct } });
  }

  revalidatePath("/distribution-taeho");
}

export async function addTaehoDistribution(
  clientNames: string[],
  clientType: string,
  forceUserId?: number,
) {
  await requireAuth();
  const ct = prefixed(clientType);
  const names = clientNames.filter((n) => n.trim());
  if (names.length === 0) return;

  const accountants = await getAccountants();
  if (accountants.length === 0) throw new Error("배정 가능한 세무사가 없습니다");

  if (forceUserId) {
    const batchId = `${Date.now()}`;
    for (const name of names) {
      await prisma.distribution.create({
        data: { clientName: name.trim(), clientType: ct, assignedUserId: forceUserId, batchId },
      });
    }
    revalidatePath("/distribution-taeho");
    return;
  }

  const passes = await prisma.distributionPass.findMany({ where: { clientType: ct } });
  const passSet = new Set(passes.map(p => p.userId));

  const allExisting = await prisma.distribution.findMany({
    where: { clientType: ct },
    select: { assignedUserId: true },
  });

  const totalRows: Record<number, number> = {};
  for (const a of accountants) totalRows[a.id] = 0;
  for (const e of allExisting) {
    if (totalRows[e.assignedUserId] !== undefined) totalRows[e.assignedUserId]++;
  }

  const batchId = `${Date.now()}`;
  let minRows = Infinity;
  for (const a of accountants) {
    if (totalRows[a.id] < minRows) minRows = totalRows[a.id];
  }
  const nextPerson = accountants.find(a => totalRows[a.id] === minRows);
  if (!nextPerson) throw new Error("배정 대상을 찾을 수 없습니다");

  if (passSet.has(nextPerson.id)) {
    await prisma.distribution.create({
      data: { clientName: "PASS", clientType: ct, assignedUserId: nextPerson.id, isSkipped: true, batchId },
    });
    totalRows[nextPerson.id]++;

    let found = false;
    for (let i = 0; i < accountants.length; i++) {
      let newMin = Infinity;
      for (const a of accountants) {
        if (totalRows[a.id] < newMin) newMin = totalRows[a.id];
      }
      const candidate = accountants.find(a => totalRows[a.id] === newMin);
      if (!candidate) break;

      if (passSet.has(candidate.id)) {
        await prisma.distribution.create({
          data: { clientName: "PASS", clientType: ct, assignedUserId: candidate.id, isSkipped: true, batchId },
        });
        totalRows[candidate.id]++;
      } else {
        for (const name of names) {
          await prisma.distribution.create({
            data: { clientName: name.trim(), clientType: ct, assignedUserId: candidate.id, batchId },
          });
        }
        found = true;
        break;
      }
    }
    if (!found) throw new Error("모든 세무사가 PASS 상태입니다");
  } else {
    for (const name of names) {
      await prisma.distribution.create({
        data: { clientName: name.trim(), clientType: ct, assignedUserId: nextPerson.id, batchId },
      });
    }
  }

  revalidatePath("/distribution-taeho");
}

export async function deleteTaehoDistribution(id: number, reason?: string) {
  await requireAuth();
  const item = await prisma.distribution.findUnique({ where: { id } });
  if (!item) return;

  if (item.isSkipped) {
    await prisma.distribution.delete({ where: { id } });
  } else {
    await prisma.distribution.update({
      where: { id },
      data: { clientType: `excluded_${item.clientType}`, excludeReason: reason || null },
    });
  }
  revalidatePath("/distribution-taeho");
}

export async function getTaehoExcludedData() {
  await requireAuth();
  const accountants = await getAccountants();
  const distributions = await prisma.distribution.findMany({
    where: { clientType: { startsWith: "excluded_taeho_" } },
    include: { assignedUser: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { accountants, distributions };
}

export async function permanentDeleteTaehoDistribution(id: number) {
  await requireAuth();
  await prisma.distribution.delete({ where: { id } });
  revalidatePath("/distribution-taeho");
}

export async function restoreTaehoDistribution(id: number) {
  await requireAuth();
  const item = await prisma.distribution.findUnique({ where: { id } });
  if (!item) return;
  const originalType = item.clientType.replace("excluded_", "");
  await prisma.distribution.update({ where: { id }, data: { clientType: originalType } });
  revalidatePath("/distribution-taeho");
}
