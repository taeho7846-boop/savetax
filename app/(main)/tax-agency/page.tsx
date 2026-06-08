import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientCreateButton } from "@/app/(main)/clients/ClientCreateModal";
import { ClientsTable } from "@/app/(main)/clients/ClientsTable";

export default async function TaxAgencyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

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
      contractStatus: "active",
      ...assignedFilter,
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
      assignedUser: isManager ? { select: { name: true } } : undefined,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">부가세 · 원천세 · 종소세 · 법인세</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">신고 대리 · {clients.length}건</h1>
        </div>
        <ClientCreateButton />
      </div>
      <ClientsTable
        clients={clients}
        showAssignedUser={isManager}
        hideCols={["labor", "monthlyFee", "affiliation", "contractDate"]}
      />
    </div>
  );
}
