import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithholdingTable } from "./WithholdingTable";
import { WithholdingRedirect } from "./WithholdingRedirect";

export default async function WithholdingPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  // ym 파라미터가 없으면 클라이언트에서 localStorage 확인 후 리다이렉트
  if (!params.ym) {
    const now = new Date();
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // 클라이언트 리다이렉트 컴포넌트 반환
    return <WithholdingRedirect fallback={fallback} />;
  }
  const yearMonth = params.ym;

  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  // 직원: 본인이 사수(담당)이거나 부사수(서브)인 거래처
  let assignedFilter: any = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
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
      AND: [
        assignedFilter,
        { OR: [{ taxTypes: null }, { NOT: { taxTypes: { contains: "신고대리" } } }] },
      ],
    },
    select: {
      id: true,
      name: true,
      laborTypes: true,
      halfYearTax: true,
      accountingProgram: true,
      withholdingType: true,
      assignedUser: isManager ? { select: { name: true } } : undefined,
      withholdingRecords: {
        where: { yearMonth },
      },
      wehagoCno: true,
      wehagoCdCom: true,
      wehagoColors: true,
      withholdingLaborOverrides: {
        where: { yearMonth },
        select: { laborTypes: true, memo: true },
      },
    },
    orderBy: [{ withholdingType: "asc" }, { name: "asc" }],
  });

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoTaxNum: true },
  });

  return (
    <div>
      <WithholdingTable clients={clients} yearMonth={yearMonth} showAssignedUser={isManager} wehagoCompanyId={settings?.wehagoId || ""} wehagoTaxNum={settings?.wehagoTaxNum || ""} />
    </div>
  );
}
