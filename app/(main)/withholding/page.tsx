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
  const yearMonth = params.ym || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
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
      withholdingRecords: {
        where: { yearMonth },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <WithholdingTable clients={clients} yearMonth={yearMonth} />
    </div>
  );
}
