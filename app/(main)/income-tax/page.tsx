import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IncomeTaxTable } from "./IncomeTaxTable";

export default async function IncomeTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const taxYear = params.year || String(new Date().getFullYear() - 1);
  const activeTab = params.tab === "single" ? "single" : "bookkeeping";

  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 기장: 신고대리가 아닌 고객사 / 단건: 신고대리 고객사
  const taxTypeFilter =
    activeTab === "single"
      ? { taxTypes: { contains: "신고대리" } }
      : {
          OR: [
            { taxTypes: null },
            { NOT: { taxTypes: { contains: "신고대리" } } },
          ],
        };

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      clientType: { not: "corporate" },
      ...taxTypeFilter,
    },
    select: {
      id: true,
      name: true,
      clientType: true,
      ceoName: true,
      residentNumber: true,
      bizCategory: true,
      assignedUser: isManager ? { select: { name: true } } : undefined,
      incomeTaxRecords: {
        where: { taxYear },
      },
    },
    orderBy: [{ ceoName: "asc" }, { name: "asc" }],
  });

  // BigInt → string 변환 (JSON 직렬화용)
  // 업종코드별 감면 판단 조회
  const bizCodes = [...new Set(clients.map(c => c.bizCategory).filter(Boolean))] as string[];
  const reductionCodes = bizCodes.length > 0
    ? await prisma.taxReductionCode.findMany({ where: { bizCode: { in: bizCodes } }, select: { bizCode: true, startupReduction: true, smeReduction: true } })
    : [];
  const reductionMap = new Map(reductionCodes.map(r => [r.bizCode, r]));

  // 같은 대표자(이름+주민등록번호)끼리 묶어서 정렬
  const grouped = [...clients].sort((a, b) => {
    const keyA = (a.ceoName || "") + (a.residentNumber || "");
    const keyB = (b.ceoName || "") + (b.residentNumber || "");
    if (keyA !== keyB) return keyA.localeCompare(keyB, "ko");
    return a.name.localeCompare(b.name, "ko");
  });

  const serialized = grouped.map(({ assignedUser, ...c }) => {
    const reduction = c.bizCategory ? reductionMap.get(c.bizCategory) : undefined;
    return {
    ...c,
    assignedUserName: assignedUser?.name ?? null,
    aiStartupReduction: reduction?.startupReduction ?? null,
    aiSmeReduction: reduction?.smeReduction ?? null,
    incomeTaxRecords: c.incomeTaxRecords.map(r => ({
      ...r,
      prevSales: r.prevSales?.toString() ?? null,
      prevIncome: r.prevIncome?.toString() ?? null,
      prevTax: r.prevTax?.toString() ?? null,
      currSales: r.currSales?.toString() ?? null,
      currIncome: r.currIncome?.toString() ?? null,
      currTax: r.currTax?.toString() ?? null,
      adjustmentFee: r.adjustmentFee?.toString() ?? null,
    })),
  };
  });

  return (
    <div className="flex flex-col h-full">
      <IncomeTaxTable clients={serialized} taxYear={taxYear} showAssignedUser={isManager} activeTab={activeTab} />
    </div>
  );
}
