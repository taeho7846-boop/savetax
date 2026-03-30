import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RevenueChart } from "./RevenueChart";

export default async function RevenuePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // 세이브택스 소속 거래처 중 최초출금월 + 기장료가 있는 거래처
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      affiliation: "세이브택스",
      monthlyFee: { not: null },
      firstWithdrawalMonth: { not: null },
    },
    select: {
      name: true,
      monthlyFee: true,
      freeMonths: true,
      firstWithdrawalMonth: true,
      assignedUserId: true,
      assignedUser: { select: { name: true } },
    },
  });

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-bold text-gray-800 mb-6">수익추이</h1>
      <RevenueChart clients={clients} currentUserId={session.id} />
    </div>
  );
}
