"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getClientScopeWhere } from "@/lib/client-scope";
import { revalidatePath } from "next/cache";

/** 성실신고 업종 그룹 수동 지정 (A/B/C, null 이면 자동 추정으로 되돌림) — 내 권한 범위의 거래처만 */
export async function setSincereGroup(clientId: number, group: "A" | "B" | "C" | null) {
  const session = await requireAuth();
  if (session.role === "readonly") throw new Error("권한이 없습니다");
  const scope = await getClientScopeWhere(session);
  const found = await prisma.client.findFirst({ where: { ...scope, id: clientId }, select: { id: true } });
  if (!found) throw new Error("거래처를 찾을 수 없거나 권한 범위 밖입니다");
  await prisma.client.update({ where: { id: clientId }, data: { sincereGroup: group } });
  revalidatePath("/clients/insights");
}
