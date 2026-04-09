import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/export-labor-clients → 로그인한 사용자의 근로소득/사업소득 거래처
export async function GET(req: NextRequest) {
  const session = await getSession();

  const search = req.nextUrl.searchParams.get("search");

  if (search) {
    const clients = await prisma.client.findMany({
      where: { name: { contains: search }, isDeleted: false },
      select: { id: true, name: true, bizNumber: true, laborTypes: true, assignedUserId: true },
    });
    return NextResponse.json(clients);
  }

  // 사용자 필터 (매니저면 부하직원 포함)
  let assignedFilter: any = {};
  if (session) {
    const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
    if (isManager) {
      const employees = await prisma.user.findMany({
        where: { managerId: session.id, isActive: true },
        select: { id: true },
      });
      const userIds = [session.id, ...employees.map((e) => e.id)];
      assignedFilter = { assignedUserId: { in: userIds } };
    } else {
      assignedFilter = { assignedUserId: session.id };
    }
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      OR: [
        { laborTypes: { contains: "근로소득" } },
        { laborTypes: { contains: "사업소득" } },
        { withholdingLaborOverrides: { some: { laborTypes: { contains: "근로소득" } } } },
        { withholdingLaborOverrides: { some: { laborTypes: { contains: "사업소득" } } } },
      ],
    },
    select: { id: true, name: true, bizNumber: true, laborTypes: true, wehagoCno: true },
  });

  return NextResponse.json(clients);
}
