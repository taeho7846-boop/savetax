import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithholdingTable } from "./WithholdingTable";

export default async function WithholdingPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const defaultMonth = now.getDate() <= 10
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : now;
  const yearMonth = params.ym || `${defaultMonth.getFullYear()}-${String(defaultMonth.getMonth() + 1).padStart(2, "0")}`;

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

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      laborTypes: true,
      halfYearTax: true,
      accountingProgram: true,
      withholdingType: true,
      assignedUser: isManager ? { select: { name: true } } : undefined,
      withholdingRecords: {
        where: { yearMonth },
      },
      wehagoCno: true,
      wehagoCdCom: true,
      wehagoColor: true,
      withholdingLaborOverrides: {
        where: { yearMonth },
        select: { laborTypes: true, memo: true },
      },
    },
    orderBy: [{ withholdingType: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col h-full">
      <WithholdingTable clients={clients} yearMonth={yearMonth} showAssignedUser={isManager} />
    </div>
  );
}
