import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!clientId) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const client = await prisma.client.findUnique({
    where: { id: clientId, isDeleted: false },
    include: {
      assignedUser: { select: { id: true, name: true } },
    },
  });

  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 권한 체크: 내 고객사 또는 readonly role
  if (session.role !== "readonly" && session.role !== "owner" && session.role !== "admin") {
    if (client.assignedUserId !== session.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ client });
}
