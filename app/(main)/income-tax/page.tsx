import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IncomeTaxTable } from "./IncomeTaxTable";

export default async function IncomeTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const taxYear = params.year || String(new Date().getFullYear() - 1);

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
      clientType: { not: "corporate" },
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      clientType: true,
      incomeTaxRecords: {
        where: { taxYear },
      },
    },
    orderBy: { name: "asc" },
  });

  // BigInt → string 변환 (JSON 직렬화용)
  const serialized = clients.map(c => ({
    ...c,
    incomeTaxRecords: c.incomeTaxRecords.map(r => ({
      ...r,
      prevSales: r.prevSales?.toString() ?? null,
      prevIncome: r.prevIncome?.toString() ?? null,
      prevTax: r.prevTax?.toString() ?? null,
      currSales: r.currSales?.toString() ?? null,
      currIncome: r.currIncome?.toString() ?? null,
      currTax: r.currTax?.toString() ?? null,
    })),
  }));

  return (
    <div className="flex flex-col h-full">
      <IncomeTaxTable clients={serialized} taxYear={taxYear} />
    </div>
  );
}
