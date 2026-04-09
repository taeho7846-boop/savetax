import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/import-wehago-info — 수집 데이터를 DB에 반영
export async function POST(req: NextRequest) {
  const { data } = await req.json() as {
    data: { id: number; bizNumber: string; cno: string; cdCom: string; colors?: string }[];
  };

  let updated = 0;
  for (const row of data) {
    const updateData: any = { wehagoCno: row.cno, wehagoCdCom: row.cdCom };
    if (row.colors) updateData.wehagoColors = row.colors;

    // id로 업데이트
    if (row.id && row.id > 0) {
      try {
        await prisma.client.update({ where: { id: row.id }, data: updateData });
        updated++;
        continue;
      } catch {}
    }

    // 사업자번호로 매칭
    if (row.bizNumber) {
      const rowBiz = row.bizNumber.replace(/[^0-9]/g, "");
      const clients = await prisma.client.findMany({
        where: { isDeleted: false },
        select: { id: true, bizNumber: true },
      });
      for (const client of clients) {
        const dbBiz = client.bizNumber?.replace(/[^0-9]/g, "") ?? "";
        if (dbBiz && dbBiz === rowBiz) {
          await prisma.client.update({ where: { id: client.id }, data: updateData });
          updated++;
          break;
        }
      }
    }
  }

  return NextResponse.json({ success: true, updated });
}
