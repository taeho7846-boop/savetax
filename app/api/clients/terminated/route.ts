import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 해지(계약종료) 거래처 목록 — 휴지통과 별개. 데이터는 보존됨.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  // 기장대리 목록과 동일 범위 (본인 + 소속 직원)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: { not: "active" },
      ...assignedFilter,
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      ceoName: true,
      bizNumber: true,
      clientType: true,
      monthlyFee: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clients);
}
