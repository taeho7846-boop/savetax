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

  // 세무사별 실제 배분 수 (PASS 제외)
  const counts: Record<number, number> = {};
  for (const a of accountants) counts[a.id] = 0;
  for (const d of distributions) {
    if (!d.isSkipped && counts[d.assignedUserId] !== undefined) counts[d.assignedUserId]++;
  }

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

  // 현재 세무사별 총 행 수 (PASS 포함) → 라운드 로빈 순서 결정
  const allExisting = await prisma.distribution.findMany({
    where: { clientType },
    select: { assignedUserId: true },
  });

  const totalRows: Record<number, number> = {};
  for (const a of accountants) totalRows[a.id] = 0;
  for (const e of allExisting) {
    if (totalRows[e.assignedUserId] !== undefined) totalRows[e.assignedUserId]++;
  }

  // 다음 차례 찾기: 총 행 수가 가장 적은 사람
  const batchId = `${Date.now()}`;

  // 차례인 사람 찾기
  let minRows = Infinity;
  for (const a of accountants) {
    if (totalRows[a.id] < minRows) minRows = totalRows[a.id];
  }
  const nextPerson = accountants.find(a => totalRows[a.id] === minRows);
  if (!nextPerson) throw new Error("배정 대상을 찾을 수 없습니다");

  // 차례인 사람이 PASS ON이면 → PASS 기록하고, 다음 사람에게 배정
  if (passSet.has(nextPerson.id)) {
    // PASS 기록
    await prisma.distribution.create({
      data: {
        clientName: "PASS",
        clientType,
        assignedUserId: nextPerson.id,
        isSkipped: true,
        batchId,
      },
    });
    totalRows[nextPerson.id]++;

    // 다시 다음 차례 찾기 (PASS인 사람 연속 건너뛰기)
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
          data: {
            clientName: "PASS",
            clientType,
            assignedUserId: candidate.id,
            isSkipped: true,
            batchId,
          },
        });
        totalRows[candidate.id]++;
      } else {
        // 이 사람에게 배정
        for (const name of names) {
          await prisma.distribution.create({
            data: {
              clientName: name.trim(),
              clientType,
              assignedUserId: candidate.id,
              batchId,
            },
          });
        }
        found = true;
        break;
      }
    }

    if (!found) throw new Error("모든 세무사가 PASS 상태입니다");
  } else {
    // 차례인 사람에게 바로 배정
    for (const name of names) {
      await prisma.distribution.create({
        data: {
          clientName: name.trim(),
          clientType,
          assignedUserId: nextPerson.id,
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
