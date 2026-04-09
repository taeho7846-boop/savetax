import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/wehago-credentials → 현재 로그인 사용자의 위하고 ID/PW
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const settings = await prisma.settings.findUnique({
    where: { userId: session.id },
    select: { wehagoId: true, wehagoPw: true },
  });

  return NextResponse.json({
    wehagoId: settings?.wehagoId ?? "",
    wehagoPw: settings?.wehagoPw ?? "",
  });
}
