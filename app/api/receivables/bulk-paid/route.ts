import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIds, yearMonth } = await req.json();
  if (!clientIds?.length || !yearMonth) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  for (const clientId of clientIds) {
    await prisma.feeRecord.upsert({
      where: { clientId_yearMonth: { clientId, yearMonth } },
      update: { status: "paid" },
      create: { clientId, yearMonth, status: "paid" },
    });
  }

  return NextResponse.json({ success: true, count: clientIds.length });
}
