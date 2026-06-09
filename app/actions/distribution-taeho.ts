"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sendSlackDM } from "@/lib/slack";

// 활성 거래처(기장대리 탭)에 없는 배분 항목 표시용 (dismissed 항목은 missing 표시 제외)
async function annotateMissingClients<T extends { clientName: string; isSkipped: boolean; clientMissingDismissedAt: Date | null }>(
  distributions: T[],
): Promise<(T & { isClientMissing: boolean })[]> {
  const activeClients = await prisma.client.findMany({
    where: { isDeleted: false },
    select: { name: true },
  });
  const activeNameSet = new Set(activeClients.map((c) => c.name));
  return distributions.map((d) => ({
    ...d,
    isClientMissing:
      !d.isSkipped &&
      !d.clientMissingDismissedAt &&
      d.clientName !== "PASS" &&
      d.clientName !== "-" &&
      !activeNameSet.has(d.clientName),
  }));
}

async function notifyDistribution(assignedUserId: number, clientNames: string[], clientType: string) {
  try {
    const settings = await prisma.settings.findUnique({ where: { userId: assignedUserId }, select: { slackDistributionEnabled: true } });
    if (settings?.slackDistributionEnabled === false) return;
    const slackUser = await prisma.slackUser.findFirst({ where: { userId: assignedUserId } });
    if (!slackUser) return;
    const user = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { name: true } });
    const typeLabel = clientType.includes("corporate") ? "법인" : "개인";
    const lines = [
      `🆕 *${user?.name}님, 새 거래처가 배분되었습니다!*`,
      "",
      `📋 *${typeLabel}* ${clientNames.length}건`,
      ...clientNames.map(n => `  • ${n}`),
      "",
      "배분 현황은 홈페이지에서 확인해주세요!",
    ];
    await sendSlackDM(slackUser.slackId, lines.join("\n"));
  } catch (e) {
    console.error("[Slack 배분 알림 실패]", e);
  }
}

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
  const annotated = await annotateMissingClients(distributions);
  return { accountants, distributions: annotated, counts, passUserIds: [...passSet] };
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

// 키맞추기(녹색 PASS) 블럭 직접 추가 — 배분 순서를 동일 선상으로 맞추기 위함
export async function addTaehoPassBlock(userId: number, clientType: string) {
  await requireAuth();
  const ct = prefixed(clientType);
  await prisma.distribution.create({
    data: {
      clientName: "키맞추기",
      clientType: ct,
      assignedUserId: userId,
      isSkipped: true,
      batchId: `level-${Date.now()}`,
    },
  });
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
    await notifyDistribution(forceUserId, names, ct);
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
        await notifyDistribution(candidate.id, names, ct);
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
    await notifyDistribution(nextPerson.id, names, ct);
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
  const annotated = await annotateMissingClients(distributions);
  return { accountants, distributions: annotated };
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

// 세이브택스 배분에서 김태호에게 배분됐지만 세무회계태호에 아직 없는 거래처 조회
export async function getUnassignedFromSavetax(clientType: string) {
  await requireAuth();
  const ct = prefixed(clientType);

  // 김태호 ID
  const taeho = await prisma.user.findFirst({ where: { name: "김태호", isActive: true } });
  if (!taeho) return [];

  // 세이브택스에서 김태호에게 배분된 거래처 (PASS/제외 제외)
  const savetaxItems = await prisma.distribution.findMany({
    where: { clientType, assignedUserId: taeho.id, isSkipped: false },
    select: { clientName: true },
  });

  // 세무회계태호에 이미 있는 거래처
  const taehoItems = await prisma.distribution.findMany({
    where: { clientType: { in: [ct, `excluded_${ct}`] } },
    select: { clientName: true },
  });
  const existing = new Set(taehoItems.map(d => d.clientName));

  return savetaxItems
    .filter(d => !existing.has(d.clientName))
    .map(d => d.clientName);
}

// 드래그 배정: 세이브택스에서 온 거래처를 세무회계태호의 특정 담당자에게 배정
export async function assignFromSavetax(clientName: string, clientType: string, userId: number) {
  await requireAuth();
  const ct = prefixed(clientType);

  await prisma.distribution.create({
    data: { clientName, clientType: ct, assignedUserId: userId, batchId: `drag_${Date.now()}` },
  });

  await notifyDistribution(userId, [clientName], ct);
  revalidatePath("/distribution-taeho");
}
