import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProcessBoard } from "./ProcessBoard";

export default async function WithholdingProcessPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const defaultMonth =
    now.getDate() <= 10
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
      : now;
  const yearMonth =
    params.ym ||
    `${defaultMonth.getFullYear()}-${String(defaultMonth.getMonth() + 1).padStart(2, "0")}`;

  const isManager =
    session.role === "accountant" ||
    session.role === "admin" ||
    session.role === "owner";

  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map((e) => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 원천세 유형이 지정된 거래처만 가져오기
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      withholdingType: { not: null },
    },
    select: {
      id: true,
      name: true,
      withholdingType: true,
      withholdingDNotified: true,
      laborTypes: true,
      assignedUser: { select: { name: true } },
      withholdingProcesses: {
        where: { yearMonth },
      },
    },
    orderBy: [{ withholdingType: "asc" }, { name: "asc" }],
  });

  // 유형 미지정이지만 인건비가 있는 거래처 수 (안내용)
  const unclassifiedCount = await prisma.client.count({
    where: {
      isDeleted: false,
      ...assignedFilter,
      withholdingType: null,
      OR: [
        { laborTypes: { contains: "근로소득" } },
        { laborTypes: { contains: "사업소득" } },
        { laborTypes: { contains: "일용직" } },
        { laborTypes: { contains: "1인사업자" } },
      ],
    },
  });

  return (
    <div className="flex flex-col h-full">
      <ProcessBoard
        clients={clients}
        yearMonth={yearMonth}
        showAssignedUser={isManager}
        unclassifiedCount={unclassifiedCount}
      />
    </div>
  );
}
