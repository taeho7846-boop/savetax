import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 일괄 수집 진행 중 각 서류의 수집 완료(status/updatedAt 변화)를 폴링하기 위한 조회용 엔드포인트.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = Number(searchParams.get("clientId"));
  const taxYear = searchParams.get("taxYear") || "";
  if (!clientId || !taxYear) {
    return NextResponse.json({ error: "clientId, taxYear 필요" }, { status: 400 });
  }

  const rows = await prisma.dataCollection.findMany({
    where: { clientId, taxYear },
    select: { docType: true, status: true, updatedAt: true, params: true },
  });
  return NextResponse.json(
    rows.map(r => {
      let markAt: string | null = null;
      if (r.params) {
        try {
          const p = JSON.parse(r.params);
          if (typeof p._markAt === "string") markAt = p._markAt;
        } catch {}
      }
      return { docType: r.docType, status: r.status, updatedAt: r.updatedAt.toISOString(), markAt };
    })
  );
}
