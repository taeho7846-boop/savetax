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
  // 매월 10일까지는 전월 원천세 업무 기간이므로 전월을 기본 표시
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
        { laborTypes: { contains: "근로소득" } },
        { laborTypes: { contains: "사업소득" } },
        { laborTypes: { contains: "일용직" } },
      ],
    },
    select: {
      id: true,
      name: true,
      laborTypes: true,
      halfYearTax: true,
      accountingProgram: true,
      notes: true,
      assignedUser: isManager ? { select: { name: true } } : undefined,
      withholdingRecords: {
        where: { yearMonth },
      },
      withholdingLaborOverrides: {
        where: { yearMonth },
        select: { laborTypes: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <WithholdingTable clients={clients} yearMonth={yearMonth} showAssignedUser={isManager} />
    </div>
  );
}
