import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WithholdingTable } from "./WithholdingTable";
import { cookies } from "next/headers";

export default async function WithholdingPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  // ym 파라미터가 없으면 마지막으로 본 월(쿠키, WithholdingTable이 저장) → 없으면 이번 달.
  // 예전엔 빈 화면을 띄운 뒤 클라이언트에서 localStorage를 읽어 한 번 더 이동했는데(깜빡임),
  // 서버에서 바로 결정해 한 번에 그린다.
  const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  let yearMonth = params.ym && YM_RE.test(params.ym) ? params.ym : "";
  if (!yearMonth) {
    const saved = (await cookies()).get("withholding_ym")?.value;
    if (saved && YM_RE.test(saved)) {
      yearMonth = saved;
    } else {
      const now = new Date();
      yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
  }

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
      withholdingNote: true,
      skipDailyWorkReport: true,
      driveFolderId: true,
      openDate: true, // 과거 인건비 일괄 수집: 위하고 기수(gisu) 계산용
      assignedUser: { select: { name: true } },
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
      // 위하고 마감상태·홈택스/위택스 제출 결과 (원천세 자동신고)
      withholdingFilings: {
        where: { yearMonth },
        select: { kind: true, closed: true, amount: true, reportType: true, attribYm: true, status: true, receiptNo: true, fileName: true, checkedAt: true },
      },
    },
    orderBy: [{ withholdingType: "asc" }, { name: "asc" }],
  });

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoTaxNum: true },
  });

  // 세무사번호(taxNum)가 본인 설정에 없으면 소속 세무사(매니저)의 값을 사용
  // (사무실 공통 번호인데 설정 페이지에 입력칸이 없어 직원 계정은 비어있는 경우가 많음)
  let wehagoTaxNum = settings?.wehagoTaxNum || "";
  if (!wehagoTaxNum) {
    const me = await prisma.user.findUnique({ where: { id: session.id }, select: { managerId: true } });
    if (me?.managerId) {
      const mgrSettings = await prisma.settings.findUnique({
        where: { userId: me.managerId },
        select: { wehagoTaxNum: true },
      });
      wehagoTaxNum = mgrSettings?.wehagoTaxNum || "";
    }
  }

  return (
    <div>
      <WithholdingTable clients={clients} yearMonth={yearMonth} showAssignedUser wehagoCompanyId={settings?.wehagoId || ""} wehagoTaxNum={wehagoTaxNum} />
    </div>
  );
}
