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
      assignedUser: isManager ? { select: { name: true } } : undefined,
      incomeTaxRecords: {
        where: { taxYear },
      },
    },
    orderBy: { name: "asc" },
  });

  // BigInt → string 변환 (JSON 직렬화용)
  const serialized = clients.map(({ assignedUser, ...c }) => ({
    ...c,
    assignedUserName: assignedUser?.name ?? null,
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
  }));

  return (
    <div className="flex flex-col h-full">
      <IncomeTaxTable clients={serialized} taxYear={taxYear} showAssignedUser={isManager} activeTab={activeTab} />
    </div>
  );
}
