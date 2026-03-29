import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithholdingTable } from "./WithholdingTable";

export default async function WithholdingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
      laborTypes: {
        not: null,
      },
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
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">원천세</h1>
        <span className="text-sm text-gray-500">{clients.length}건</span>
      </div>

      <WithholdingTable clients={clients} />
    </div>
  );
}
