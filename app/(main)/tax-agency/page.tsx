import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientCreateButton } from "@/app/(main)/clients/ClientCreateModal";
import { ClientsTable } from "@/app/(main)/clients/ClientsTable";

export default async function TaxAgencyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
      taxTypes: { contains: "신고대리" },
    },
    select: {
      id: true,
      name: true,
      bizNumber: true,
      ceoName: true,
      residentNumber: true,
      phone: true,
      clientType: true,
      taxTypes: true,
      laborTypes: true,
      hometaxId: true,
      hometaxPw: true,
      monthlyFee: true,
      driveFolderId: true,
      withholdingType: true,
      accountingProgram: true,
      contactMethod: true,
      affiliation: true,
      contractDate: true,
      myboxLink: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">신고대리</h1>
        <ClientCreateButton />
      </div>
      <ClientsTable
        clients={clients}
        hideCols={["labor", "monthlyFee", "affiliation", "contractDate"]}
      />
    </div>
  );
}
