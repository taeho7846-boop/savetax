"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ntsTaxCodeToTaxationType } from "@/lib/nts-biz";

/**
 * 국세청 변동 알림 처리.
 * - apply: 거래처 등록값을 국세청 값으로 바꾼다 (과세유형 불일치 → taxationType 갱신, 폐업 → taxationType "폐업")
 *   ※ 계약 해지(contractStatus)는 건드리지 않는다 — 해지 처리는 기존 해지 절차대로.
 * - dismiss: 확인만 하고 닫는다. 같은 내용은 다음 점검에서 다시 띄우지 않는다.
 */
export async function resolveNtsAlert(id: number, action: "apply" | "dismiss") {
  const session = await requireAuth();
  const alert = await prisma.ntsAlert.findUnique({ where: { id } });
  if (!alert) throw new Error("알림을 찾을 수 없습니다.");
  if (alert.resolvedAt) return { ok: true };

  if (action === "apply") {
    let taxationType: string | null = null;
    if (alert.kind === "taxType") taxationType = ntsTaxCodeToTaxationType(alert.afterCode);
    else if (alert.kind === "status" && alert.afterCode === "03") taxationType = "폐업";
    if (!taxationType) throw new Error("이 알림은 반영할 값이 없습니다. '확인'으로 닫아주세요.");
    await prisma.client.update({ where: { id: alert.clientId }, data: { taxationType } });
  }

  await prisma.ntsAlert.update({
    where: { id },
    data: { resolvedAt: new Date(), resolution: action === "apply" ? "applied" : "dismissed", resolvedByUserId: session.id },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true };
}
