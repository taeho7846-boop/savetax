import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/export-labor-clients → 근로소득 거래처 JSON 반환
// ?search=이름 으로 특정 거래처 검색 가능
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search");

  if (search) {
    // 검색 모드: 이름으로 찾기
    const clients = await prisma.client.findMany({
      where: { name: { contains: search }, isDeleted: false },
      select: { id: true, name: true, bizNumber: true, laborTypes: true, assignedUserId: true },
    });
    return NextResponse.json(clients);
  }

  // 근로소득 거래처 전체
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      OR: [
        { laborTypes: { contains: "근로소득" } },
        { withholdingLaborOverrides: { some: { laborTypes: { contains: "근로소득" } } } },
      ],
    },
    select: { id: true, name: true, bizNumber: true, laborTypes: true },
  });

  return NextResponse.json(clients);
}
