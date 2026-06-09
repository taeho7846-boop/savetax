import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TerminationList, type TerminationRow } from "./TerminationList";

export const dynamic = "force-dynamic";

export default async function TerminationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isReadonly = session.role === "readonly";
  const isManager =
    session.role === "accountant" || session.role === "admin" || session.role === "owner";

  // 거래처 페이지와 동일한 담당자 범위 적용
  let assignedFilter: { assignedUserId?: number | { in: number[] }; affiliation?: string } = {
    assignedUserId: session.id,
  };
  if (isReadonly) {
    assignedFilter = { affiliation: "세이브택스" };
  } else if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map((e) => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 해지(계약종료)된 기장대리 거래처 — 순수 신고대리는 제외 (기존 해지거래처 기준과 동일)
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: { not: "active" },
      ...assignedFilter,
      OR: [{ taxTypes: null }, { NOT: { taxTypes: { contains: "신고대리" } } }],
    },
    include: {
      termination: true,
      assignedUser: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: TerminationRow[] = clients.map((c) => {
    const t = c.termination;
    return {
      id: c.id,
      name: c.name,
      ceoName: c.ceoName,
      bizNumber: c.bizNumber,
      clientType: c.clientType,
      monthlyFee: c.monthlyFee,
      cmsStatus: c.cmsStatus,
      laborTypes: c.laborTypes,
      assignedName: c.assignedUser?.name ?? null,
      startedAt: (t?.startedAt ?? c.updatedAt).toISOString(),
      reason: t?.reason ?? null,
      notes: t?.notes ?? null,
      completedAt: t?.completedAt ? t.completedAt.toISOString() : null,
      ediPensionDone: t?.ediPensionDone ?? false,
      ediHealthDone: t?.ediHealthDone ?? false,
      ediEmploymentDone: t?.ediEmploymentDone ?? false,
      cmsTerminated: t?.cmsTerminated ?? false,
      hometaxTerminated: t?.hometaxTerminated ?? false,
      closureVat: t?.closureVat ?? "na",
      feeSeparate: t?.feeSeparate ?? false,
      feeAmount: t?.feeAmount ?? null,
      feePaid: t?.feePaid ?? false,
    };
  });

  return <TerminationList rows={rows} readonly={isReadonly} />;
}
