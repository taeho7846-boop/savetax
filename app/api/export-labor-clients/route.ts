import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/export-labor-clients → 근로소득 또는 사업소득 거래처 JSON 반환
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search");

  if (search) {
    const clients = await prisma.client.findMany({
      where: { name: { contains: search }, isDeleted: false },
      select: { id: true, name: true, bizNumber: true, laborTypes: true, assignedUserId: true },
    });
    return NextResponse.json(clients);
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
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
