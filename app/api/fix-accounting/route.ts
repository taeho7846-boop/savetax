import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await prisma.client.updateMany({
    where: { isDeleted: false },
    data: { accountingProgram: "위하고" },
  });
  return NextResponse.json({ updated: result.count });
}
