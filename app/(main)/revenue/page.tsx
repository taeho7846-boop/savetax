import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RevenueChart } from "./RevenueChart";

export default async function RevenuePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // 본인 거래처만 (관리자/readonly는 전체)
  const isAll = session.role === "readonly";
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(!isAll && { assignedUserId: session.id }),
    },
    select: {
      name: true,
      monthlyFee: true,
      freeMonths: true,
      firstWithdrawalMonth: true,
      affiliation: true,
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
      <RevenueChart clients={clients} currentUserId={session.id} />
    </div>
  );
}
