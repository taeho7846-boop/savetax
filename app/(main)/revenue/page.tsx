import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RevenueChart } from "./RevenueChart";

export default async function RevenuePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // 사무실 수익 — 세무사(매니저)는 본인 + 소속 직원 담당 거래처 전부.
  // 사수가 직원이어도 수익은 세무사 귀속이므로 팀 전체를 집계한다.
  const isAll = session.role === "readonly";
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: { assignedUserId: number | { in: number[] } } = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map((e) => e.id)] } };
  }
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(!isAll && assignedFilter),
    },
    select: {
      name: true,
      monthlyFee: true,
      freeMonths: true,
      firstWithdrawalMonth: true,
      affiliation: true,
      contractStatus: true,
      terminationMonth: true,
      assignedUserId: true,
      assignedUser: { select: { name: true } },
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="mb-5">
        <div className="text-[12.5px] text-[#86868b] font-medium">월별·세목별 수익 분석</div>
        <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">수익 추이</h1>
      </div>
      <RevenueChart clients={clients} />
    </div>
  );
}
