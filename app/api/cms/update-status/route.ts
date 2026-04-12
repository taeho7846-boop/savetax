import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, status } = await req.json();
  if (!clientId || !["none", "pending", "done"].includes(status)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { cmsStatus: status },
  });

  return NextResponse.json({ success: true });
}
