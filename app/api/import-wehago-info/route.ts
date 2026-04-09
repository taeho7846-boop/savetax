import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/import-wehago-info — 수집 데이터를 DB에 반영 (사업자번호 매칭)
export async function POST(req: NextRequest) {
  const { data } = await req.json() as {
    data: { bizNumber: string; cno: string; cdCom: string; colors?: string }[];
  };

  // 전체 거래처 한번만 조회
  const allClients = await prisma.client.findMany({
    where: { isDeleted: false },
    select: { id: true, bizNumber: true },
  });

  let updated = 0;
  for (const row of data) {
    if (!row.bizNumber || !row.cno) continue;

    const updateData: any = { wehagoCno: row.cno, wehagoCdCom: row.cdCom };
    if (row.colors) updateData.wehagoColors = row.colors;

    const rowBiz = row.bizNumber.replace(/[^0-9]/g, "");
    const match = allClients.find(c => c.bizNumber?.replace(/[^0-9]/g, "") === rowBiz);
    if (match) {
      await prisma.client.update({ where: { id: match.id }, data: updateData });
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}
